/** Tipos del punto de venta (respuestas de /pos). Montos como texto con decimales (Decimal del backend). */
export interface PosSettings {
  defaultNcfType: string; fiscalCreditNcfType: string; maxDiscountPct: string; receiptFooter: string | null;
  defaultPartner: { id: string; name: string } | null;
}
export interface PosCategory { id: string; name: string; color: string | null; sortOrder: number; active: boolean }
export interface PosProduct {
  id: string; code: string; name: string; unit: string; kind: 'GOODS' | 'SERVICE'; salePrice: string; saleTaxRateId: string | null;
  tracksInventory: boolean; stockQty: string; categoryId: string | null; sortOrder: number; barcodes: string[];
  tax: { name: string; rate: string } | null;
}
export interface PosPromotion {
  id: string; name: string; type: 'PERCENT' | 'BUY_X_PAY_Y' | 'FIXED_PRICE'; value: string | null; buyQty: number | null; payQty: number | null;
  productIds: string[]; categoryIds: string[]; startsAt: string | null; endsAt: string | null; weekdays: number[];
  timeFrom: string | null; timeTo: string | null; priority: number; active: boolean;
}
export interface PosCatalog { settings: PosSettings; categories: PosCategory[]; products: PosProduct[]; promotions: PosPromotion[]; serverTime: string }
export interface PosTerminalLite { id: string; code: string; name: string }
export interface PosContext { configured: boolean; isSupervisor: boolean; terminals: PosTerminalLite[] }
export interface PosCustomer { id: string; name: string; taxId: string | null; taxIdType: string | null; defaultNcfType: string | null; creditLimit: string | null }

export type PayMethod = 'CASH' | 'CARD' | 'TRANSFER';
export interface ShiftTotals {
  salesCount: number; voidedCount: number; returnsCount: number; grossSales: string; discounts: string; taxes: string; creditSales: string;
  salesByMethod: Record<PayMethod, string>; refundsByMethod: Record<PayMethod, string>; cashIn: string; cashOut: string; drawerOpens: number;
  openingCash: string; expectedCash: string;
}
export interface PosShift {
  id: string; number: string; status: 'OPEN' | 'CLOSED'; terminalId: string; terminal: { id: string; code: string; name: string };
  openedAt: string; openingCash: string; openedBy: string | null; closedAt: string | null; closedBy: string | null;
  expectedCash: string | null; countedCash: string | null; difference: string | null; closeNotes: string | null;
  movements: { id: string; type: 'IN' | 'OUT'; amount: string; reason: string; createdAt: string }[];
  drawerEvents: { id: string; reason: string; createdAt: string }[];
  totals: ShiftTotals;
}
export interface PosSaleLine { id: string; productId: string; description: string; quantity: string; unitPrice: string; discount: string; promoDiscount: string; returnedQty: string; taxRateId: string | null }
export interface PosSale {
  id: string; number: string; status: 'COMPLETED' | 'VOIDED'; shiftId: string; invoiceId: string; invoiceNumber: string; ncf: string | null; ncfType: string;
  subtotal: string; discountTotal: string; promoTotal: string; taxTotal: string; total: string; paidTotal: string; changeGiven: string; createdAt: string;
  voidReason: string | null; partner: { id: string; name: string; taxId: string | null } | null;
  lines: PosSaleLine[]; payments: { method: PayMethod; amount: string; tendered: string | null; reference: string | null }[];
  returns: { id: string; number: string; total: string; method: PayMethod; reason: string; createdAt: string }[];
  invoice: { status: string; effective: boolean; creditedTotal: string } | null;
}
export interface PosTicket {
  company: { name: string; legalName: string | null; taxId: string; address: string | null; phone: string | null };
  sale: PosSale; cashier: string | null; ncfType: string; issuedAt: string; ecf: { securityCode: string | null; status: string } | null; footer: string | null;
}
export interface Parked { id: string; label: string; payload: { lines: { productId: string; quantity: string; discount: string }[]; partnerId: string | null; ncfType: string | null }; createdAt: string }

export const METHOD_LABEL: Record<PayMethod, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' };
export const APPROVAL_LABEL: Record<string, string> = {
  DISCOUNT: 'Descuento mayor al permitido', VOID: 'Anular una venta', RETURN: 'Devolución', CASH_OUT: 'Salida de efectivo',
  DRAWER: 'Abrir la gaveta sin venta', CREDIT_SALE: 'Venta a crédito',
};
/** Códigos de anulación de la DGII (formato 608). */
export const VOID_CODES: [string, string][] = [
  ['01', 'Deterioro de factura preimpresa'], ['02', 'Errores de impresión (factura preimpresa)'], ['03', 'Impresión defectuosa'],
  ['04', 'Corrección de la información'], ['05', 'Cambio de productos'], ['06', 'Devolución de productos'], ['07', 'Omisión de productos'],
  ['08', 'Errores en secuencia de NCF'], ['09', 'Por cese de operaciones'], ['10', 'Pérdida o hurto de talonarios'],
];
/** Billetes y monedas dominicanos para el conteo del cierre. */
export const DENOMINATIONS = [2000, 1000, 500, 200, 100, 50, 25, 10, 5, 1];
