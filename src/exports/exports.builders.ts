import { Prisma } from '../generated/prisma/client.js';
import type { Cell, Column, Row, Section } from './table-doc.js';

type Num = Prisma.Decimal | string | number | null | undefined;

/** Decimal -> número con 2 decimales (para celdas de Excel) */
export const mn = (v: Num): number | null => (v === null || v === undefined ? null : Number(new Prisma.Decimal(v).toDecimalPlaces(2).toFixed(2)));
export const r4 = (v: Num): number | null => (v === null || v === undefined ? null : Number(new Prisma.Decimal(v).toDecimalPlaces(4).toFixed(4)));

export const row = (...cells: Cell[]): Row => ({ cells });
export const bold = (...cells: Cell[]): Row => ({ cells, bold: true });

const money: Column = { header: '', fmt: 'money' };
export const C = {
  code: (header = 'Código'): Column => ({ header, w: 1 }),
  name: (header = 'Cuenta'): Column => ({ header, w: 3 }),
  money: (header: string): Column => ({ ...money, header, w: 1.4 }),
  text: (header: string, w = 1, xlsxOnly = false): Column => ({ header, w, xlsxOnly }),
  moneyX: (header: string, xlsxOnly = false): Column => ({ header, fmt: 'money', w: 1.2, xlsxOnly }),
};

export const TYPE_ES: Record<string, string> = {
  ASSET: 'Activo', LIABILITY: 'Pasivo', EQUITY: 'Patrimonio', INCOME: 'Ingreso', EXPENSE: 'Gasto',
};

export const periodLabel = (from?: string | null, to?: string | null) =>
  from && to ? `Del ${from.slice(0, 10)} al ${to.slice(0, 10)}` : from ? `Desde ${from.slice(0, 10)}` : to ? `Hasta ${to.slice(0, 10)}` : 'Todo el historial';

// ---------------------------------------------------------------- balanza
interface TbLine { code: string; name: string; type: string; debit: Num; credit: Num; balance: Num }
export function trialBalanceSection(r: { lines: TbLine[]; totalDebit: Num; totalCredit: Num; balanced?: boolean }): Section {
  return {
    title: 'Balanza de comprobación',
    columns: [C.code(), C.name(), C.text('Tipo'), C.money('Débito'), C.money('Crédito'), C.money('Saldo')],
    rows: r.lines.map((l) => row(l.code, l.name, TYPE_ES[l.type] ?? l.type, mn(l.debit), mn(l.credit), mn(l.balance))),
    totals: ['Totales', '', '', mn(r.totalDebit), mn(r.totalCredit), null],
    notes: r.balanced === false ? ['ATENCION: la balanza no cuadra (débitos distintos de créditos).'] : [],
  };
}

// ---------------------------------------------------------------- mayor general
interface GlLine { code: string; name: string; openingBalance: Num; debit: Num; credit: Num; closingBalance: Num }
export function generalLedgerSection(r: { lines: GlLine[]; totalDebit: Num; totalCredit: Num }): Section {
  return {
    title: 'Mayor general',
    columns: [C.code(), C.name(), C.money('Saldo inicial'), C.money('Débito'), C.money('Crédito'), C.money('Saldo final')],
    rows: r.lines.map((l) => row(l.code, l.name, mn(l.openingBalance), mn(l.debit), mn(l.credit), mn(l.closingBalance))),
    totals: ['Totales', '', null, mn(r.totalDebit), mn(r.totalCredit), null],
  };
}

// ---------------------------------------------------------------- estado de resultados
interface AmtLine { code: string | null; name: string; amount: Num }
const amtRows = (ls: AmtLine[]) => ls.map((l) => row(l.code ?? '', l.name, mn(l.amount)));
export function incomeStatementSection(r: { income: AmtLine[]; expenses: AmtLine[]; totalIncome: Num; totalExpenses: Num; netIncome: Num }): Section {
  return {
    title: 'Estado de resultados',
    columns: [C.code(), C.name(), C.money('Monto')],
    rows: [
      bold('', 'INGRESOS', null), ...amtRows(r.income), bold('', 'Total ingresos', mn(r.totalIncome)),
      bold('', 'GASTOS', null), ...amtRows(r.expenses), bold('', 'Total gastos', mn(r.totalExpenses)),
    ],
    totals: ['', 'RESULTADO NETO', mn(r.netIncome)],
    notes: ['Los asientos de cierre de año no se incluyen en este estado.'],
  };
}

