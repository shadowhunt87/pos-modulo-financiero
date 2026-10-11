/** Etiquetas en español de los enums del backend y el color de su etiqueta de estado. */
export type Tone = 'pos' | 'neg' | 'warn' | 'info' | '';
export interface Option { value: string; label: string }

const mk = (m: Record<string, string>): Option[] => Object.entries(m).map(([value, label]) => ({ value, label }));

export const ROLE = { ADMIN: 'Administrador', ACCOUNTANT: 'Contador', APPROVER: 'Aprobador', VIEWER: 'Solo lectura' } as const;
export const ACCOUNT_TYPE = { ASSET: 'Activo', LIABILITY: 'Pasivo', EQUITY: 'Patrimonio', INCOME: 'Ingreso', EXPENSE: 'Gasto' } as const;
export const ACCOUNT_CATEGORY: Record<string, string> = {
  CASH_AND_EQUIVALENTS: 'Efectivo y equivalentes', ACCOUNTS_RECEIVABLE: 'Cuentas por cobrar', INVENTORY: 'Inventarios',
  PREPAID_AND_OTHER_CURRENT_ASSETS: 'Pagos anticipados y otros activos corrientes', PROPERTY_PLANT_EQUIPMENT: 'Propiedad, planta y equipo',
  INTANGIBLE_ASSETS: 'Activos intangibles', OTHER_NON_CURRENT_ASSETS: 'Otros activos no corrientes', ACCOUNTS_PAYABLE: 'Cuentas por pagar',
  SHORT_TERM_DEBT: 'Deuda a corto plazo', TAXES_PAYABLE: 'Impuestos por pagar', OTHER_CURRENT_LIABILITIES: 'Otros pasivos corrientes',
  LONG_TERM_DEBT: 'Deuda a largo plazo', OTHER_NON_CURRENT_LIABILITIES: 'Otros pasivos no corrientes', SHARE_CAPITAL: 'Capital social',
  RETAINED_EARNINGS: 'Utilidades retenidas', CURRENT_YEAR_RESULT: 'Resultado del ejercicio', OTHER_EQUITY: 'Otro patrimonio',
  OPERATING_REVENUE: 'Ingresos operativos', OTHER_REVENUE: 'Otros ingresos', COST_OF_SALES: 'Costo de ventas', OPERATING_EXPENSE: 'Gastos operativos',
  DEPRECIATION_AMORTIZATION: 'Depreciación y amortización', FINANCE_COST: 'Costos financieros', OTHER_EXPENSE: 'Otros gastos', INCOME_TAX: 'Impuesto sobre la renta',
};
export const CASH_FLOW_CATEGORY: Record<string, string> = { OPERATING: 'Operación', INVESTING: 'Inversión', FINANCING: 'Financiamiento', CASH_EQUIVALENT: 'Efectivo y equivalentes' };
export const JOURNAL_TYPE: Record<string, string> = { GENERAL: 'General', SALES: 'Ventas', PURCHASES: 'Compras', BANK: 'Banco', CASH: 'Caja', ADJUSTMENT: 'Ajustes', OPENING: 'Apertura', CLOSING: 'Cierre' };
export const ENTRY_STATUS: Record<string, string> = { DRAFT: 'Pendiente de aprobar', POSTED: 'Contabilizado', VOIDED: 'Anulado', REJECTED: 'Rechazado' };
export const ENTRY_TYPE: Record<string, string> = { STANDARD: 'Estándar', OPENING: 'Apertura', CLOSING: 'Cierre', ADJUSTMENT: 'Ajuste', REVERSAL: 'Reverso', FX_REVALUATION: 'Revaluación cambiaria' };
export const SOURCE_DOC: Record<string, string> = { MANUAL: 'Manual', INVOICE: 'Factura', PAYMENT: 'Pago', BANK_TRANSACTION: 'Movimiento bancario', CASH_EXPENSE: 'Gasto de caja', YEAR_END_CLOSING: 'Cierre de año', OTHER: 'Otro' };
export const PARTNER_TYPE: Record<string, string> = { CUSTOMER: 'Cliente', SUPPLIER: 'Proveedor', BOTH: 'Cliente y proveedor' };
export const TAX_ID_TYPE: Record<string, string> = { RNC: 'RNC', CEDULA: 'Cédula', PASSPORT: 'Pasaporte', FOREIGN_ID: 'ID extranjero' };
export const TAX_TYPE: Record<string, string> = { ITBIS: 'ITBIS', ISC: 'ISC', PROPINA_LEGAL: 'Propina legal', ISR_WITHHOLDING: 'Retención ISR', ITBIS_WITHHOLDING: 'Retención ITBIS', OTHER: 'Otro' };
export const TAX_APPLIES: Record<string, string> = { SALES: 'Ventas', PURCHASES: 'Compras', BOTH: 'Ventas y compras' };
export const INVOICE_TYPE: Record<string, string> = { SALE: 'Venta', PURCHASE: 'Compra', CREDIT_NOTE: 'Nota de crédito', DEBIT_NOTE: 'Nota de débito' };
export const INVOICE_STATUS: Record<string, string> = { DRAFT: 'Borrador', ISSUED: 'Emitida', PARTIALLY_PAID: 'Pago parcial', PAID: 'Pagada', VOIDED: 'Anulada', OVERDUE: 'Vencida' };
export const PAYMENT_DIRECTION: Record<string, string> = { RECEIVED: 'Cobro', MADE: 'Pago' };
export const PAYMENT_STATUS: Record<string, string> = { DRAFT: 'Borrador', POSTED: 'Registrado', VOIDED: 'Anulado' };
export const PAYMENT_METHOD: Record<string, string> = { CASH: 'Efectivo', BANK_TRANSFER: 'Transferencia', CHECK: 'Cheque', CARD: 'Tarjeta' };
export const BANK_ACCOUNT_TYPE: Record<string, string> = { CHECKING: 'Corriente', SAVINGS: 'Ahorros', CREDIT_CARD: 'Tarjeta de crédito', LOAN: 'Préstamo' };
export const BANK_TX_STATUS: Record<string, string> = { PENDING: 'Pendiente', MATCHED: 'Enlazado', RECONCILED: 'Conciliado', IGNORED: 'Ignorado' };
export const RECON_STATUS: Record<string, string> = { DRAFT: 'En proceso', COMPLETED: 'Completada' };
export const BUDGET_STATUS: Record<string, string> = { DRAFT: 'Borrador', APPROVED: 'Aprobado', ARCHIVED: 'Archivado' };
export const PERIOD_STATUS: Record<string, string> = { OPEN: 'Abierto', CLOSED: 'Cerrado' };

