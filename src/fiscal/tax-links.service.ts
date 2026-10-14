import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditAction, TaxType } from '../generated/prisma/enums.js';
import type { TaxRate } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { FiscalParametersService, keyLabel, type ResolvedParameter } from './fiscal-parameters.service.js';
import { dateOnly } from './fiscal-dates.js';

/** Familia de claves que puede enlazar cada tipo de impuesto (por prefijo). */
const FAMILY: Partial<Record<TaxType, string>> = {
  [TaxType.ITBIS]: 'ITBIS_TASA_', [TaxType.ITBIS_WITHHOLDING]: 'RET_ITBIS_', [TaxType.ISR_WITHHOLDING]: 'RET_ISR_',
};
/** Pistas en el nombre del impuesto para desempatar sugerencias ("Retención honorarios 15%"). */
const HINTS: [RegExp, string][] = [
  [/honor/i, 'HONORARIOS'], [/alquil|arrend/i, 'ALQUILER'], [/estado|gobierno/i, 'ESTADO'], [/exterior|digital|software/i, 'EXTERIOR'],
  [/tarjeta/i, 'TARJETA'], [/dividend/i, 'DIVIDENDOS'], [/reducid|16/i, 'REDUCIDA'], [/export/i, 'EXPORTACION'],
  [/f[ií]sica/i, 'PERSONA_FISICA'], [/segur|limpie|transport/i, 'SEGURIDAD'], [/informal|no registr/i, 'INFORMALES'], [/rst|simplificad/i, 'RST'],
];

/**
 * Enlace de los impuestos de la empresa con los valores oficiales (PLAN-v0.3 §5.3, §5.4). Se propone, nunca se
 * enlaza solo (P4): una persona confirma cada enlace. Valida que la base del parámetro sea compatible con el impuesto.
 */
@Injectable()
export class TaxLinksService {
  constructor(private readonly prisma: PrismaService, private readonly params: FiscalParametersService) {}

  /** ¿Puede este impuesto usar este parámetro? (base ITBIS solo retención de ITBIS; con base, retención; sin base, de línea). */
  static assertCompatible(tax: Pick<TaxRate, 'name' | 'type' | 'isWithholding'>, p: Pick<ResolvedParameter, 'key' | 'kind' | 'base'>) {
    if (p.kind !== 'RATE' && p.kind !== 'NONE') throw new UnprocessableEntityException(`'${keyLabel(p.key)}' no es una tasa: no se puede enlazar a un impuesto`);
    if (p.base === 'ITBIS' && tax.type !== TaxType.ITBIS_WITHHOLDING) {
      throw new UnprocessableEntityException(`'${keyLabel(p.key)}' se calcula sobre el ITBIS: solo sirve para una retención de ITBIS`);
    }
    if (p.base && !tax.isWithholding) throw new UnprocessableEntityException(`'${keyLabel(p.key)}' es una retención: no sirve para "${tax.name}"`);
    if (!p.base && tax.isWithholding) throw new UnprocessableEntityException(`'${keyLabel(p.key)}' es un impuesto de línea: no sirve para la retención "${tax.name}"`);
  }

  async suggestions(user: AuthUser) {
    const today = dateOnly(new Date());
    const [taxes, current] = await Promise.all([
      this.prisma.taxRate.findMany({ where: { companyId: user.companyId, active: true }, orderBy: [{ type: 'asc' }, { name: 'asc' }] }),
      this.params.list(today),
    ]);
    const rates = current.filter((p) => p.kind === 'RATE' && p.inForce);
    return taxes.map((t) => {
      const prefix = FAMILY[t.type];
      const family = prefix ? rates.filter((p) => p.key.startsWith(prefix)) : [];
      const compatible = family.filter((p) => { try { TaxLinksService.assertCompatible(t, p); return true; } catch { return false; } });
      let candidates = compatible.filter((p) => p.value !== null && p.value.eq(t.rate));
      const hinted = HINTS.filter(([re]) => re.test(t.name)).map(([, k]) => k);
      if (candidates.length > 1 && hinted.length) {
        const narrowed = candidates.filter((p) => hinted.some((h) => p.key.includes(h)));
        if (narrowed.length) candidates = narrowed;
      }
      return {
        taxRateId: t.id, name: t.name, type: t.type, rate: t.rate, linkedKey: t.parameterKey,
        // "sugerido" solo si hay un único candidato; lo ambiguo se muestra pero no se elige solo
        status: t.parameterKey ? 'ENLAZADO' : !prefix ? 'NO_APLICA' : candidates.length === 1 ? 'SUGERIDO' : candidates.length > 1 ? 'AMBIGUO' : 'SIN_COINCIDENCIA',
        suggestedKey: !t.parameterKey && candidates.length === 1 ? candidates[0].key : null,
        options: compatible.map((p) => ({ key: p.key, label: p.label, value: p.value, base: p.base, status: p.status })),
      };
    });
  }

  async link(taxRateId: string, key: string, user: AuthUser) {
    const tax = await this.prisma.taxRate.findFirst({ where: { id: taxRateId, companyId: user.companyId } });
    if (!tax) throw new NotFoundException('Impuesto no encontrado');
    const p = await this.params.valueAt(key, new Date());
    TaxLinksService.assertCompatible(tax, p);
    if (p.kind === 'NONE') throw new UnprocessableEntityException(`'${keyLabel(key)}' ya no aplica: no se puede enlazar`);
    return this.prisma.$transaction(async (tx) => {
      // La tasa del maestro queda informativa con el valor vigente (R9: el cálculo usa valueAt)
      const updated = await tx.taxRate.update({ where: { id: tax.id, companyId: user.companyId }, data: { parameterKey: key, rate: p.value ?? tax.rate } });
      await writeAudit(tx, user, 'TaxRate', tax.id, AuditAction.UPDATE, { parameterKey: key, previousRate: tax.rate.toString() });
      return updated;
    });
  }

  async unlink(taxRateId: string, user: AuthUser) {
    const tax = await this.prisma.taxRate.findFirst({ where: { id: taxRateId, companyId: user.companyId } });
    if (!tax) throw new NotFoundException('Impuesto no encontrado');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.taxRate.update({ where: { id: tax.id, companyId: user.companyId }, data: { parameterKey: null } });
      await writeAudit(tx, user, 'TaxRate', tax.id, AuditAction.UPDATE, { parameterKey: null, previousKey: tax.parameterKey });
      return updated;
    });
  }

  /** Tasa y base vigentes de cada impuesto en una fecha (vista previa de la factura, §5.4). */
  async effective(date: Date, user: AuthUser) {
    const taxes = await this.prisma.taxRate.findMany({ where: { companyId: user.companyId } });
    const out: Record<string, { rate: string; base: string | null; linked: boolean; parameterId: string | null; error: string | null }> = {};
    for (const t of taxes) {
      if (!t.parameterKey) { out[t.id] = { rate: t.rate.toString(), base: null, linked: false, parameterId: null, error: null }; continue; }
      try {
        const p = await this.params.numberAt(t.parameterKey, date);
        out[t.id] = { rate: p.value.toString(), base: p.base, linked: true, parameterId: p.id, error: null };
      } catch (e) {
        out[t.id] = { rate: t.rate.toString(), base: null, linked: true, parameterId: null, error: e instanceof Error ? e.message : String(e) };
      }
    }
    return out;
  }
}