// ---------------------------------------------------------------- balance general
export function balanceSheetSection(r: {
  assets: AmtLine[]; liabilities: AmtLine[]; equity: AmtLine[]; netIncomeOfPeriod: Num; netIncomePriorPeriods: Num;
  totalAssets: Num; totalLiabilities: Num; totalEquity: Num; balanced: boolean;
}): Section {
  const liabEq = new Prisma.Decimal(r.totalLiabilities ?? 0).plus(new Prisma.Decimal(r.totalEquity ?? 0));
  return {
    title: 'Balance general',
    columns: [C.code(), C.name(), C.money('Monto')],
    rows: [
      bold('', 'ACTIVOS', null), ...amtRows(r.assets), bold('', 'Total activos', mn(r.totalAssets)),
      bold('', 'PASIVOS', null), ...amtRows(r.liabilities), bold('', 'Total pasivos', mn(r.totalLiabilities)),
      bold('', 'PATRIMONIO', null), ...amtRows(r.equity),
      row('', 'Resultado de ejercicios anteriores (sin cerrar)', mn(r.netIncomePriorPeriods)),
      row('', 'Resultado del período', mn(r.netIncomeOfPeriod)),
      bold('', 'Total patrimonio', mn(r.totalEquity)),
    ],
    totals: ['', 'TOTAL PASIVO + PATRIMONIO', mn(liabEq)],
    notes: r.balanced ? [] : ['ATENCION: el balance no cuadra (activos distintos de pasivo + patrimonio).'],
  };
}

// ---------------------------------------------------------------- flujo de efectivo
interface CfBlock { lines: AmtLine[]; total: Num }
export function cashFlowSection(r: {
  operating: CfBlock; investing: CfBlock; financing: CfBlock; unclassified: CfBlock;
  netChangeInCash: Num; cashAtBeginning: Num; cashAtEnd: Num; difference: Num; warnings: string[];
}): Section {
  const rows: Row[] = [
    bold('', 'ACTIVIDADES DE OPERACION', null), ...amtRows(r.operating.lines), bold('', 'Flujo neto de operación', mn(r.operating.total)),
    bold('', 'ACTIVIDADES DE INVERSION', null), ...amtRows(r.investing.lines), bold('', 'Flujo neto de inversión', mn(r.investing.total)),
    bold('', 'ACTIVIDADES DE FINANCIAMIENTO', null), ...amtRows(r.financing.lines), bold('', 'Flujo neto de financiamiento', mn(r.financing.total)),
  ];
  if (r.unclassified.lines.length) {
    rows.push(bold('', 'SIN CLASIFICAR', null), ...amtRows(r.unclassified.lines), bold('', 'Total sin clasificar', mn(r.unclassified.total)));
  }
  rows.push(
    bold('', 'Aumento (disminución) neto de efectivo', mn(r.netChangeInCash)),
    row('', 'Efectivo al inicio del período', mn(r.cashAtBeginning)),
    bold('', 'Efectivo al final del período', mn(r.cashAtEnd)),
    row('', 'Diferencia sin explicar', mn(r.difference)),
  );
  return { title: 'Flujo de efectivo', columns: [C.code(), C.name(), C.money('Monto')], rows, notes: r.warnings };
}

// ---------------------------------------------------------------- razones financieras
const GROUP_ES: Record<string, string> = { LIQUIDITY: 'Liquidez', LEVERAGE: 'Endeudamiento', PROFITABILITY: 'Rentabilidad', ACTIVITY: 'Actividad' };
const STATEMENT_ES: [string, string][] = [
  ['operatingRevenue', 'Ingresos operativos'], ['otherRevenue', 'Otros ingresos'], ['costOfSales', 'Costo de ventas'],
  ['grossProfit', 'Utilidad bruta'], ['operatingExpenses', 'Gastos operativos'],
  ['depreciationAndAmortization', 'Depreciación y amortización'], ['ebitda', 'EBITDA'], ['ebit', 'EBIT (utilidad operativa)'],
  ['financeCost', 'Costos financieros'], ['otherExpense', 'Otros gastos'], ['incomeTax', 'Impuesto sobre la renta'], ['netIncome', 'Utilidad neta'],
];
export function ratiosSections(r: {
  statement: Record<string, Num>;
  ratios: { group: string; label: string; formula: string; unit: 'ratio' | 'percent' | 'days' | 'amount'; value: Num; note?: string }[];
  warnings: string[]; unclassified: { code?: string; name?: string }[]; balancesBasis: string;
}): Section[] {
  const unit = (u: string) => (u === 'amount' ? 'money' : (u as 'ratio' | 'percent' | 'days'));
  const notes = [...r.warnings];
  if (r.unclassified.length) notes.push(`Cuentas sin clasificar (afectan las razones): ${r.unclassified.map((u) => `${u.code ?? ''} ${u.name ?? ''}`.trim()).join('; ')}`);
  return [
    {
      title: 'Estado de resultados',
      columns: [C.text('Concepto', 3), C.money('Monto')],
      rows: STATEMENT_ES.map(([k, label]) => row(label, mn(r.statement[k]))),
    },
    {
      title: 'Razones',
      columns: [C.text('Grupo'), C.text('Razón', 2), C.text('Fórmula', 3), { header: 'Valor', fmt: 'ratio', w: 1.2 }, C.text('Nota', 3, true)],
      rows: r.ratios.map((x) => row(GROUP_ES[x.group] ?? x.group, x.label, x.formula, { v: r4(x.value), fmt: unit(x.unit) }, x.note ?? '')),
      notes: [`Saldos usados: ${r.balancesBasis === 'average' ? 'promedio de inicio y cierre' : 'solo cierre'}.`, ...notes],
    },
  ];
}