export const opts = {
  role: mk(ROLE), accountType: mk(ACCOUNT_TYPE), accountCategory: mk(ACCOUNT_CATEGORY), cashFlow: mk(CASH_FLOW_CATEGORY),
  journalType: mk(JOURNAL_TYPE), partnerType: mk(PARTNER_TYPE), taxIdType: mk(TAX_ID_TYPE), taxType: mk(TAX_TYPE), taxApplies: mk(TAX_APPLIES),
  invoiceType: mk(INVOICE_TYPE), invoiceStatus: mk(INVOICE_STATUS), paymentMethod: mk(PAYMENT_METHOD), paymentDirection: mk(PAYMENT_DIRECTION),
  paymentStatus: mk(PAYMENT_STATUS), bankAccountType: mk(BANK_ACCOUNT_TYPE), bankTxStatus: mk(BANK_TX_STATUS), budgetStatus: mk(BUDGET_STATUS),
  entryStatus: mk(ENTRY_STATUS),
};

/** Color de la etiqueta según el estado. */
export function tone(status: string | null | undefined): Tone {
  switch (status) {
    case 'POSTED': case 'PAID': case 'COMPLETED': case 'APPROVED': case 'RECONCILED': case 'MATCHED': case 'ACTIVE': case 'CLOSED_OK': return 'pos';
    case 'VOIDED': case 'REJECTED': case 'OVERDUE': return 'neg';
    case 'DRAFT': case 'PENDING': case 'PARTIALLY_PAID': return 'warn';
    case 'ISSUED': case 'OPEN': return 'info';
    default: return '';
  }
}

