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

/** P1: producto o servicio del catálogo (con inventario si es un bien que lo controla, P2). */
export interface Product {
  id: string; code: string; name: string; description: string | null; kind: 'GOODS' | 'SERVICE'; unit: string;
  salePrice: string | null; purchasePrice: string | null; saleTaxRateId: string | null; purchaseTaxRateId: string | null;
  incomeAccountId: string | null; expenseAccountId: string | null; active: boolean;
  tracksInventory: boolean; inventoryAccountId: string | null; cogsAccountId: string | null;
  stockQty: string; stockValue: string; avgCost: string;
  saleTaxRate?: { id: string; name: string; rate: string } | null; purchaseTaxRate?: { id: string; name: string; rate: string } | null;
}

/** P2: inventario. */
export interface StockRow { id: string; code: string; name: string; unit: string; active: boolean; stockQty: string; avgCost: string; stockValue: string }
export interface InventoryMovement {
  id: string; seq: number; date: string; type: string; quantity: string; unitCost: string; totalCost: string; qtyAfter: string; valueAfter: string;
  reversalOfId: string | null;
  invoice: { id: string; number: string; type: string; ncf: string | null } | null;
  adjustment: { id: string; number: string } | null;
  journalEntry: { id: string; number: string | null } | null;
}
export interface InventoryAdjustment {
  id: string; number: string; date: string; reason: string; status: 'POSTED' | 'VOIDED'; voidedAt: string | null; voidReason: string | null;
  counterAccount: { id: string; code: string; name: string };
  journalEntry?: { id: string; number: string | null; status: string } | null;
  lines?: { id: string; quantity: string; unitCost: string; totalCost: string; product: { id: string; code: string; name: string; unit: string } }[];
  _count?: { lines: number };
}
