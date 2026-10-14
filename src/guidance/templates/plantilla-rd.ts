import type { TaxApplies, TaxType } from '../../generated/prisma/enums.js';

/**
 * Plantilla de arranque RD (E1b, PLAN-v0.2 §15): cuentas automáticas y impuestos base sobre el catálogo estándar RD.
 * Los códigos son los de `chart-of-accounts/templates/catalogo-estandar-rd.json`; la validan las contadoras (D14).
 * Ningún valor fiscal vive aquí: cada impuesto se ENLAZA a su parámetro (la tasa sale de valueAt, R9).
 */
export const SETTINGS_TEMPLATE: Record<string, string> = {
  receivableAccountId: '1102-01', // Cuentas por Cobrar Clientes Locales
  payableAccountId: '2101-01', // Proveedores Locales (Con NCF)
  salesIncomeAccountId: '4101-01', // Ventas Locales Gravadas con ITBIS
  purchaseExpenseAccountId: '5101-03', // Compras de Mercancías Locales
  salesDiscountAccountId: '4103-02', // Descuentos y Rebajas Concedidas en Ventas
  customerAdvanceAccountId: '2105-03', // Anticipos Recibidos de Clientes
  supplierAdvanceAccountId: '1104-03', // Anticipos a Proveedores
  retainedEarningsAccountId: '3301-01', // Utilidades Retenidas / Acumuladas
  currentYearResultAccountId: '3302-01', // Utilidad o Pérdida del Ejercicio en Curso
  fxGainAccountId: '4201-02', // Ganancia en Diferencia de Cambio
  fxLossAccountId: '6301-04', // Pérdida en Diferencia de Cambio
  roundingAccountId: '6301-02', // Comisiones Bancarias y Cargos por Servicios (redondeos menores)
};

export interface TaxTemplate {
  name: string; type: TaxType; appliesTo: TaxApplies; parameterKey: string;
  /** Cuenta para ventas y para compras (código del catálogo) */
  sales: string | null; purchases: string | null; dgiiCode?: string;
}

export const TAX_TEMPLATE: TaxTemplate[] = [
  { name: 'ITBIS tasa general', type: 'ITBIS', appliesTo: 'BOTH', parameterKey: 'ITBIS_TASA_GENERAL', sales: '2102-01', purchases: '1104-05' },
  { name: 'ITBIS tasa reducida', type: 'ITBIS', appliesTo: 'BOTH', parameterKey: 'ITBIS_TASA_REDUCIDA', sales: '2102-01', purchases: '1104-05' },
  { name: 'ITBIS exportación (0 %)', type: 'ITBIS', appliesTo: 'SALES', parameterKey: 'ITBIS_TASA_EXPORTACION', sales: '2102-01', purchases: null },
  // Retenciones: en ventas, lo que el cliente nos retiene (activo); en compras, lo que retenemos y debemos pagar a la DGII
  { name: 'Retención ITBIS servicios (30 %)', type: 'ITBIS_WITHHOLDING', appliesTo: 'BOTH', parameterKey: 'RET_ITBIS_SERVICIOS_PJ', sales: '1104-06', purchases: '2102-02' },
  { name: 'Retención ITBIS persona física (100 %)', type: 'ITBIS_WITHHOLDING', appliesTo: 'PURCHASES', parameterKey: 'RET_ITBIS_PERSONA_FISICA', sales: null, purchases: '2102-02' },
  { name: 'Retención ITBIS cobros con tarjeta', type: 'ITBIS_WITHHOLDING', appliesTo: 'SALES', parameterKey: 'RET_ITBIS_TARJETA', sales: '1104-06', purchases: null },
  { name: 'Retención ISR honorarios persona física', type: 'ISR_WITHHOLDING', appliesTo: 'BOTH', parameterKey: 'RET_ISR_HONORARIOS_PF', sales: '1104-06', purchases: '2102-04', dgiiCode: '02' },
  { name: 'Retención ISR alquileres persona física', type: 'ISR_WITHHOLDING', appliesTo: 'PURCHASES', parameterKey: 'RET_ISR_ALQUILER_PF', sales: null, purchases: '2102-05', dgiiCode: '01' },
];
