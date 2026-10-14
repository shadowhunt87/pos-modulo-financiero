/**
 * Tablas de códigos y formato de los archivos de envío de la DGII (606, 607 y 608).
 * Fuente: instructivos oficiales de llenado de los formatos 606, 607 y 608 (dgii.gov.do,
 * Biblioteca virtual > Formatos de envío de datos). Todo lo "de formato" (separador,
 * ceros a la izquierda, fechas) está aquí para poder ajustarlo en un solo lugar si la
 * herramienta de pre-validación de la DGII pide algo distinto.
 */

export const FIELD_SEPARATOR = '|';
export const LINE_BREAK = '\r\n';

/** Máximo de registros por archivo según los instructivos. */
export const MAX_ROWS = { '606': 10000, '607': 65000, '608': 4999 } as const;

// 607: el umbral de las facturas de consumo es el parámetro fiscal F607_UMBRAL_DETALLE_CONSUMO (R9)

/** 606 - Tipo de bienes y servicios comprados. */
export const EXPENSE_TYPES: Record<string, string> = {
  '01': 'Gastos de personal',
  '02': 'Gastos por trabajos, suministros y servicios',
  '03': 'Arrendamientos',
  '04': 'Gastos de activos fijos',
  '05': 'Gastos de representación',
  '06': 'Otras deducciones admitidas',
  '07': 'Gastos financieros',
  '08': 'Gastos extraordinarios',
  '09': 'Compras y gastos que formarán parte del costo de venta',
  '10': 'Adquisiciones de activos',
  '11': 'Gastos de seguros',
};

/**
 * El sistema no distingue bienes de servicios por línea. Para llenar "Monto facturado en
 * servicios" / "en bienes" se infiere del tipo de gasto: estos tipos son bienes, el resto servicios.
 */
export const GOODS_EXPENSE_TYPES = new Set(['04', '09', '10']);

/** 607 - Tipo de ingreso. */
export const INCOME_TYPES: Record<string, string> = {
  '01': 'Ingresos por operaciones (no financieros)',
  '02': 'Ingresos financieros',
  '03': 'Ingresos extraordinarios',
  '04': 'Ingresos por arrendamientos',
  '05': 'Ingresos por venta de activo depreciable',
  '06': 'Otros ingresos',
};

/** 606 - Tipo de retención en ISR. */
export const ISR_RETENTION_TYPES: Record<string, string> = {
  '01': 'Alquileres',
  '02': 'Honorarios por servicios',
  '03': 'Otras rentas',
  '04': 'Otras rentas (rentas presuntas)',
  '05': 'Intereses pagados a personas jurídicas residentes',
  '06': 'Intereses pagados a personas físicas residentes',
  '07': 'Retención por proveedores del Estado',
  '08': 'Juegos telefónicos',
  '09': 'Retenciones subsector de ganadería de carne bovina',
};

/** 606 - Forma de pago. */
export const PAYMENT_FORMS = {
  CASH: '01',
  CHECK_TRANSFER: '02',
  CARD: '03',
  CREDIT: '04',
  SWAP: '05',
  CREDIT_NOTE: '06',
  MIXED: '07',
} as const;

/** 608 - Tipo de anulación. */
export const VOID_TYPES: Record<string, string> = {
  '01': 'Deterioro de factura preimpresa',
  '02': 'Errores de impresión (factura preimpresa)',
  '03': 'Impresión defectuosa',
  '04': 'Corrección de la información',
  '05': 'Cambio de productos',
  '06': 'Devolución de productos',
  '07': 'Omisión de productos',
  '08': 'Errores en secuencia de NCF',
  '09': 'Por cese de operaciones',
  '10': 'Pérdida o hurto de talonarios',
};

/** Comprobantes emitidos por la propia empresa en una compra (proveedor informal / gastos menores). */
export const SELF_ISSUED_PURCHASE_NCF = ['B11', 'B13', 'E41', 'E43'];
/** Comprobantes de consumo. */
export const CONSUMER_NCF = ['B02', 'E32'];
/** Gastos menores: el proveedor puede ir sin identificación. */
export const MINOR_EXPENSE_NCF = ['B13', 'E43'];

/** AAAAMMDD en UTC (el sistema guarda y compara todas las fechas en UTC). */
export const ymd = (d: Date) =>
  `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, '0')}${String(d.getUTCDate()).padStart(2, '0')}`;

/** Código de dos dígitos ("2" -> "02"). */
export const code2 = (v: string | null | undefined) => (v ? v.trim().padStart(2, '0') : '');