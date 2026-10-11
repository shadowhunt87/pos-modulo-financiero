import { HttpErrorResponse } from '@angular/common/http';

const SETTING_NAMES: Record<string, string> = {
  receivableAccountId: 'Cuentas por cobrar', payableAccountId: 'Cuentas por pagar', salesIncomeAccountId: 'Ingresos por ventas',
  purchaseExpenseAccountId: 'Gastos de compras', salesDiscountAccountId: 'Descuentos en ventas', customerAdvanceAccountId: 'Anticipos de clientes',
  supplierAdvanceAccountId: 'Anticipos a proveedores', retainedEarningsAccountId: 'Utilidades retenidas',
  currentYearResultAccountId: 'Resultado del ejercicio', fxGainAccountId: 'Ganancia cambiaria', fxLossAccountId: 'Pérdida cambiaria',
  roundingAccountId: 'Redondeo', itbisPayableAccountId: 'ITBIS por pagar', itbisReceivableAccountId: 'ITBIS adelantado',
};
/** Cambia nombres técnicos de configuración (customerAdvanceAccountId) por su nombre en pantalla. */
function friendly(msg: string): string {
  return msg.replace(/\b[a-zA-Z]+AccountId\b/g, (k) => SETTING_NAMES[k] ?? k);
}

/** Convierte cualquier error en un mensaje que el usuario pueda entender y accionar. */
export function errorMessage(err: unknown): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.';
    if (err.status === 429) {
      const wait = Number(err.headers.get('Retry-After'));
      return wait > 0
        ? `Demasiados intentos. Espera ${wait >= 60 ? Math.ceil(wait / 60) + ' min' : wait + ' s'} y vuelve a intentar.`
        : 'Demasiados intentos. Espera un momento y vuelve a intentar.';
    }
    const body = err.error as { message?: string | string[] } | string | null;
    const msg = typeof body === 'string' ? body : body?.message;
    if (Array.isArray(msg)) return friendly(msg.join('. '));
    if (msg) return friendly(msg);
    if (err.status === 401) return 'Tu sesión venció. Inicia sesión de nuevo.';
    if (err.status === 403) return 'No tienes permiso para hacer esto.';
    if (err.status === 404) return 'No se encontró el registro.';
    if (err.status >= 500) return 'Error del servidor. Inténtalo de nuevo; si sigue, avisa a soporte.';
  }
  if (err instanceof Error && err.message) return err.message;
  return 'Ocurrió un error inesperado.';
}

/** Errores de validación del backend como lista (útil para mostrarlos en un aviso). */
export function errorList(err: unknown): string[] {
  if (err instanceof HttpErrorResponse) {
    const msg = (err.error as { message?: string | string[] } | null)?.message;
    if (Array.isArray(msg)) return msg;
  }
  return [errorMessage(err)];
}