// ---------------------------------------------------------------- DGII
interface DgiiIssueLike { invoiceNumber: string; ncf: string | null; message: string }
const issuesSection = (errors: DgiiIssueLike[], warnings: DgiiIssueLike[]): Section => ({
  title: 'Observaciones',
  columns: [C.text('Tipo'), C.text('Factura'), C.text('NCF', 1.4), C.text('Mensaje', 6)],
  rows: [
    ...errors.map((e) => row('ERROR', e.invoiceNumber, e.ncf ?? '', e.message)),
    ...warnings.map((e) => row('Aviso', e.invoiceNumber, e.ncf ?? '', e.message)),
  ],
});
const summarySection = (totals: Record<string, string>, count: number, assumptions: string[], canExport: boolean, extra: [string, string | number][] = []): Section => ({
  title: 'Resumen',
  columns: [C.text('Concepto', 3), { header: 'Valor', fmt: 'money', w: 1.4 }],
  rows: [
    row('Registros', { v: count, fmt: 'int' }),
    ...Object.entries(totals).map(([k, v]) => row(TOTAL_ES[k] ?? k, mn(v))),
    ...extra.map(([k, v]) => row(k, typeof v === 'number' ? { v, fmt: 'int' as const } : mn(v))),
    row(canExport ? 'Listo para generar el archivo TXT' : 'NO se puede generar el TXT: corrija los errores', null),
  ],
  notes: assumptions,
});
const TOTAL_ES: Record<string, string> = {
  totalInvoiced: 'Total facturado', itbis: 'ITBIS', itbisWithheld: 'ITBIS retenido', isrWithheld: 'ISR retenido',
};
type R = Record<string, string>;
const kindEs = (k: string) => (k === 'ORIGINAL' ? 'Original' : 'Retención');

export function dgii606Sections(r: { rows: R[]; totals: R; count: number; errors: DgiiIssueLike[]; warnings: DgiiIssueLike[]; assumptions: string[]; canExport: boolean }): Section[] {
  const cols: Column[] = [
    C.text('Factura', 1.2), C.text('RNC/Cédula', 1.3), C.text('Tipo ID', 1, true), C.text('Tipo gasto', 0.8), C.text('NCF', 1.6), C.text('NCF modificado', 1.6, true),
    C.text('Fecha comprobante', 1.2), C.text('Fecha pago', 1.2, true), C.moneyX('Servicios', true), C.moneyX('Bienes', true), C.moneyX('Total facturado'),
    C.moneyX('ITBIS facturado'), C.moneyX('ITBIS retenido'), C.moneyX('ITBIS proporcionalidad', true), C.moneyX('ITBIS al costo', true), C.moneyX('ITBIS por adelantar', true),
    C.moneyX('ITBIS percibido', true), C.text('Tipo retención ISR', 1, true), C.moneyX('ISR retenido'), C.moneyX('ISR percibido', true), C.moneyX('ISC', true),
    C.moneyX('Otros impuestos', true), C.moneyX('Propina', true), C.text('Forma de pago', 0.8), C.text('Fila', 1, true), C.text('Tipo doc.', 1, true),
  ];
  const detail: Section = {
    title: 'Detalle 606',
    columns: cols,
    rows: r.rows.map((x) => row(
      x.invoiceNumber, x.rnc, x.idType, x.expenseType, x.ncf, x.ncfModified, x.voucherDate, x.paymentDate, mn(x.services), mn(x.goods), mn(x.total),
      mn(x.itbis), mn(x.itbisWithheld), mn(x.itbisProportional), mn(x.itbisCost), mn(x.itbisAdvance), mn(x.itbisPerceived), x.isrType, mn(x.isrWithheld),
      mn(x.isrPerceived), mn(x.isc), mn(x.otherTaxes), mn(x.tip), x.paymentForm, kindEs(x.kind), x.docType,
    )),
    totals: ['Totales', '', '', '', '', '', '', '', null, null, mn(r.totals.totalInvoiced), mn(r.totals.itbis), mn(r.totals.itbisWithheld), null, null, null, null, '', mn(r.totals.isrWithheld), null, null, null, null, '', '', ''],
  };
  return [detail, summarySection(r.totals, r.count, r.assumptions, r.canExport), issuesSection(r.errors, r.warnings)];
}

