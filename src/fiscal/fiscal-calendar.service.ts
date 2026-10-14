import { ConflictException, Injectable, NotFoundException, OnModuleInit, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { declaredDeadline } from '../common/declared-month.js';
import { FiscalParametersService } from './fiscal-parameters.service.js';
import { FiscalProfileService } from './fiscal-profile.service.js';
import { FiscalAlertsService, type FiscalAlert } from './fiscal-alerts.service.js';
import { dateOnly, dmy, ymd } from './fiscal-dates.js';
import { occurrences, type ObligationRule } from './occurrences.js';

type Tx = Prisma.TransactionClient;
/** Dónde se prepara cada obligación (pantallas del sistema). */
const ROUTE: Record<string, string> = {
  '606': '/dgii', '607': '/dgii', '608': '/dgii', '609': '/dgii/609', 'IT-1': '/dgii/it1', 'IR-17': '/dgii/ir17', 'IR-2': '/reports', ISA: '/reports',
  'IR-3': '/fiscal-calendar', ANTICIPO: '/reports',
};
/** Clave del último día de las B según la clasificación DGII (PLAN-v0.3 §5.6). */
const B_LAST_DAY_KEY: Record<string, string> = {
  GRANDE_NACIONAL: 'NCF_B_ULTIMO_DIA_GRANDE_NACIONAL', GRANDE_LOCAL: 'NCF_B_ULTIMO_DIA_GRANDE_LOCAL_MEDIANO', MEDIANO: 'NCF_B_ULTIMO_DIA_GRANDE_LOCAL_MEDIANO',
  PEQUENO: 'NCF_B_ULTIMO_DIA_PEQUENO_MICRO_NC', MICRO: 'NCF_B_ULTIMO_DIA_PEQUENO_MICRO_NC', NO_CLASIFICADO: 'NCF_B_ULTIMO_DIA_PEQUENO_MICRO_NC',
};
const DECLARED_BY = ['606', '607'];

/**
 * Calendario fiscal, presentaciones, avisos de comprobantes y bloqueo de las B (PLAN-v0.3 §8, paquete N5).
 * Ningún plazo ni feriado vive en el código: salen de FiscalObligation, Holiday y los parámetros con vigencia.
 */
@Injectable()
export class FiscalCalendarService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly params: FiscalParametersService,
    private readonly profile: FiscalProfileService,
    private readonly alertsSvc: FiscalAlertsService,
  ) {}

  /** Se suma como fuente de avisos del Panel (GET /fiscal/alerts). */
  onModuleInit() { this.alertsSvc.register({ alerts: (u) => this.alerts(u) }); }

  private async rules(tx?: Tx): Promise<ObligationRule[]> {
    const rows = await (tx ?? this.prisma).fiscalObligation.findMany({ where: { supersededBy: { is: null } }, orderBy: [{ code: 'asc' }, { validFrom: 'desc' }, { revision: 'desc' }] });
    return rows.map((r) => ({ code: r.code, name: r.name, frequency: r.frequency, rule: r.rule, ruleValue: r.ruleValue, appliesWhen: (r.appliesWhen as Record<string, unknown> | null) ?? null, validFrom: r.validFrom }));
  }

  private async holidays(from: Date, to: Date) {
    const rows = await this.prisma.holiday.findMany({ where: { date: { gte: new Date(from.getTime() - 40 * 86_400_000), lte: new Date(to.getTime() + 40 * 86_400_000) } } });
    return new Set(rows.map((h) => ymd(h.date)));
  }

  /** Vencimientos entre dos fechas, con su estado (Presentada / Pendiente / Vencida) y qué falta. */
  async calendar(user: AuthUser, from: Date, to: Date) {
    const [company, profile, rules, holidays, filings] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { fiscalYearStartMonth: true } }),
      this.profile.get(user), this.rules(), this.holidays(from, to),
      this.prisma.fiscalFiling.findMany({ where: { companyId: user.companyId } }),
    ]);
    const today = dateOnly(new Date());
    const occ = occurrences(rules, dateOnly(from), dateOnly(to), company.fiscalYearStartMonth, holidays, { taxRegime: profile.taxRegime, isWithholdingAgent: profile.isWithholdingAgent });
    return {
      warnings: [
        ...(rules.length ? [] : ['Todavía no se cargó el calendario fiscal (obligaciones). Avisa a quien administra el sistema.']),
        ...(profile.taxRegime === 'RST' ? ['Tu régimen (RST) tiene fechas propias: confírmalas con tu contadora.'] : []),
      ],
      items: occ.map((o) => {
        const f = filings.find((x) => x.obligationCode === o.code && x.period === o.period);
        return {
          ...o, dueDate: ymd(o.dueDate), originalDate: ymd(o.originalDate), route: ROUTE[o.code] ?? '/fiscal-calendar',
          moved: ymd(o.dueDate) !== ymd(o.originalDate),
          status: f ? 'FILED' : o.dueDate < today ? 'OVERDUE' : 'PENDING',
          filing: f ? { id: f.id, filedAt: f.filedAt, reference: f.reference } : null,
        };
      }),
    };
  }

  // ------------------------------------------------------------------ presentaciones

  async file(user: AuthUser, dto: { obligationCode: string; period: string; reference?: string; filedAt?: string }) {
    const known = await this.prisma.fiscalObligation.count({ where: { code: dto.obligationCode } });
    if (!known) throw new NotFoundException('Esa obligación no existe en el calendario');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const f = await tx.fiscalFiling.create({
          data: { companyId: user.companyId, obligationCode: dto.obligationCode, period: dto.period, filedAt: dto.filedAt ? new Date(dto.filedAt) : new Date(), filedById: user.id, reference: dto.reference ?? null },
        });
        await writeAudit(tx, user, 'FiscalFiling', f.id, AuditAction.CREATE, { obligationCode: f.obligationCode, period: f.period, reference: f.reference });
        return f;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya marcaste esa declaración como presentada');
      throw e;
    }
  }

  async unfile(user: AuthUser, id: string) {
    const f = await this.prisma.fiscalFiling.findFirst({ where: { id, companyId: user.companyId } });
    if (!f) throw new NotFoundException('Presentación no encontrada');
    await this.prisma.$transaction(async (tx) => {
      await tx.fiscalFiling.deleteMany({ where: { id, companyId: user.companyId } });
      await writeAudit(tx, user, 'FiscalFiling', id, AuditAction.DELETE, { obligationCode: f.obligationCode, period: f.period });
    });
    return { ok: true };
  }

  /**
   * ¿El mes de esta fecha ya se declaró? (PLAN-v0.3 §4.2): hay una presentación del 606 o 607 de ese mes, o ya pasó su
   * vencimiento (día del calendario; si no está cargado, el parámetro DECLARACION_DIA_606_607_608).
   */
  async isMonthDeclared(companyId: string, date: Date, tx?: Tx): Promise<boolean> {
    const db = tx ?? this.prisma;
    const period = ymd(date).slice(0, 7);
    if (await db.fiscalFiling.count({ where: { companyId, period, obligationCode: { in: DECLARED_BY } } })) return true;
    const rule = await db.fiscalObligation.findFirst({ where: { code: '607', supersededBy: { is: null } }, orderBy: [{ validFrom: 'desc' }, { revision: 'desc' }] });
    const day = rule?.rule === 'DAY_OF_NEXT_MONTH' ? rule.ruleValue
      : (await this.params.tryValueAt('DECLARACION_DIA_606_607_608', date, tx))?.value?.toNumber() ?? null;
    if (day === null) return false;
    return Date.now() >= declaredDeadline(date, day).getTime();
  }

  // ------------------------------------------------------------------ comprobantes B (D24, G8)

  private async activeContingency(companyId: string, tx?: Tx) {
    return (tx ?? this.prisma).bContingency.findFirst({ where: { companyId, endedAt: null, endsAt: { gt: new Date() } }, orderBy: { endsAt: 'desc' } });
  }

  /** Último día válido de las B para la empresa (null si no tiene clasificación o no está cargado). */
  async bLastDay(user: Pick<AuthUser, 'companyId'>, tx?: Tx) {
    const p = await (tx ?? this.prisma).companyFiscalProfile.findUnique({ where: { companyId: user.companyId }, select: { dgiiClassification: true } });
    const key = p?.dgiiClassification ? B_LAST_DAY_KEY[p.dgiiClassification] : null;
    if (!key) return null;
    const v = await this.params.tryValueAt(key, new Date(), tx);
    return v?.valueDate ? { date: v.valueDate, key, classification: p!.dgiiClassification! } : null;
  }

  /**
   * Antes de consumir un NCF B de venta: rechaza si la fecha de la factura O LA DE HOY pasan el último día válido de
   * la clasificación (salvo contingencia vigente), y si la secuencia venció contra hoy. Sin clasificación: no bloquea.
   */
  async assertBAllowed(tx: Tx, companyId: string, ncfType: string, issueDate: Date) {
    if (!ncfType.startsWith('B')) return;
    const today = dateOnly(new Date());
    const seq = await tx.ncfSequence.findFirst({ where: { companyId, ncfType }, select: { expirationDate: true } });
    if (seq?.expirationDate && dateOnly(seq.expirationDate) < today) {
      throw new UnprocessableEntityException(`La secuencia ${ncfType} venció el ${dmy(seq.expirationDate)}. Pide una nueva en la Oficina Virtual y cárgala en Comprobantes fiscales`);
    }
    const last = await this.bLastDay({ companyId }, tx);
    if (!last) return;
    const lastDay = dateOnly(last.date);
    if (dateOnly(issueDate) <= lastDay && today <= lastDay) return;
    if (await this.activeContingency(companyId, tx)) return;
    throw new UnprocessableEntityException(`Los comprobantes B ya no son válidos para tu empresa desde el ${dmy(new Date(lastDay.getTime() + 86_400_000))}: emite e-CF. Si estás en contingencia, el administrador debe registrarla en Calendario fiscal`);
  }

  async startContingency(user: AuthUser, reason: string, days?: number) {
    const max = (await this.params.numberAt('NCF_B_CONTINGENCIA_MAX_DIAS', new Date())).value.toNumber();
    const n = Math.min(days ?? max, max);
    if (n < 1) throw new UnprocessableEntityException('El plazo de contingencia debe ser de al menos 1 día');
    if (await this.activeContingency(user.companyId)) throw new ConflictException('Ya hay una contingencia vigente');
    return this.prisma.$transaction(async (tx) => {
      const c = await tx.bContingency.create({ data: { companyId: user.companyId, reason, endsAt: new Date(Date.now() + n * 86_400_000), createdById: user.id } });
      await writeAudit(tx, user, 'BContingency', c.id, AuditAction.CREATE, { reason, days: n });
      return { ...c, reminder: 'Avisa a la DGII de la contingencia y regulariza los comprobantes dentro del plazo (Decreto 587-24).' };
    });
  }

  async endContingency(user: AuthUser) {
    const c = await this.activeContingency(user.companyId);
    if (!c) throw new NotFoundException('No hay una contingencia vigente');
    await this.prisma.$transaction(async (tx) => {
      await tx.bContingency.updateMany({ where: { id: c.id, companyId: user.companyId }, data: { endedAt: new Date(), endedById: user.id } });
      await writeAudit(tx, user, 'BContingency', c.id, AuditAction.UPDATE, { ended: true });
    });
    return { ok: true };
  }

  async contingency(user: AuthUser) {
    return { active: await this.activeContingency(user.companyId), bLastDay: await this.bLastDay(user) };
  }

  // ------------------------------------------------------------------ avisos (PLAN-v0.3 §8.3)

  async alerts(user: AuthUser): Promise<FiscalAlert[]> {
    const out: FiscalAlert[] = [];
    const now = new Date(), today = dateOnly(now);
    const cal = await this.calendar(user, new Date(today.getTime() - 60 * 86_400_000), new Date(today.getTime() + 7 * 86_400_000));
    for (const o of cal.items.filter((x) => x.status === 'OVERDUE')) {
      out.push({ code: `OVERDUE_${o.code}_${o.period}`, level: 'neg', text: `${o.name} de ${o.period} venció el ${o.dueDate.split('-').reverse().join('/')}. Si ya lo presentaste, márcalo`, link: '/fiscal-calendar', linkText: 'Ver calendario' });
    }
    for (const o of cal.items.filter((x) => x.status === 'PENDING')) {
      out.push({ code: `DUE_${o.code}_${o.period}`, level: 'warn', text: `${o.name} de ${o.period} vence el ${o.dueDate.split('-').reverse().join('/')}`, link: o.route, linkText: 'Prepararlo' });
    }
    // Comprobantes por agotarse o vencer
    const seqs = await this.prisma.ncfSequence.findMany({ where: { companyId: user.companyId, active: true } });
    for (const s of seqs) {
      const left = s.rangeEnd - s.currentNumber;
      if (left <= s.warningThreshold) out.push({ code: `NCF_LOW_${s.ncfType}`, level: left <= 0 ? 'neg' : 'warn', text: left <= 0 ? `Se agotaron tus comprobantes ${s.ncfType}` : `Te quedan ${left} comprobantes ${s.ncfType}`, link: '/setup/ncf', linkText: 'Cargar más' });
      if (s.expirationDate) {
        const days = Math.ceil((dateOnly(s.expirationDate).getTime() - today.getTime()) / 86_400_000);
        if (days <= 30) out.push({ code: `NCF_EXP_${s.ncfType}`, level: days < 0 ? 'neg' : 'warn', text: days < 0 ? `Tu secuencia ${s.ncfType} venció el ${dmy(s.expirationDate)}` : `Tu secuencia ${s.ncfType} vence el ${dmy(s.expirationDate)}`, link: '/setup/ncf', linkText: 'Renovarla' });
      }
    }
    // Fin de las B por clasificación (45 días antes)
    const last = await this.bLastDay(user);
    if (last) {
      const days = Math.ceil((dateOnly(last.date).getTime() - today.getTime()) / 86_400_000);
      if (days <= 45) out.push({ code: 'B_END', level: days < 0 ? 'neg' : 'warn', text: days < 0 ? 'Ya no puedes emitir comprobantes B: solo e-CF' : `Tus comprobantes B dejan de valer el ${dmy(new Date(dateOnly(last.date).getTime() + 86_400_000))}: prepárate para emitir e-CF`, link: '/fiscal-calendar', linkText: 'Ver detalles' });
    }
    // Feriados del año siguiente (desde el 1-dic)
    if (now.getUTCMonth() === 11) {
      const ny = now.getUTCFullYear() + 1;
      const n = await this.prisma.holiday.count({ where: { date: { gte: new Date(Date.UTC(ny, 0, 1)), lt: new Date(Date.UTC(ny + 1, 0, 1)) } } });
      if (!n) out.push({ code: 'HOLIDAYS_MISSING', level: 'info', text: `Faltan los feriados de ${ny}: sin ellos los vencimientos no se corren al día laborable`, link: null, linkText: null });
    }
    // e-CF importados sin verificar
    const unv = await this.prisma.ecfDocument.count({ where: { companyId: user.companyId, verification: 'UNVERIFIED' } });
    if (unv) out.push({ code: 'ECF_UNVERIFIED', level: 'info', text: `${unv} e-CF importado(s) sin verificar en el portal de la DGII`, link: '/dgii/review', linkText: 'Revisar' });
    return out;
  }
}
