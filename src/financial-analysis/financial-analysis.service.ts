import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { FinancialRatiosGenerator, type Ratio } from '../reports/generators/financial-ratios.generator.js';
import {
  ANNUALIZE_BELOW_DAYS, ANNUALIZED_KEYS, RATIO_THRESHOLDS, STATUS_TEXT, coherent, colorFor,
  type Color, type EffectiveThreshold,
} from './ratio-thresholds.js';
import { interpret } from './ratio-interpretations.js';
import { CompareQuery, HealthQuery, TrendQuery, UpdateThresholdsDto } from './dto/financial-analysis.dto.js';

type Dec = Prisma.Decimal;
type Generated = Awaited<ReturnType<FinancialRatiosGenerator['generate']>>;
const D = (v: number | string) => new Prisma.Decimal(v);

export const MAX_TREND_POINTS = 24;
const MAX_TREND_KEYS = 4;
const DEFAULT_TREND_KEYS = ['currentRatio', 'debtToAssets', 'netMargin', 'daysSalesOutstanding'];

/** Los 6 indicadores del Panel: nombre para el dueño y la razón técnica debajo (PLAN-v0.2 §6.3). */
const KPIS: { key: string; title: string; colorFrom?: string }[] = [
  { key: 'currentRatio', title: '¿Puedo pagar lo que debo pronto?' },
  { key: 'quickRatio', title: 'Sin contar inventario' },
  { key: 'debtToAssets', title: 'Cuánto de la empresa es deuda' },
  { key: 'netMargin', title: 'De cada peso vendido, cuánto me queda' },
  { key: 'daysSalesOutstanding', title: 'En cuántos días me pagan' },
  // EBITDA es un monto: su color sale del margen EBITDA
  { key: 'ebitda', title: 'Ganancia de la operación', colorFrom: 'ebitdaMargin' },
];

export interface HealthItem {
  key: string;
  group: string;
  label: string;
  formula: string;
  unit: string;
  value: Dec | null; // lo que da el generador
  evaluatedValue: Dec | null; // lo que se compara con los límites (anualizado si aplica)
  annualized: boolean;
  direction: string;
  greenAt: Dec | null;
  redAt: Dec | null;
  enabled: boolean;
  custom: boolean;
  color: Color;
  status: string;
  message: string;
  note?: string;
}

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m: 1..12
/** Mismo día un año antes; el 29-feb pasa al 28-feb. */
const yearBefore = (iso: string) => {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return `${y - 1}-${String(m).padStart(2, '0')}-${String(Math.min(d, lastDayOfMonth(y - 1, m))).padStart(2, '0')}`;
};

/**
 * Semáforo financiero: toma las razones del generador (sin tocarlo ni copiar su lógica), las
 * evalúa contra los límites de la empresa o los del código, y explica cada una para el dueño.
 */