export function label(map: Record<string, string>, key: string | null | undefined): string {
  return key ? (map[key] ?? key) : '';
}

export const SUBLEDGER_TYPE: Record<string, string> = { RECEIVABLE: 'Clientes (por cobrar)', PAYABLE: 'Proveedores (por pagar)', BANK: 'Banco', CASH: 'Caja' };
export const DOC_TYPE: Record<string, string> = {
  INVOICE_SALE: 'Factura de venta', INVOICE_PURCHASE: 'Factura de compra', CREDIT_NOTE: 'Nota de crédito', DEBIT_NOTE: 'Nota de débito',
  PAYMENT_RECEIVED: 'Cobro recibido', PAYMENT_MADE: 'Pago realizado',
};
export const NCF_TYPE: Record<string, string> = {
  B01: 'Crédito fiscal', B02: 'Consumo', B03: 'Nota de débito', B04: 'Nota de crédito', B11: 'Proveedores informales', B12: 'Registro único de ingresos',
  B13: 'Gastos menores', B14: 'Regímenes especiales', B15: 'Gubernamental', B16: 'Exportaciones', B17: 'Pagos al exterior',
  E31: 'e-CF Crédito fiscal', E32: 'e-CF Consumo', E33: 'e-CF Nota de débito', E34: 'e-CF Nota de crédito', E41: 'e-CF Compras',
  E43: 'e-CF Gastos menores', E44: 'e-CF Regímenes especiales', E45: 'e-CF Gubernamental', E46: 'e-CF Exportaciones', E47: 'e-CF Pagos al exterior',
};
export const optsExtra = { subledger: mk(SUBLEDGER_TYPE), ncfType: mk(NCF_TYPE) };

export const BANK_TX_SOURCE: Record<string, string> = { MANUAL: 'Manual', FILE_IMPORT: 'Archivo importado', API_SYNC: 'Sincronización' };

// ---- Comentarios (Enviar comentario, Mis comentarios, Comentarios recibidos) ----
export const FEEDBACK_KIND: Record<string, string> = { BROKEN: 'Algo no funciona', CONFUSING: 'No entiendo cómo hacer algo', IDEA: 'Sugerencia' };
export const FEEDBACK_KIND_HINT: Record<string, string> = {
  BROKEN: 'Un botón no responde, sale un error o un número no cuadra.',
  CONFUSING: 'No encuentras dónde hacer algo o no se entiende una pantalla.',
  IDEA: 'Algo que te haría el trabajo más fácil.',
};
export const FEEDBACK_STATUS: Record<string, string> = {
  NEW: 'Recibido', PLANNED: 'Lo vamos a hacer', DONE: 'Resuelto', WONT_DO: 'No se hará', DUPLICATE: 'Ya lo teníamos',
};
/** Icono (además del color y del texto, para que el estado no dependa solo del color), y color de cada estado de un comentario. */
export const FEEDBACK_STATUS_LOOK: Record<string, { icon: string; tone: Tone }> = {
  NEW: { icon: '●', tone: 'info' }, PLANNED: { icon: '◔', tone: 'warn' }, DONE: { icon: '✓', tone: 'pos' },
  WONT_DO: { icon: '⊘', tone: '' }, DUPLICATE: { icon: '≡', tone: '' },
};
export const optsFeedback = { kind: mk(FEEDBACK_KIND), status: mk(FEEDBACK_STATUS) };

/** Importación del plan de cuentas: cada acción con icono, color y texto (el estado no depende solo del color). */
export const IMPORT_ACTION_LOOK: Record<string, { icon: string; tone: Tone; text: string; plural: string }> = {
  error: { icon: '!', tone: 'neg', text: 'Error', plural: 'Errores' },
  create: { icon: '+', tone: 'pos', text: 'Se creará', plural: 'Se crearán' },
  update: { icon: '↻', tone: 'info', text: 'Se actualizará', plural: 'Se actualizarán' },
  unchanged: { icon: '=', tone: '', text: 'Sin cambios', plural: 'Sin cambios' },
  skip: { icon: '⊘', tone: 'warn', text: 'Omitida', plural: 'Omitidas' },
};
