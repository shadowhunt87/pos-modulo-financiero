import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AccountCategory as C, AccountType as T, AuditAction, CashFlowCategory as F, SubledgerType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit } from '../../common/audit.js';
import { AutoClassifyDto, BulkClassificationDto } from '../dto/account-classification.dto.js';

/** Categorías válidas para cada tipo de cuenta. */
export const CATEGORIES_BY_TYPE: Record<T, readonly C[]> = {
  ASSET: [C.CASH_AND_EQUIVALENTS, C.ACCOUNTS_RECEIVABLE, C.INVENTORY, C.PREPAID_AND_OTHER_CURRENT_ASSETS, C.PROPERTY_PLANT_EQUIPMENT, C.INTANGIBLE_ASSETS, C.OTHER_NON_CURRENT_ASSETS],
  LIABILITY: [C.ACCOUNTS_PAYABLE, C.SHORT_TERM_DEBT, C.TAXES_PAYABLE, C.OTHER_CURRENT_LIABILITIES, C.LONG_TERM_DEBT, C.OTHER_NON_CURRENT_LIABILITIES],
  EQUITY: [C.SHARE_CAPITAL, C.RETAINED_EARNINGS, C.CURRENT_YEAR_RESULT, C.OTHER_EQUITY],
  INCOME: [C.OPERATING_REVENUE, C.OTHER_REVENUE],
  EXPENSE: [C.COST_OF_SALES, C.OPERATING_EXPENSE, C.DEPRECIATION_AMORTIZATION, C.FINANCE_COST, C.OTHER_EXPENSE, C.INCOME_TAX],
};

/** Clasificación de flujo de efectivo que corresponde a cada categoría (NIC 7). */
const CASH_FLOW_OF: Partial<Record<C, F>> = {
  [C.CASH_AND_EQUIVALENTS]: F.CASH_EQUIVALENT,
  [C.ACCOUNTS_RECEIVABLE]: F.OPERATING, [C.INVENTORY]: F.OPERATING, [C.PREPAID_AND_OTHER_CURRENT_ASSETS]: F.OPERATING,
  [C.ACCOUNTS_PAYABLE]: F.OPERATING, [C.TAXES_PAYABLE]: F.OPERATING, [C.OTHER_CURRENT_LIABILITIES]: F.OPERATING,
  [C.PROPERTY_PLANT_EQUIPMENT]: F.INVESTING, [C.INTANGIBLE_ASSETS]: F.INVESTING, [C.OTHER_NON_CURRENT_ASSETS]: F.INVESTING,
  [C.SHORT_TERM_DEBT]: F.FINANCING, [C.LONG_TERM_DEBT]: F.FINANCING, [C.OTHER_NON_CURRENT_LIABILITIES]: F.FINANCING,
  [C.SHARE_CAPITAL]: F.FINANCING, [C.RETAINED_EARNINGS]: F.FINANCING, [C.OTHER_EQUITY]: F.FINANCING,
};

/** Palabras clave (sin acentos, minúsculas). La primera regla que coincide gana. */
const RULES: { re: RegExp; type: T; category: C; contra?: boolean }[] = [
  { re: /\b(banco|bancos|caja|efectivo|equivalentes?)\b/, type: T.ASSET, category: C.CASH_AND_EQUIVALENTS },
  { re: /(cuentas?|ctas?\.?) por cobrar|clientes|deudores/, type: T.ASSET, category: C.ACCOUNTS_RECEIVABLE },
  { re: /inventario|mercancia/, type: T.ASSET, category: C.INVENTORY },
  { re: /(depreciacion|amortizacion) acumulada/, type: T.ASSET, category: C.PROPERTY_PLANT_EQUIPMENT, contra: true },
  { re: /intangible|licencia|software|patente|plusvalia/, type: T.ASSET, category: C.INTANGIBLE_ASSETS },
  { re: /terreno|edificio|mobiliario|equipo|vehiculo|maquinaria|propiedad|mejoras/, type: T.ASSET, category: C.PROPERTY_PLANT_EQUIPMENT },
  { re: /anticipo|prepagad|pagados? por adelantado|itbis adelantado|impuestos? (a favor|adelantados?)|seguros? pagados?/, type: T.ASSET, category: C.PREPAID_AND_OTHER_CURRENT_ASSETS },
  { re: /(cuentas?|ctas?\.?) por pagar|proveedores|acreedores/, type: T.LIABILITY, category: C.ACCOUNTS_PAYABLE },
  { re: /itbis por pagar|impuestos? por pagar|retenciones? por pagar|dgii|\btss\b|isr por pagar/, type: T.LIABILITY, category: C.TAXES_PAYABLE },
  { re: /largo plazo|hipoteca/, type: T.LIABILITY, category: C.LONG_TERM_DEBT },
  { re: /prestamos?|sobregiro|tarjeta de credito|linea de credito/, type: T.LIABILITY, category: C.SHORT_TERM_DEBT },
  { re: /capital social|aportes?|acciones/, type: T.EQUITY, category: C.SHARE_CAPITAL },
  { re: /(utilidades?|resultados?|beneficios?) (acumulad|retenid)/, type: T.EQUITY, category: C.RETAINED_EARNINGS },
  { re: /(resultado|utilidad|ganancia) del (ejercicio|periodo)/, type: T.EQUITY, category: C.CURRENT_YEAR_RESULT },
  { re: /intereses? ganados?|otros ingresos|ganancia cambiaria/, type: T.INCOME, category: C.OTHER_REVENUE },
  { re: /ventas|ingresos|servicios prestados/, type: T.INCOME, category: C.OPERATING_REVENUE },
  { re: /costo de (ventas|mercancia|servicios)/, type: T.EXPENSE, category: C.COST_OF_SALES },
  { re: /depreciacion|amortizacion/, type: T.EXPENSE, category: C.DEPRECIATION_AMORTIZATION },
  { re: /intereses? (pagados?|bancarios?)|comisiones? bancarias?|gastos? financieros?|perdida cambiaria/, type: T.EXPENSE, category: C.FINANCE_COST },
  { re: /impuesto sobre (la )?renta|impuesto a las ganancias/, type: T.EXPENSE, category: C.INCOME_TAX },
];
const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