@Injectable()
export class FinancialAnalysisService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ratios: FinancialRatiosGenerator,
  ) {}

  // ------------------------------------------------------------------
  // Límites
  // ------------------------------------------------------------------
  private async effectiveThresholds(companyId: string): Promise<Map<string, EffectiveThreshold>> {
    const rows = await this.prisma.ratioThreshold.findMany({ where: { companyId } });
    const byKey = new Map(rows.map((r) => [r.ratioKey, r]));
    const out = new Map<string, EffectiveThreshold>();
    for (const [ratioKey, def] of Object.entries(RATIO_THRESHOLDS)) {
      const row = byKey.get(ratioKey);
      out.set(ratioKey, row
        ? { ratioKey, direction: def.direction, greenAt: row.greenAt, redAt: row.redAt, enabled: row.enabled, custom: true }
        : {
          ratioKey, direction: def.direction,
          greenAt: def.greenAt === null ? null : D(def.greenAt), redAt: def.redAt === null ? null : D(def.redAt),
          enabled: def.greenAt !== null, custom: false,
        });
    }
    return out;
  }

  async thresholds(user: AuthUser) {
    const eff = await this.effectiveThresholds(user.companyId);
    return [...eff.values()].map((t) => {
      const def = RATIO_THRESHOLDS[t.ratioKey];
      return {
        ...t,
        defaultGreenAt: def.greenAt === null ? null : D(def.greenAt),
        defaultRedAt: def.redAt === null ? null : D(def.redAt),
      };
    });
  }

  async updateThresholds(dto: UpdateThresholdsDto, user: AuthUser) {
    const keys = dto.thresholds.map((t) => t.ratioKey);
    if (new Set(keys).size !== keys.length) throw new BadRequestException('Una razón aparece más de una vez');
    for (const t of dto.thresholds) {
      const def = RATIO_THRESHOLDS[t.ratioKey];
      if (!def) throw new BadRequestException(`No existe la razón "${t.ratioKey}"`);
      if (!coherent(def.direction, D(t.greenAt), D(t.redAt))) {
        throw new BadRequestException(def.direction === 'more'
          ? `${t.ratioKey}: el límite verde (${t.greenAt}) debe ser mayor o igual que el rojo (${t.redAt}), porque aquí más es mejor`
          : `${t.ratioKey}: el límite verde (${t.greenAt}) debe ser menor o igual que el rojo (${t.redAt}), porque aquí menos es mejor`);
      }
    }
    const { companyId } = user;
    await this.prisma.$transaction(async (tx) => {
      for (const t of dto.thresholds) {
        const before = await tx.ratioThreshold.findUnique({ where: { companyId_ratioKey: { companyId, ratioKey: t.ratioKey } } });
        const data = { greenAt: D(t.greenAt), redAt: D(t.redAt), enabled: t.enabled ?? true, updatedById: user.id };
        const row = await tx.ratioThreshold.upsert({
          where: { companyId_ratioKey: { companyId, ratioKey: t.ratioKey } },
          create: { companyId, ratioKey: t.ratioKey, ...data },
          update: data,
        });
        await writeAudit(tx, user, 'RatioThreshold', row.id, before ? AuditAction.UPDATE : AuditAction.CREATE, {
          ratioKey: t.ratioKey,
          before: before ? { greenAt: before.greenAt.toString(), redAt: before.redAt.toString(), enabled: before.enabled } : null,
          after: { greenAt: data.greenAt.toString(), redAt: data.redAt.toString(), enabled: data.enabled },
        });
      }
    });
    return this.thresholds(user);
  }

  /** Vuelve al valor por defecto del código. */
  async resetThreshold(ratioKey: string, user: AuthUser) {
    if (!RATIO_THRESHOLDS[ratioKey]) throw new BadRequestException(`No existe la razón "${ratioKey}"`);
    await this.prisma.$transaction(async (tx) => {
      const row = await tx.ratioThreshold.findUnique({ where: { companyId_ratioKey: { companyId: user.companyId, ratioKey } } });
      if (!row) return;
      await tx.ratioThreshold.deleteMany({ where: { id: row.id, companyId: user.companyId } });
      await writeAudit(tx, user, 'RatioThreshold', row.id, AuditAction.DELETE, {
        ratioKey, before: { greenAt: row.greenAt.toString(), redAt: row.redAt.toString(), enabled: row.enabled },
      });
    });
    return this.thresholds(user);
  }

  // ------------------------------------------------------------------
  // Evaluación
  // ------------------------------------------------------------------
  /** Las razones del generador + margen EBITDA (sobre ingresos operativos, como el margen operativo). */
  private withEbitdaMargin(g: Generated): Ratio[] {
    const rev = g.statement.operatingRevenue;
    const ebitdaMargin: Ratio = {
      key: 'ebitdaMargin', group: 'PROFITABILITY', label: 'Margen EBITDA', formula: 'EBITDA / Ingresos operativos', unit: 'percent',
      value: rev.isZero() ? null : g.statement.ebitda.div(rev).times(100).toDecimalPlaces(4),
      ...(rev.isZero() ? { note: 'No hay ingresos operativos' } : {}),
    };
    const at = g.ratios.findIndex((r) => r.key === 'netMargin') + 1;
    return [...g.ratios.slice(0, at), ebitdaMargin, ...g.ratios.slice(at)];
  }

  private evaluate(g: Generated, thresholds: Map<string, EffectiveThreshold>): HealthItem[] {
    return this.withEbitdaMargin(g).map((r) => {
      const t = thresholds.get(r.key) ?? { ratioKey: r.key, direction: 'more', greenAt: null, redAt: null, enabled: false, custom: false };
      // El generador no anualiza: ROA y ROE de un período corto se llevan a un año para compararlos
      const annualized = ANNUALIZED_KEYS.includes(r.key) && g.periodDays < ANNUALIZE_BELOW_DAYS && r.value !== null;
      const evaluatedValue = annualized ? r.value!.times(365).div(g.periodDays).toDecimalPlaces(4) : r.value;
      const color = colorFor(evaluatedValue, t);
      return {
        key: r.key, group: r.group, label: annualized ? `${r.label} (anualizado)` : r.label, formula: r.formula, unit: r.unit,
        value: r.value, evaluatedValue, annualized,
        direction: t.direction, greenAt: t.greenAt, redAt: t.redAt, enabled: t.enabled, custom: t.custom,
        color, status: STATUS_TEXT[color], message: interpret(r.key, color, evaluatedValue, r.note),
        ...(r.note ? { note: r.note } : {}),
      };
    });
  }

  private summary(items: HealthItem[]) {
    const count = (c: Color) => items.filter((i) => i.color === c).length;
    return { green: count('GREEN'), yellow: count('YELLOW'), red: count('RED'), gray: count('GRAY') };
  }

  private warningsOf(g: Generated) {
    // "no anualizadas" del generador se reemplaza: aquí ROA y ROE sí se anualizan y se rotulan
    const out = g.warnings.filter((w) => !w.includes('no están anualizadas'));
    if (g.periodDays < ANNUALIZE_BELOW_DAYS) {
      out.push(`El período es de ${g.periodDays} días: ROA y ROE se muestran anualizados (× 365 / ${g.periodDays}) para poder compararlos; el resto de las razones son del período.`);
    }
    if (g.unclassified.length) out.push('El semáforo puede engañar mientras haya cuentas sin clasificar: clasifícalas en Clasificación de cuentas.');
    return out;
  }

  async health(q: HealthQuery, user: AuthUser) {
    const [g, thresholds] = await Promise.all([this.ratios.generate(q, user), this.effectiveThresholds(user.companyId)]);
    const items = this.evaluate(g, thresholds);
    return {
      from: g.from, to: g.to, periodDays: g.periodDays, complete: g.complete, balanced: g.balanced,
      unclassifiedCount: g.unclassified.length, warnings: this.warningsOf(g), summary: this.summary(items), items,
    };
  }

  // ------------------------------------------------------------------
  // Tendencia, comparación e indicadores del Panel
  // ------------------------------------------------------------------
  private buckets(q: TrendQuery) {
    const [fy, fm] = q.from.split('-').map(Number);
    const [ty, tm] = q.to.split('-').map(Number);
    if (fy * 12 + fm > ty * 12 + tm) throw new BadRequestException('from no puede ser posterior a to');
    const step = q.granularity === 'YEAR' ? 12 : q.granularity === 'QUARTER' ? 3 : 1;
    // Trimestres y años calendario: el primero es el que contiene a "from"
    let y = fy;
    let m = step === 12 ? 1 : step === 3 ? fm - ((fm - 1) % 3) : fm;
    const out: { label: string; from: string; to: string }[] = [];
    while (y * 12 + m <= ty * 12 + tm) {
      if (out.length === MAX_TREND_POINTS) {
        throw new BadRequestException(`La tendencia admite máximo ${MAX_TREND_POINTS} puntos: acorta el rango o usa una granularidad mayor`);
      }
      const endM = m + step - 1;
      const label = step === 12 ? `${y}` : step === 3 ? `${y}-T${(m + 2) / 3}` : `${y}-${String(m).padStart(2, '0')}`;
      out.push({ label, from: `${y}-${String(m).padStart(2, '0')}-01`, to: `${y}-${String(endM).padStart(2, '0')}-${lastDayOfMonth(y, endM)}` });
      m += step;
      if (m > 12) { m -= 12; y += 1; }
    }
    return out;
  }

  async trend(q: TrendQuery, user: AuthUser) {
    const keys = q.keys ? q.keys.split(',').map((k) => k.trim()).filter(Boolean) : DEFAULT_TREND_KEYS;
    if (!keys.length || keys.length > MAX_TREND_KEYS) throw new BadRequestException(`Elige de 1 a ${MAX_TREND_KEYS} razones`);
    const unknown = keys.filter((k) => !RATIO_THRESHOLDS[k]);
    if (unknown.length) throw new BadRequestException(`No existe la razón: ${unknown.join(', ')}`);
    const buckets = this.buckets(q);
    const thresholds = await this.effectiveThresholds(user.companyId);
    const points = [];
    const labels: Record<string, string> = {};
    // Uno tras otro (no en paralelo): cada punto son ~6 consultas agregadas y así no se acapara la base
    for (const b of buckets) {
      const items = this.evaluate(await this.ratios.generate({ from: b.from, to: b.to }, user), thresholds);
      points.push({
        period: b.label, from: b.from, to: b.to,
        values: Object.fromEntries(keys.map((k) => {
          const i = items.find((x) => x.key === k)!;
          labels[k] ??= i.label;
          return [k, { value: i.value, evaluatedValue: i.evaluatedValue, annualized: i.annualized, color: i.color }];
        })),
      });
    }
    return { granularity: q.granularity ?? 'MONTH', keys, labels, points };
  }

  async compare(q: CompareQuery, user: AuthUser) {
    if (!!q.compareFrom !== !!q.compareTo) throw new BadRequestException('Indica compareFrom y compareTo, o ninguno de los dos');
    const prevFrom = q.compareFrom ?? yearBefore(q.from);
    const prevTo = q.compareTo ?? yearBefore(q.to);
    const thresholds = await this.effectiveThresholds(user.companyId);
    const [cur, prev] = await Promise.all([
      this.ratios.generate({ from: q.from, to: q.to }, user),
      this.ratios.generate({ from: prevFrom, to: prevTo }, user),
    ]);
    const a = this.evaluate(cur, thresholds);
    const b = new Map(this.evaluate(prev, thresholds).map((i) => [i.key, i]));
    return {
      current: { from: q.from, to: q.to, periodDays: cur.periodDays },
      previous: { from: prevFrom, to: prevTo, periodDays: prev.periodDays },
      warnings: [...new Set([...this.warningsOf(cur), ...this.warningsOf(prev)])],
      items: a.map((i) => {
        const p = b.get(i.key)!;
        const x = i.evaluatedValue;
        const y = p.evaluatedValue;
        const diff = x !== null && y !== null ? x.minus(y).toDecimalPlaces(4) : null;
        return {
          key: i.key, label: i.label, unit: i.unit, direction: i.direction,
          current: x, previous: y, difference: diff,
          // % de cambio sobre el valor anterior; sin dato si el anterior es cero
          changePct: diff !== null && !y!.isZero() ? diff.div(y!.abs()).times(100).toDecimalPlaces(2) : null,
          color: i.color, previousColor: p.color,
          improved: diff === null || diff.isZero() ? null : i.direction === 'more' ? diff.gt(0) : diff.lt(0),
        };
      }),
    };
  }

  /** 6 indicadores del Panel: del 1 de enero a hoy contra el mismo tramo del año anterior. */
  async kpis(user: AuthUser) {
    const today = isoDay(new Date());
    const from = `${today.slice(0, 4)}-01-01`;
    const thresholds = await this.effectiveThresholds(user.companyId);
    const [cur, prev] = await Promise.all([
      this.ratios.generate({ from, to: today }, user),
      this.ratios.generate({ from: yearBefore(from), to: yearBefore(today) }, user),
    ]);
    const a = this.evaluate(cur, thresholds);
    const b = this.evaluate(prev, thresholds);
    return {
      current: { from, to: today }, previous: { from: yearBefore(from), to: yearBefore(today) },
      warnings: this.warningsOf(cur),
      items: KPIS.map((k) => {
        if (k.key === 'ebitda') {
          const c = a.find((i) => i.key === k.colorFrom)!;
          const x = cur.statement.ebitda;
          const y = prev.statement.ebitda;
          return {
            key: k.key, title: k.title, technical: 'EBITDA (utilidad operativa + depreciación)', unit: 'amount',
            current: x, previous: y, color: c.color, status: c.status, message: c.message,
            improved: x.equals(y) ? null : x.gt(y),
          };
        }
        const i = a.find((x) => x.key === k.key)!;
        const p = b.find((x) => x.key === k.key)!;
        const x = i.evaluatedValue;
        const y = p.evaluatedValue;
        return {
          key: k.key, title: k.title, technical: i.label, unit: i.unit,
          current: x, previous: y, color: i.color, status: i.status, message: i.message,
          improved: x === null || y === null || x.equals(y) ? null : i.direction === 'more' ? x.gt(y) : x.lt(y),
        };
      }),
    };
  }
}
