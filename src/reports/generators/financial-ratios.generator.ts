import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AccountCategory } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IncomeStatementQuery } from '../dto/reports-queries.dto.js';
import { ZERO } from '../accounting-nature.utils.js';
import { BalanceSheetGenerator, BalanceSheetLine } from './balance-sheet.generator.js';
import { IncomeStatementGenerator, IncomeStatementLine } from './income-statement.generator.js';

type Dec = Prisma.Decimal;
const C = AccountCategory;

const CURRENT_ASSETS: AccountCategory[] = [C.CASH_AND_EQUIVALENTS, C.ACCOUNTS_RECEIVABLE, C.INVENTORY, C.PREPAID_AND_OTHER_CURRENT_ASSETS];
const CURRENT_LIABILITIES: AccountCategory[] = [C.ACCOUNTS_PAYABLE, C.SHORT_TERM_DEBT, C.TAXES_PAYABLE, C.OTHER_CURRENT_LIABILITIES];
const OPERATING_EXPENSES: AccountCategory[] = [C.OPERATING_EXPENSE, C.DEPRECIATION_AMORTIZATION];

export type RatioUnit = 'ratio' | 'percent' | 'days' | 'amount';
export type RatioGroup = 'LIQUIDITY' | 'LEVERAGE' | 'PROFITABILITY' | 'ACTIVITY';

export interface Ratio {
  key: string;
  group: RatioGroup;
  label: string;
  formula: string;
  unit: RatioUnit;
  /** null cuando no se puede calcular (denominador cero o no positivo); `note` explica por qué */
  value: Dec | null;
  note?: string;
}

const sumAmounts = (xs: { amount: Dec }[]) => xs.reduce((s, l) => s.plus(l.amount), ZERO);
const round4 = (d: Dec) => d.toDecimalPlaces(4);
const dayBefore = (iso: string) => new Date(new Date(iso).getTime() - 86_400_000).toISOString().slice(0, 10);

/**
 * Razones financieras de un período [from, to]. Usa el Balance General al cierre (to) y al día
 * anterior a from, y el Estado de Resultados del período; nada se recalcula aparte, así que
 * siempre coincide con esos dos reportes. Cada cuenta se ubica por su `category`
 * (Clasificación de cuentas): lo que no esté clasificado se reporta en `unclassified`.
 */
@Injectable()
export class FinancialRatiosGenerator {
  constructor(
    private readonly prisma: PrismaService,
    private readonly balanceSheet: BalanceSheetGenerator,
    private readonly incomeStatement: IncomeStatementGenerator,
  ) {}

