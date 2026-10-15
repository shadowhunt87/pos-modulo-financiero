import { Partner } from '../../core/models';

/** Formas de las facturas tal como las devuelve el backend (los Decimal llegan como string). */
export interface InvoiceRow {
  id: string; number: string; type: string; status: string; ncf: string | null; ncfType: string | null;
  currency: string; exchangeRate: string; issueDate: string; dueDate: string | null;
  subtotal: string; discountTotal: string; taxTotal: string; withholdingTotal: string; total: string; amountPaid: string; balance: string;
  partner: { id: string; name: string; taxId: string | null };
}
export interface InvoiceLineRow {
  /** N2: tasa usada al calcular (null en facturas viejas). */
  appliedRate?: string | null;
  id: string; description: string; quantity: string; unitPrice: string; discount: string; taxRateId: string | null;
  taxAmount: string; total: string; accountId: string | null; costCenterId: string | null;
  /** P1: producto del catálogo (si la línea salió de él). */
  productId?: string | null;
  taxRate: { name: string; rate: string } | null;
}
export interface InvoiceWithholdingRow {
  appliedRate?: string | null;
  id: string; taxRateId: string; base: string; amount: string; taxRate: { name: string; rate: string } | null;
}
export interface InvoiceFull extends Omit<InvoiceRow, 'partner'> {
  partner: Partner; lines: InvoiceLineRow[]; withholdings: InvoiceWithholdingRow[];
  ncfExpiration: string | null; relatedInvoiceId: string | null; dgiiExpenseType: string | null; dgiiIncomeType: string | null;
  notes: string | null; journalEntryId: string | null; issuedAt: string | null; voidedAt: string | null; voidReason: string | null; voidReasonCode: string | null;
  journalEntry: { id: string; number: string; status: string } | null;
  relatedInvoice: { id: string; number: string; ncf: string | null } | null;
  // e-CF importado de XML (PLAN-v0.3 §7.2); null en facturas serie B
  ecfDocument?: { status: string; origin: string; verification: 'UNVERIFIED' | 'VERIFIED'; eNcf: string; issuerRnc: string; createdAt: string } | null;
}
export interface NcfType { code: string; name: string }

/** Códigos de anulación DGII (reporte 608). */
export const VOID_REASON_CODE: Record<string, string> = {
  '01': 'Deterioro de factura preimpresa', '02': 'Errores de impresión (preimpresa)', '03': 'Impresión defectuosa',
  '04': 'Duplicidad de factura', '05': 'Corrección de la información', '06': 'Cambio de productos',
  '07': 'Devolución de productos', '08': 'Omisión de productos', '09': 'Errores en secuencia de NCF', '10': 'Por cese de operaciones',
};
export const DGII_EXPENSE_TYPE: Record<string, string> = {
  '01': 'Gastos de personal', '02': 'Trabajos, suministros y servicios', '03': 'Arrendamientos', '04': 'Activos fijos',
  '05': 'Representación', '06': 'Otras deducciones admitidas', '07': 'Gastos financieros', '08': 'Gastos extraordinarios',
  '09': 'Compras y gastos que forman parte del costo de venta', '10': 'Adquisiciones de activos', '11': 'Gastos de seguros',
};
export const DGII_INCOME_TYPE: Record<string, string> = {
  '01': 'Ingresos por operaciones (no financieros)', '02': 'Ingresos financieros', '03': 'Ingresos extraordinarios',
  '04': 'Ingresos por arrendamientos', '05': 'Ingresos por venta de activo depreciable', '06': 'Otros ingresos',
};
