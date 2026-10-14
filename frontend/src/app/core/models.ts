/** Tipos compartidos con el backend (los Decimal llegan como string). */
export interface Account {
  id: string; code: string; name: string; type: string; parentId: string | null; category: string | null;
  cashFlowCategory: string | null; isContra: boolean; isPostable: boolean; subledger: string | null;
  currency: string | null; description: string | null; active: boolean;
}
export interface Partner {
  id: string; type: string; name: string; tradeName: string | null; taxId: string | null; taxIdType: string | null;
  email: string | null; phone: string | null; address: string | null; city: string | null; country: string;
  creditLimit: string | null; paymentTermsDays: number; defaultNcfType: string | null; isWithholdingAgent: boolean; active: boolean;
}
export interface TaxRate {
  id: string; name: string; rate: string; type: string; appliesTo: string; isWithholding: boolean; dgiiCode: string | null;
  salesAccountId: string | null; purchaseAccountId: string | null; active: boolean;
  /** N2: enlazado a un valor fiscal con vigencia (la tasa sale de ahí). */
  parameterKey?: string | null;
}
export interface Journal { id: string; code: string; name: string; type: string; nextNumber: number; active: boolean }
export interface BankAccount {
  id: string; bankName: string; accountNumber: string; iban: string | null; swift: string | null; type: string; currency: string;
  openingBalance: string; openingBalanceDate: string | null; glAccountId: string | null; active: boolean; glBalance?: string | null;
}
export interface CashRegister {
  id: string; name: string; currency: string; glAccountId: string | null; custodianId: string | null; openingBalance: string; active: boolean;
}
export interface Company {
  id: string; name: string; legalName: string | null; taxId: string; baseCurrency: string; country: string;
  fiscalYearStartMonth: number; address: string | null; phone: string | null; email: string | null; logoUrl: string | null; active: boolean;
}
