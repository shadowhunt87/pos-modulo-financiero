import { randomUUID } from 'node:crypto';
import type { EcfContext, EcfPayload, EcfProvider, EcfRef, EcfSendResult, EcfStatusResult } from './provider.js';
import { EcfUnavailableError } from './provider.js';

/**
 * Proveedor de PRUEBAS (sin red): acepta todo, salvo que el comprador se llame «RECHAZAR» (rechazo simulado) o
 * `settings.simulateDown` sea true (caída simulada → contingencia). Sirve para probar el flujo completo sin proveedor.
 * Nunca se puede activar en PROD.
 */
export class SandboxEcfProvider implements EcfProvider {
  readonly code = 'sandbox';
  readonly label = 'Pruebas (sin proveedor real)';

  async send(doc: EcfPayload, ctx: EcfContext): Promise<EcfSendResult> {
    if (ctx.settings.simulateDown) throw new EcfUnavailableError('Proveedor de pruebas fuera de servicio (simulado)');
    const reject = doc.Encabezado.Comprador?.RazonSocialComprador?.toUpperCase().includes('RECHAZAR');
    return {
      outcome: reject ? 'REJECTED' : 'ACCEPTED', trackId: `SBX-${randomUUID()}`, eNcf: doc.Encabezado.IdDoc.eNCF,
      securityCode: reject ? null : randomUUID().replace(/-/g, '').slice(0, 6).toUpperCase(),
      message: reject ? 'Rechazado por el ambiente de pruebas (comprador RECHAZAR)' : 'Aceptado (ambiente de pruebas)',
    };
  }
  async status(_ref: EcfRef): Promise<EcfStatusResult> { return { outcome: 'ACCEPTED', message: 'Aceptado (ambiente de pruebas)' }; }
  async voidUnused(): Promise<{ ok: boolean; message?: string }> { return { ok: true, message: 'Anulación simulada' }; }
  async check(ctx: EcfContext) {
    return ctx.environment === 'PROD' ? { ok: false, message: 'El proveedor de pruebas no se usa en producción' } : { ok: true, message: 'Conexión de pruebas lista' };
  }
}