  async generate(q: IncomeStatementQuery, user: AuthUser) {
    // El estado de resultados valida el rango (from <= to)
    const is = await this.incomeStatement.generate(q, user);
    const [closing, opening] = await Promise.all([
      this.balanceSheet.generate({ asOf: q.to, periodStart: q.from }, user),
      this.balanceSheet.generate({ asOf: dayBefore(q.from) }, user),
    ]);

    const ids = [
      ...closing.assets, ...closing.liabilities, ...opening.assets, ...opening.liabilities, ...is.income, ...is.expenses,
    ].map((l) => l.accountId);
    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, id: { in: [...new Set(ids)] } },
      select: { id: true, category: true },
    });
    const cat = new Map(accounts.map((a) => [a.id, a.category]));
    const inCats = (lines: (BalanceSheetLine | IncomeStatementLine)[], cats: AccountCategory[]) =>
      sumAmounts(lines.filter((l) => { const c = cat.get(l.accountId); return !!c && cats.includes(c); }));

    // ---- Cuentas con saldo o movimiento que no se pueden ubicar
    const unclassified = [
      ...closing.assets.map((l) => ({ ...l, section: 'ASSET' })),
      ...closing.liabilities.map((l) => ({ ...l, section: 'LIABILITY' })),
      ...is.income.map((l) => ({ ...l, section: 'INCOME' })),
      ...is.expenses.map((l) => ({ ...l, section: 'EXPENSE' })),
    ]
      .filter((l) => !l.amount.isZero() && !cat.get(l.accountId))
      .map((l) => ({ accountId: l.accountId, code: l.code, name: l.name, section: l.section, amount: l.amount }));

    // ---- Balance al cierre y al inicio
    const bal = (b: typeof closing) => ({
      cash: inCats(b.assets, [C.CASH_AND_EQUIVALENTS]),
      receivables: inCats(b.assets, [C.ACCOUNTS_RECEIVABLE]),
      inventory: inCats(b.assets, [C.INVENTORY]),
      currentAssets: inCats(b.assets, CURRENT_ASSETS),
      payables: inCats(b.liabilities, [C.ACCOUNTS_PAYABLE]),
      currentLiabilities: inCats(b.liabilities, CURRENT_LIABILITIES),
      totalAssets: b.totalAssets,
      totalLiabilities: b.totalLiabilities,
      totalEquity: b.totalEquity,
    });
    const end = bal(closing);
    const start = bal(opening);
    // Sin historia previa (balance inicial en cero) un promedio con cero subestimaría los saldos
    const useAverage = !opening.totalAssets.isZero() || !opening.totalLiabilities.isZero() || !opening.totalEquity.isZero();
    const avg = (k: keyof typeof end) => (useAverage ? end[k].plus(start[k]).div(2) : end[k]);

    // ---- Estado de resultados por categoría
    const operatingRevenue = inCats(is.income, [C.OPERATING_REVENUE]);
    const otherRevenue = inCats(is.income, [C.OTHER_REVENUE]);
    const costOfSales = inCats(is.expenses, [C.COST_OF_SALES]);
    const operatingExpenses = inCats(is.expenses, OPERATING_EXPENSES);
    const depreciation = inCats(is.expenses, [C.DEPRECIATION_AMORTIZATION]);
    const financeCost = inCats(is.expenses, [C.FINANCE_COST]);
    const otherExpense = inCats(is.expenses, [C.OTHER_EXPENSE]);
    const incomeTax = inCats(is.expenses, [C.INCOME_TAX]);
    const grossProfit = operatingRevenue.minus(costOfSales);
    const ebit = grossProfit.minus(operatingExpenses);
    const ebitda = ebit.plus(depreciation);
    const netIncome = is.netIncome;

    const days = Math.round((new Date(q.to).getTime() - new Date(q.from).getTime()) / 86_400_000) + 1;
    const D = new Prisma.Decimal(days);

    // ---- Divisiones seguras
    const div = (a: Dec, b: Dec): Dec | null => (b.isZero() ? null : round4(a.div(b)));
    const divPos = (a: Dec, b: Dec): Dec | null => (b.gt(0) ? round4(a.div(b)) : null);
    // Porcentaje calculado sobre el cociente exacto (no sobre uno ya redondeado)
    const pctOf = (a: Dec, b: Dec): Dec | null => (b.isZero() ? null : round4(a.div(b).times(100)));
    const pctOfPos = (a: Dec, b: Dec): Dec | null => (b.gt(0) ? round4(a.div(b).times(100)) : null);
    const NO_DEN = 'El denominador es cero';
    const mk = (
      key: string, group: RatioGroup, label: string, formula: string, unit: RatioUnit, value: Dec | null, noDenNote = NO_DEN,
    ): Ratio => ({ key, group, label, formula, unit, value, ...(value === null ? { note: noDenNote } : {}) });

    const avgAR = avg('receivables');
    const avgAP = avg('payables');
    const avgInv = avg('inventory');
    const dso = div(avgAR.times(D), operatingRevenue);
    const dio = div(avgInv.times(D), costOfSales);
    const dpo = div(avgAP.times(D), costOfSales);
    const NEG_EQ = 'El patrimonio es cero o negativo';

    const ratios: Ratio[] = [
      // Liquidez
      mk('currentRatio', 'LIQUIDITY', 'Razón corriente', 'Activo corriente / Pasivo corriente', 'ratio', div(end.currentAssets, end.currentLiabilities), 'No hay pasivo corriente'),
      mk('quickRatio', 'LIQUIDITY', 'Prueba ácida', '(Efectivo + Cuentas por cobrar) / Pasivo corriente', 'ratio', div(end.cash.plus(end.receivables), end.currentLiabilities), 'No hay pasivo corriente'),
      mk('cashRatio', 'LIQUIDITY', 'Razón de efectivo', 'Efectivo / Pasivo corriente', 'ratio', div(end.cash, end.currentLiabilities), 'No hay pasivo corriente'),
      mk('workingCapital', 'LIQUIDITY', 'Capital de trabajo', 'Activo corriente - Pasivo corriente', 'amount', end.currentAssets.minus(end.currentLiabilities)),
      // Endeudamiento
      mk('debtToAssets', 'LEVERAGE', 'Endeudamiento', 'Pasivo total / Activo total', 'percent', pctOf(end.totalLiabilities, end.totalAssets), 'No hay activos'),
      mk('debtToEquity', 'LEVERAGE', 'Deuda sobre patrimonio', 'Pasivo total / Patrimonio', 'ratio', divPos(end.totalLiabilities, end.totalEquity), NEG_EQ),
      mk('equityMultiplier', 'LEVERAGE', 'Apalancamiento', 'Activo total / Patrimonio', 'ratio', divPos(end.totalAssets, end.totalEquity), NEG_EQ),
      mk('interestCoverage', 'LEVERAGE', 'Cobertura de intereses', 'Utilidad operativa (EBIT) / Costos financieros', 'ratio', div(ebit, financeCost), 'No hay costos financieros en el período'),
      // Rentabilidad
      mk('grossMargin', 'PROFITABILITY', 'Margen bruto', '(Ingresos operativos - Costo de ventas) / Ingresos operativos', 'percent', pctOf(grossProfit, operatingRevenue), 'No hay ingresos operativos'),
      mk('operatingMargin', 'PROFITABILITY', 'Margen operativo', 'Utilidad operativa (EBIT) / Ingresos operativos', 'percent', pctOf(ebit, operatingRevenue), 'No hay ingresos operativos'),
      mk('netMargin', 'PROFITABILITY', 'Margen neto', 'Utilidad neta / Ingresos totales', 'percent', pctOf(netIncome, is.totalIncome), 'No hay ingresos'),
      mk('roa', 'PROFITABILITY', 'Rentabilidad sobre activos (ROA)', 'Utilidad neta / Activo total promedio', 'percent', pctOfPos(netIncome, avg('totalAssets')), 'No hay activos'),
      mk('roe', 'PROFITABILITY', 'Rentabilidad sobre patrimonio (ROE)', 'Utilidad neta / Patrimonio promedio', 'percent', end.totalEquity.gt(0) ? pctOfPos(netIncome, avg('totalEquity')) : null, NEG_EQ),
      // Actividad
      mk('receivablesTurnover', 'ACTIVITY', 'Rotación de cuentas por cobrar', 'Ingresos operativos / Cuentas por cobrar promedio', 'ratio', div(operatingRevenue, avgAR), 'No hay cuentas por cobrar'),
      mk('daysSalesOutstanding', 'ACTIVITY', 'Días de cobro', 'Cuentas por cobrar promedio × días del período / Ingresos operativos', 'days', dso, 'No hay ingresos operativos'),
      mk('payablesTurnover', 'ACTIVITY', 'Rotación de cuentas por pagar', 'Costo de ventas / Cuentas por pagar promedio', 'ratio', div(costOfSales, avgAP), 'No hay cuentas por pagar'),
      mk('daysPayablesOutstanding', 'ACTIVITY', 'Días de pago', 'Cuentas por pagar promedio × días del período / Costo de ventas', 'days', dpo, 'No hay costo de ventas'),
      mk('inventoryTurnover', 'ACTIVITY', 'Rotación de inventario', 'Costo de ventas / Inventario promedio', 'ratio', div(costOfSales, avgInv), 'No hay inventario'),
      mk('daysInventoryOutstanding', 'ACTIVITY', 'Días de inventario', 'Inventario promedio × días del período / Costo de ventas', 'days', dio, 'No hay costo de ventas'),
      mk('cashConversionCycle', 'ACTIVITY', 'Ciclo de conversión de efectivo', 'Días de cobro + Días de inventario - Días de pago', 'days',
        dso !== null && dio !== null && dpo !== null ? round4(dso.plus(dio).minus(dpo)) : null, 'Falta alguno de los tres componentes'),
    ];

    const warnings: string[] = [];
    if (unclassified.length) {
      warnings.push(`${unclassified.length} cuenta(s) con saldo o movimiento no tienen categoría; las razones que dependen de ellas pueden estar incompletas (Clasificación de cuentas)`);
    }
    if (!closing.balanced) warnings.push('El balance general no cuadra a la fecha de corte');
    if (days < 360) warnings.push(`El período es de ${days} días: las razones de rentabilidad no están anualizadas`);

    return {
      from: q.from,
      to: q.to,
      periodDays: days,
      // 'average': promedio de saldo inicial y final; 'closing': sin historia previa, solo el saldo final
      balancesBasis: useAverage ? 'average' : 'closing',
      balanced: closing.balanced,
      complete: unclassified.length === 0,
      warnings,
      unclassified,
      statement: {
        operatingRevenue, otherRevenue, costOfSales, grossProfit, operatingExpenses, depreciationAndAmortization: depreciation,
        ebitda, ebit, financeCost, otherExpense, incomeTax, totalIncome: is.totalIncome, totalExpenses: is.totalExpenses, netIncome,
      },
      balance: {
        closing: end,
        opening: start,
      },
      ratios,
    };
  }
}