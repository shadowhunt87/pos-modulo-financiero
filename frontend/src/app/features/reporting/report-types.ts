/** Respuestas de /reports, /accounting/trial-balance y /dgii (los Decimal llegan como string). */
export interface RLine { accountId: string; code: string; name: string; amount: string }

export interface IncomeStatement {
  from: string; to: string; income: RLine[]; expenses: RLine[]; totalIncome: string; totalExpenses: string; netIncome: string;
}
export interface BalanceSheet {
  asOf: string; periodStart: string; assets: RLine[]; liabilities: RLine[]; equity: RLine[];
  netIncomeOfPeriod: string; netIncomePriorPeriods: string; totalAssets: string; totalLiabilities: string; totalEquity: string; balanced: boolean;
}
export interface CashLine { accountId: string | null; code: string | null; name: string; amount: string; kind?: string }
export interface CashSection { lines: CashLine[]; total: string }
export interface CashFlow {
  from: string; to: string; method: string;
  operating: CashSection; investing: CashSection; financing: CashSection; unclassified: CashSection;
  netChangeInCash: string; cashAtBeginning: string; cashAtEnd: string; calculatedChange: string; difference: string;
  balanced: boolean; warnings: string[];
}
export interface TrialLine { accountId: string; code: string; name: string; type: string; debit: string; credit: string; balance: string }
export interface TrialBalance { from: string | null; to: string | null; lines: TrialLine[]; totalDebit: string; totalCredit: string; balanced: boolean }
export interface GlLine {
  accountId: string; code: string; name: string; type: string; nature: string;
  openingBalance: string; debit: string; credit: string; closingBalance: string;
}
export interface GlSummary { from: string | null; to: string | null; lines: GlLine[]; totalDebit: string; totalCredit: string }
export interface JournalBookEntry {
  id: string; date: string; description: string; reference: string | null; totalDebit: string; totalCredit: string;
  lines: { accountId: string; code: string; name: string; description: string | null; debit: string; credit: string }[];
}
export interface JournalBook {
  from: string | null; to: string | null; page: number; limit: number; total: number; totalDebit: string; totalCredit: string; data: JournalBookEntry[];
}
export interface LedgerSource { type: string; id: string | null; number?: string | null; ncf?: string | null; kind?: string | null; href?: string }
export interface LedgerMovement {
  lineId: string; entryId: string; entryNumber: string | null; entryType: string; date: string; description: string; reference: string | null;
  lineDescription: string | null; debit: string; credit: string; balance: string; partner: { id: string; name: string } | null; source: LedgerSource | null;
}
export interface LedgerDetail {
  account: { id: string; code: string; name: string; type: string; nature: string }; partnerId: string | null;
  from: string | null; to: string | null; page: number; limit: number; total: number;
  openingBalance: string; totalDebit: string; totalCredit: string; closingBalance: string; movements: LedgerMovement[];
}
export interface SubledgerRow {
  partnerId: string | null; name: string; taxId: string | null; openingBalance: string; debit: string; credit: string; closingBalance: string;
}
export interface Subledger {
  account: { id: string; code: string; name: string; type: string }; from: string | null; to: string | null; partners: SubledgerRow[];
  totals: { openingBalance: string; debit: string; credit: string; closingBalance: string }; unassignedBalance: string; warnings: string[];
}
export interface Ratio { key: string; group: string; label: string; formula: string; unit: 'ratio' | 'percent' | 'days' | 'amount'; value: string | null; note?: string }
export interface Ratios {
  from: string; to: string; periodDays: number; balancesBasis: string; balanced: boolean; complete: boolean; warnings: string[];
  unclassified: { accountId: string; code: string; name: string; section: string; amount: string }[];
  statement: Record<string, string>;
  ratios: Ratio[];
}

/** DGII */
export interface DgiiIssue { invoiceId: string; invoiceNumber: string; ncf: string | null; message: string }
export type DgiiRow = Record<string, string>;
export interface DgiiReport {
  format: '606' | '607' | '608'; period: string; company: { name: string; rnc: string | null }; fileName: string; count: number;
  totals?: { totalInvoiced: string; itbis: string; itbisWithheld: string; isrWithheld: string };
  consumerSummary?: { count: number; amount: string; itbis: string; total: string };
  rows: DgiiRow[]; errors: DgiiIssue[]; warnings: DgiiIssue[]; canExport: boolean; assumptions: string[];
}

/** Presupuestos */
export interface BudgetHead { id: string; name: string; year: number; status: string; notes: string | null; createdAt: string; _count?: { lines: number } }
export interface BudgetLine { id: string; budgetId: string; accountId: string; month: number; plannedAmount: string; account: { code: string; name: string; type: string } }
export interface BudgetFull extends BudgetHead { lines: BudgetLine[]; totalPlanned: string }
export interface VaMonth { month: number; planned: string; actual: string; variance: string; variancePct: string | null; favorable: boolean }
export interface VaRow {
  accountId: string; code: string; name: string; type: string; budgeted: boolean;
  planned: string; actual: string; variance: string; variancePct: string | null; favorable: boolean; months: VaMonth[];
}
export interface VaTotal { planned: string; actual: string; variance: string }
export interface VsActual {
  budget: { id: string; name: string; year: number; status: string }; fromMonth: number; toMonth: number; rows: VaRow[];
  totals: { income: VaTotal; expense: VaTotal; netResult: VaTotal };
}