export function dgii607Sections(r: {
  rows: R[]; totals: R; count: number; errors: DgiiIssueLike[]; warnings: DgiiIssueLike[]; assumptions: string[]; canExport: boolean;
  consumerSummary: { count: number; amount: string; itbis: string; total: string };
}): Section[] {
  const cols: Column[] = [
    C.text('Factura', 1.2), C.text('RNC/Cédula', 1.3), C.text('Tipo ID', 1, true), C.text('NCF', 1.6), C.text('NCF modificado', 1.6, true), C.text('Tipo ingreso', 0.8),
    C.text('Fecha comprobante', 1.2), C.text('Fecha retención', 1.2, true), C.moneyX('Monto facturado'), C.moneyX('ITBIS facturado'), C.moneyX('ITBIS retenido'),
    C.moneyX('ITBIS percibido', true), C.moneyX('ISR retenido'), C.moneyX('ISR percibido', true), C.moneyX('ISC', true), C.moneyX('Otros impuestos', true), C.moneyX('Propina', true),
    C.moneyX('Efectivo', true), C.moneyX('Cheque/transferencia', true), C.moneyX('Tarjeta', true), C.moneyX('Crédito', true), C.moneyX('Bonos', true), C.moneyX('Permuta', true),
    C.moneyX('Otras formas', true), C.text('Fila', 1, true), C.text('Tipo doc.', 1, true),
  ];
  const detail: Section = {
    title: 'Detalle 607',
    columns: cols,
    rows: r.rows.map((x) => row(
      x.invoiceNumber, x.rnc, x.idType, x.ncf, x.ncfModified, x.incomeType, x.voucherDate, x.retentionDate, mn(x.amount), mn(x.itbis), mn(x.itbisWithheld),
      mn(x.itbisPerceived), mn(x.isrWithheld), mn(x.isrPerceived), mn(x.isc), mn(x.otherTaxes), mn(x.tip), mn(x.cash), mn(x.checkTransfer), mn(x.card), mn(x.credit),
      mn(x.bonds), mn(x.swap), mn(x.otherForms), kindEs(x.kind), x.docType,
    )),
    totals: ['Totales', '', '', '', '', '', '', '', mn(r.totals.totalInvoiced), mn(r.totals.itbis), mn(r.totals.itbisWithheld), null, mn(r.totals.isrWithheld), null, null, null, null, null, null, null, null, null, null, null, '', ''],
  };
  const cs = r.consumerSummary;
  const extra: [string, string | number][] = [
    ['Facturas de consumo menores al umbral (cantidad)', cs.count], ['Consumo: monto', cs.amount], ['Consumo: ITBIS', cs.itbis], ['Consumo: total', cs.total],
  ];
  return [detail, summarySection(r.totals, r.count, r.assumptions, r.canExport, extra), issuesSection(r.errors, r.warnings)];
}

export function dgii608Sections(r: { rows: { invoiceNumber: string; ncf: string; voucherDate: string; voidType: string }[]; count: number; errors: DgiiIssueLike[]; assumptions: string[]; canExport: boolean }): Section[] {
  return [
    {
      title: 'Detalle 608',
      columns: [C.text('Factura'), C.text('NCF', 1.6), C.text('Fecha comprobante'), C.text('Tipo anulación')],
      rows: r.rows.map((x) => row(x.invoiceNumber, x.ncf, x.voucherDate, x.voidType)),
    },
    summarySection({}, r.count, r.assumptions, r.canExport),
    issuesSection(r.errors, []),
  ];
}
