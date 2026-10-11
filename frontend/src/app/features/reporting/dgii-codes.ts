/** Tablas de códigos de los formatos 606, 607 y 608 de la DGII (etiquetas para mostrar). */
export const EXPENSE_TYPE: Record<string, string> = {
  '01': 'Gastos de personal', '02': 'Trabajos, suministros y servicios', '03': 'Arrendamientos', '04': 'Activos fijos',
  '05': 'Representación', '06': 'Otras deducciones admitidas', '07': 'Gastos financieros', '08': 'Gastos extraordinarios',
  '09': 'Costo de venta', '10': 'Adquisición de activos', '11': 'Seguros',
};
export const INCOME_TYPE: Record<string, string> = {
  '01': 'Ingresos por operaciones', '02': 'Ingresos financieros', '03': 'Ingresos extraordinarios', '04': 'Arrendamientos',
  '05': 'Venta de activo depreciable', '06': 'Otros ingresos',
};
export const ISR_TYPE: Record<string, string> = {
  '01': 'Alquileres', '02': 'Honorarios', '03': 'Otras rentas', '04': 'Rentas presuntas', '05': 'Intereses a personas jurídicas',
  '06': 'Intereses a personas físicas', '07': 'Proveedores del Estado', '08': 'Juegos telefónicos', '09': 'Ganadería bovina',
};
export const VOID_TYPE: Record<string, string> = {
  '01': 'Deterioro de factura preimpresa', '02': 'Errores de impresión (preimpresa)', '03': 'Impresión defectuosa',
  '04': 'Corrección de la información', '05': 'Cambio de productos', '06': 'Devolución de productos', '07': 'Omisión de productos',
  '08': 'Errores en secuencia de NCF', '09': 'Cese de operaciones', '10': 'Pérdida o hurto de talonarios',
};
export const PAYMENT_FORM: Record<string, string> = {
  '01': 'Efectivo', '02': 'Cheque o transferencia', '03': 'Tarjeta', '04': 'Crédito', '05': 'Permuta', '06': 'Nota de crédito', '07': 'Mixto',
};
export const ID_TYPE: Record<string, string> = { '1': 'RNC', '2': 'Cédula', '3': 'Otro' };

export interface DgiiCol {
  key: string;
  label: string;
  type?: 'money' | 'date' | 'invoice' | 'map' | 'text';
  map?: Record<string, string>;
  mono?: boolean;
}

export const COLS_606: DgiiCol[] = [
  { key: 'invoiceNumber', label: 'Factura', type: 'invoice' },
  { key: 'rnc', label: 'RNC o cédula', mono: true },
  { key: 'idType', label: 'Tipo ID', type: 'map', map: ID_TYPE },
  { key: 'expenseType', label: 'Tipo de gasto', type: 'map', map: EXPENSE_TYPE },
  { key: 'ncf', label: 'NCF', mono: true },
  { key: 'ncfModified', label: 'NCF modificado', mono: true },
  { key: 'voucherDate', label: 'Fecha comprobante', type: 'date' },
  { key: 'paymentDate', label: 'Fecha de pago', type: 'date' },
  { key: 'services', label: 'Servicios', type: 'money' },
  { key: 'goods', label: 'Bienes', type: 'money' },
  { key: 'total', label: 'Monto facturado', type: 'money' },
  { key: 'itbis', label: 'ITBIS', type: 'money' },
  { key: 'itbisWithheld', label: 'ITBIS retenido', type: 'money' },
  { key: 'itbisAdvance', label: 'ITBIS por adelantar', type: 'money' },
  { key: 'isrType', label: 'Tipo retención ISR', type: 'map', map: ISR_TYPE },
  { key: 'isrWithheld', label: 'ISR retenido', type: 'money' },
  { key: 'isc', label: 'ISC', type: 'money' },
  { key: 'otherTaxes', label: 'Otros impuestos', type: 'money' },
  { key: 'tip', label: 'Propina legal', type: 'money' },
  { key: 'paymentForm', label: 'Forma de pago', type: 'map', map: PAYMENT_FORM },
];
export const COLS_607: DgiiCol[] = [
  { key: 'invoiceNumber', label: 'Factura', type: 'invoice' },
  { key: 'rnc', label: 'RNC o cédula', mono: true },
  { key: 'idType', label: 'Tipo ID', type: 'map', map: ID_TYPE },
  { key: 'ncf', label: 'NCF', mono: true },
  { key: 'ncfModified', label: 'NCF modificado', mono: true },
  { key: 'incomeType', label: 'Tipo de ingreso', type: 'map', map: INCOME_TYPE },
  { key: 'voucherDate', label: 'Fecha comprobante', type: 'date' },
  { key: 'retentionDate', label: 'Fecha de retención', type: 'date' },
  { key: 'amount', label: 'Monto facturado', type: 'money' },
  { key: 'itbis', label: 'ITBIS', type: 'money' },
  { key: 'itbisWithheld', label: 'ITBIS retenido', type: 'money' },
  { key: 'isrWithheld', label: 'ISR retenido', type: 'money' },
  { key: 'isc', label: 'ISC', type: 'money' },
  { key: 'otherTaxes', label: 'Otros impuestos', type: 'money' },
  { key: 'tip', label: 'Propina legal', type: 'money' },
  { key: 'cash', label: 'Efectivo', type: 'money' },
  { key: 'checkTransfer', label: 'Cheque o transferencia', type: 'money' },
  { key: 'card', label: 'Tarjeta', type: 'money' },
  { key: 'credit', label: 'Crédito', type: 'money' },
  { key: 'otherForms', label: 'Otras formas', type: 'money' },
];
export const COLS_608: DgiiCol[] = [
  { key: 'invoiceNumber', label: 'Factura', type: 'invoice' },
  { key: 'ncf', label: 'NCF', mono: true },
  { key: 'voucherDate', label: 'Fecha comprobante', type: 'date' },
  { key: 'voidType', label: 'Tipo de anulación', type: 'map', map: VOID_TYPE },
];