@Injectable()
export class AccountClassificationService {
  constructor(private readonly prisma: PrismaService) {}

  async list(user: AuthUser) {
    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, active: true }, orderBy: { code: 'asc' },
      select: { id: true, code: true, name: true, type: true, category: true, cashFlowCategory: true, isContra: true, subledger: true, parentId: true },
    });
    const parents = new Set(accounts.map((a) => a.parentId).filter(Boolean));
    const data = accounts.map(({ parentId, ...a }) => ({ ...a, isParent: parents.has(a.id) }));
    const leaves = data.filter((a) => !a.isParent);
    return {
      summary: { leafAccounts: leaves.length, classified: leaves.filter((a) => a.category).length, withoutCashFlow: leaves.filter((a) => a.type !== T.INCOME && a.type !== T.EXPENSE && !a.cashFlowCategory).length },
      accounts: data,
    };
  }

  /** Valida que cada clasificación sea coherente con el tipo de cuenta. */
  private validate(type: T, code: string, i: { category?: C | null; cashFlowCategory?: F | null; subledger?: SubledgerType | null }) {
    if (i.category && !CATEGORIES_BY_TYPE[type].includes(i.category)) {
      throw new UnprocessableEntityException(`La categoría ${i.category} no corresponde a la cuenta ${code} (${type})`);
    }
    if (i.cashFlowCategory && (type === T.INCOME || type === T.EXPENSE)) {
      throw new UnprocessableEntityException(`${code}: las cuentas de resultados no se clasifican en flujo de efectivo (van en el resultado neto)`);
    }
    if (i.cashFlowCategory === F.CASH_EQUIVALENT && type !== T.ASSET) {
      throw new UnprocessableEntityException(`${code}: solo un activo puede ser CASH_EQUIVALENT`);
    }
    if (i.subledger) {
      const ok = (i.subledger === SubledgerType.PAYABLE && type === T.LIABILITY) ||
        (i.subledger !== SubledgerType.PAYABLE && type === T.ASSET);
      if (!ok) throw new UnprocessableEntityException(`${code}: auxiliar ${i.subledger} no es válido para una cuenta ${type}`);
    }
  }

  async bulkUpdate(dto: BulkClassificationDto, user: AuthUser) {
    const ids = dto.items.map((i) => i.accountId);
    if (new Set(ids).size !== ids.length) throw new UnprocessableEntityException('Una cuenta aparece más de una vez');
    const accounts = await this.prisma.account.findMany({ where: { companyId: user.companyId, id: { in: ids } } });
    if (accounts.length !== ids.length) throw new NotFoundException('Alguna cuenta no existe');
    const byId = new Map(accounts.map((a) => [a.id, a]));
    for (const i of dto.items) this.validate(byId.get(i.accountId)!.type, byId.get(i.accountId)!.code, i);

    await this.prisma.$transaction(async (tx) => {
      for (const { accountId, ...data } of dto.items) await tx.account.update({ where: { id: accountId }, data });
      await writeAudit(tx, user, 'Account', 'classification', AuditAction.UPDATE, { accounts: ids.length });
    });
    return { updated: ids.length };
  }

  /** Propone (o aplica) una clasificación por palabras clave del nombre. Solo cuentas hoja sin categoría. */
  async autoClassify(dto: AutoClassifyDto, user: AuthUser) {
    const accounts = await this.prisma.account.findMany({ where: { companyId: user.companyId, active: true } });
    const parents = new Set(accounts.map((a) => a.parentId).filter(Boolean));
    const todo = accounts.filter((a) => !parents.has(a.id) && !a.category);

    const proposals: { id: string; code: string; name: string; category: C; cashFlowCategory: F | null; isContra: boolean; subledger: SubledgerType | null }[] = [];
    const unmatched: { code: string; name: string; type: T }[] = [];
    for (const a of todo) {
      const name = strip(a.name);
      const rule = RULES.find((r) => r.type === a.type && r.re.test(name));
      const category = rule?.category ?? (a.type === T.EXPENSE ? C.OPERATING_EXPENSE : a.type === T.INCOME ? C.OPERATING_REVENUE : undefined);
      if (!category) { unmatched.push({ code: a.code, name: a.name, type: a.type }); continue; }
      proposals.push({
        id: a.id, code: a.code, name: a.name, category, isContra: rule?.contra ?? false,
        cashFlowCategory: a.cashFlowCategory ?? CASH_FLOW_OF[category] ?? null,
        subledger: category === C.ACCOUNTS_RECEIVABLE ? SubledgerType.RECEIVABLE : category === C.ACCOUNTS_PAYABLE ? SubledgerType.PAYABLE : null,
      });
    }
    if (dto.apply && proposals.length) {
      await this.prisma.$transaction(async (tx) => {
        for (const p of proposals) {
          await tx.account.update({
            where: { id: p.id },
            data: { category: p.category, cashFlowCategory: p.cashFlowCategory, isContra: p.isContra, ...(p.subledger ? { subledger: p.subledger } : {}) },
          });
        }
        await writeAudit(tx, user, 'Account', 'classification', AuditAction.UPDATE, { auto: proposals.length });
      });
    }
    return { applied: !!dto.apply, classified: proposals.length, proposals: proposals.map(({ id, ...p }) => p), unmatched };
  }
}