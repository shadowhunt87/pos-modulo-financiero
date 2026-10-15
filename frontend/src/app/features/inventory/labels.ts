/** Etiquetas del inventario (P2). */
export const MOVEMENT_TYPE: Record<string, string> = {
  PURCHASE: 'Compra', SALE: 'Venta', SALE_RETURN: 'Devolución de cliente', PURCHASE_RETURN: 'Devolución al proveedor',
  ADJUSTMENT_IN: 'Ajuste (entrada)', ADJUSTMENT_OUT: 'Ajuste (salida)', REVERSAL: 'Anulación',
};
export const ADJUSTMENT_STATUS: Record<string, string> = { POSTED: 'Registrado', VOIDED: 'Anulado' };

/** Cantidad con hasta 4 decimales, formato dominicano. */
export const qty = (v: string | number | null | undefined): string =>
  v === null || v === undefined || v === '' ? '' : Number(v).toLocaleString('es-DO', { maximumFractionDigits: 4 });
