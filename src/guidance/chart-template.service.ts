import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { ChartOfAccountsService } from '../chart-of-accounts/chart-of-accounts.service.js';
import { JournalsService } from '../masters/journals/journals.service.js';
import { FiscalParametersService } from '../fiscal/fiscal-parameters.service.js';
import { TaxLinksService } from '../fiscal/tax-links.service.js';
import { SETTINGS_TEMPLATE, TAX_TEMPLATE } from './templates/plantilla-rd.js';

/**
 * «Preparar mi contabilidad» (E1b): deja una empresa nueva lista para facturar. Catálogo estándar RD clasificado,
 * cuentas automáticas, impuestos base ENLAZADOS a sus valores fiscales (R9) y diarios estándar.
 * Si la empresa ya tiene un plan de cuentas configurado → 409 sin cambios. Si quedó a medias (cuentas sin
 * cuentas automáticas), completa lo que falta.
 */
@Injectable()
export class ChartTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly chart: ChartOfAccountsService,
    private readonly journals: JournalsService,
    private readonly fiscal: FiscalParametersService,
  ) {}

  async apply(user: AuthUser) {
    const { companyId } = user;
    const [accounts, settings] = await Promise.all([
      this.prisma.account.count({ where: { companyId } }),
      this.prisma.accountingSettings.findUnique({ where: { companyId } }),
    ]);
    if (accounts && settings?.receivableAccountId) {
      throw new ConflictException('Tu empresa ya tiene plan de cuentas y cuentas automáticas: no se cambió nada. Ajusta lo que necesites en Configuración');
    }
    // Los impuestos se enlazan: tiene que existir el catálogo fiscal (si no, se avisa antes de tocar nada)
    for (const t of TAX_TEMPLATE) await this.fiscal.numberAt(t.parameterKey, new Date());

    // 1) Catálogo estándar RD (con su propia transacción y la clasificación para reportes)
    let loaded = 0;
    if (!accounts) loaded = (await this.chart.importStandardRd(user)).resumen.crear;

    // 2) Cuentas automáticas, impuestos y diarios en una transacción
    const result = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.account.findMany({ where: { companyId, code: { in: [...Object.values(SETTINGS_TEMPLATE), ...TAX_TEMPLATE.flatMap((t) => [t.sales, t.purchases].filter((x): x is string => !!x))] } }, select: { id: true, code: true, isPostable: true } });
      const id = (code: string | null) => {
        if (!code) return null;
        const a = rows.find((r) => r.code === code);
        if (!a || !a.isPostable) throw new UnprocessableEntityException(`Falta la cuenta ${code} del catálogo estándar (o no admite movimientos). Revisa el plan de cuentas`);
        return a.id;
      };
      const data = Object.fromEntries(Object.entries(SETTINGS_TEMPLATE).map(([k, code]) => [k, id(code)]));
      await tx.accountingSettings.upsert({ where: { companyId }, create: { companyId, ...data }, update: data });

      const existingTaxes = await tx.taxRate.findMany({ where: { companyId }, select: { parameterKey: true, name: true } });
      let taxes = 0;
      for (const t of TAX_TEMPLATE) {
        if (existingTaxes.some((e) => e.parameterKey === t.parameterKey || e.name === t.name)) continue;
        const p = await this.fiscal.numberAt(t.parameterKey, new Date(), tx);
        const tax = { name: t.name, type: t.type, isWithholding: t.type.endsWith('_WITHHOLDING') };
        TaxLinksService.assertCompatible(tax, p);
        await tx.taxRate.create({
          data: {
            companyId, ...tax, appliesTo: t.appliesTo, rate: p.value, parameterKey: t.parameterKey, dgiiCode: t.dgiiCode ?? null,
            salesAccountId: id(t.sales), purchaseAccountId: id(t.purchases),
          },
        });
        taxes++;
      }
      await writeAudit(tx, user, 'Company', companyId, AuditAction.CREATE, { event: 'CHART_TEMPLATE', cuentas: loaded, impuestos: taxes, cuentasAutomaticas: Object.keys(data).length });
      return { taxes, settings: Object.keys(data).length };
    });
    const j = await this.journals.createDefaults(user);
    return { accounts: loaded, settings: result.settings, taxes: result.taxes, journals: j.created };
  }
}
