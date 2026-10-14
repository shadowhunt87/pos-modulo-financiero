import type { AuditArea } from '../generated/prisma/enums.js';

/**
 * Plantilla de áreas y procedimientos (PLAN-v0.2 §5.2). Al crear un encargo se eligen las áreas y se precargan;
 * todo es editable. Los textos los validan las contadoras antes de usarse con clientes reales.
 */
export const AUDIT_TEMPLATES: Record<AuditArea, { reference: string; title: string; objective: string; procedures: string[] }> = {
  CASH_AND_BANKS: {
    reference: 'A', title: 'Caja y bancos', objective: 'Comprobar que el efectivo existe, está completo y bien presentado al cierre.',
    procedures: [
      'Comparar el saldo de cada banco en libros con la conciliación al cierre.',
      'Revisar partidas en tránsito de más de 30 días y su liquidación posterior.',
      'Confirmar saldos con los bancos (carta de confirmación).',
      'Hacer un arqueo de caja chica y comparar con libros.',
      'Revisar transferencias entre cuentas cerca del cierre (corte).',
    ],
  },
  RECEIVABLES: {
    reference: 'B', title: 'Cuentas por cobrar', objective: 'Comprobar que lo que se cobra existe, se puede cobrar y está bien valuado.',
    procedures: [
      'Cuadrar el auxiliar de clientes con la cuenta de control del mayor.',
      'Revisar la antigüedad de saldos y la provisión para incobrables.',
      'Confirmar saldos con una muestra de clientes.',
      'Revisar cobros posteriores al cierre de los saldos más grandes.',
    ],
  },
  PAYABLES: {
    reference: 'C', title: 'Cuentas por pagar', objective: 'Comprobar que todas las deudas con proveedores están registradas (integridad).',
    procedures: [
      'Cuadrar el auxiliar de proveedores con la cuenta de control del mayor.',
      'Buscar pasivos no registrados en pagos posteriores al cierre.',
      'Confirmar saldos con una muestra de proveedores.',
      'Revisar retenciones de ITBIS e ISR aplicadas y su pago a la DGII.',
    ],
  },
  REVENUE: {
    reference: 'D', title: 'Ingresos', objective: 'Comprobar que las ventas ocurrieron, están completas y en el período correcto.',
    procedures: [
      'Comparar el 607 con las ventas registradas en el mayor.',
      'Revisar el corte de ventas: facturas de los últimos y primeros días.',
      'Verificar una muestra de facturas contra su soporte (pedido, entrega, cobro).',
      'Revisar notas de crédito emitidas después del cierre.',
      'Analizar la variación de ingresos contra el período anterior.',
    ],
  },
  EXPENSES: {
    reference: 'E', title: 'Costos y gastos', objective: 'Comprobar que los gastos son reales, del negocio y con comprobante válido.',
    procedures: [
      'Comparar el 606 con las compras y gastos del mayor.',
      'Verificar una muestra de gastos contra su NCF válido para crédito fiscal.',
      'Revisar gastos no deducibles para el IR-2.',
      'Analizar las variaciones significativas contra el período anterior.',
    ],
  },
  TAXES: {
    reference: 'F', title: 'Impuestos', objective: 'Comprobar que los impuestos se calcularon, declararon y pagaron a tiempo.',
    procedures: [
      'Cuadrar el IT-1 de cada mes con el ITBIS del mayor.',
      'Verificar la presentación a tiempo del 606, 607, 608 e IR-17.',
      'Revisar el cálculo de los anticipos de ISR.',
      'Revisar la proporcionalidad del ITBIS si hay ventas exentas.',
    ],
  },
  EQUITY: {
    reference: 'G', title: 'Patrimonio', objective: 'Comprobar los movimientos de capital, reservas y utilidades.',
    procedures: [
      'Comparar el capital con el registro mercantil y las actas.',
      'Verificar la reserva legal (5 % anual hasta el 10 % del capital).',
      'Revisar dividendos declarados y su retención del 10 %.',
    ],
  },
  FIXED_ASSETS: {
    reference: 'H', title: 'Activos fijos', objective: 'Comprobar que los activos existen y la depreciación es correcta.',
    procedures: [
      'Cuadrar el detalle de activos con el mayor.',
      'Verificar adiciones y retiros del período contra su soporte.',
      'Recalcular la depreciación por categoría (art. 287).',
      'Inspeccionar físicamente una muestra de activos.',
    ],
  },
  INVENTORY: {
    reference: 'I', title: 'Inventarios', objective: 'Comprobar que el inventario existe y está bien valuado.',
    procedures: [
      'Observar el conteo físico al cierre.',
      'Comparar el conteo con los registros y explicar diferencias.',
      'Revisar la valuación y el deterioro por obsolescencia.',
    ],
  },
  OTHER: {
    reference: 'Z', title: 'Otras áreas', objective: 'Procedimientos adicionales según el riesgo del cliente.',
    procedures: ['Describir el procedimiento y el resultado obtenido.'],
  },
};
