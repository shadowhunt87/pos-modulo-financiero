/** Reglas de clasificación contable (espejo de las validaciones del backend). */
export const CATEGORIES_BY_TYPE: Record<string, string[]> = {
  ASSET: ['CASH_AND_EQUIVALENTS', 'ACCOUNTS_RECEIVABLE', 'INVENTORY', 'PREPAID_AND_OTHER_CURRENT_ASSETS', 'PROPERTY_PLANT_EQUIPMENT', 'INTANGIBLE_ASSETS', 'OTHER_NON_CURRENT_ASSETS'],
  LIABILITY: ['ACCOUNTS_PAYABLE', 'SHORT_TERM_DEBT', 'TAXES_PAYABLE', 'OTHER_CURRENT_LIABILITIES', 'LONG_TERM_DEBT', 'OTHER_NON_CURRENT_LIABILITIES'],
  EQUITY: ['SHARE_CAPITAL', 'RETAINED_EARNINGS', 'CURRENT_YEAR_RESULT', 'OTHER_EQUITY'],
  INCOME: ['OPERATING_REVENUE', 'OTHER_REVENUE'],
  EXPENSE: ['COST_OF_SALES', 'OPERATING_EXPENSE', 'DEPRECIATION_AMORTIZATION', 'FINANCE_COST', 'OTHER_EXPENSE', 'INCOME_TAX'],
};

/** Flujo de efectivo: no aplica a ingresos ni gastos; "equivalente de efectivo" solo a activos. */
export function cashFlowAllowed(type: string): string[] {
  if (type === 'INCOME' || type === 'EXPENSE') return [];
  return type === 'ASSET' ? ['OPERATING', 'INVESTING', 'FINANCING', 'CASH_EQUIVALENT'] : ['OPERATING', 'INVESTING', 'FINANCING'];
}
/** Auxiliares válidos: PAYABLE para pasivos; el resto para activos. */
export function subledgerAllowed(type: string): string[] {
  if (type === 'LIABILITY') return ['PAYABLE'];
  return type === 'ASSET' ? ['RECEIVABLE', 'BANK', 'CASH'] : [];
}
