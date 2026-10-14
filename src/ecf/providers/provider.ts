/**
 * Interfaz del proveedor certificado de e-CF (PLAN-v0.3 §7.3). La firma XMLDSig, el token con la DGII, el RFCE y los
 * acuses los hace el proveedor (Guía 3.7). Nosotros armamos el documento, lo enviamos, guardamos estados y XML.
 */
export interface EcfPayload {
  Encabezado: {
    Version: string;
    IdDoc: { TipoeCF: string; eNCF: string | null; FechaVencimientoSecuencia: string | null; IndicadorMontoGravado: 0 | 1; TipoIngresos: string | null; TipoPago: 1 | 2; FechaLimitePago: string | null };
    Emisor: { RNCEmisor: string; RazonSocialEmisor: string; DireccionEmisor: string | null; FechaEmision: string };
    Comprador: { RNCComprador: string | null; RazonSocialComprador: string; IdentificadorExtranjero: string | null } | null;
    Totales: {
      MontoGravadoTotal: string; MontoGravadoI1: string; MontoGravadoI2: string; MontoGravadoI3: string; MontoExento: string;
      ITBIS1: string; ITBIS2: string; ITBIS3: string; TotalITBIS: string; TotalITBIS1: string; TotalITBIS2: string; TotalITBIS3: string;
      MontoTotal: string; TotalITBISRetenido: string; TotalISRRetencion: string;
    };
    OtraMoneda: { TipoMoneda: string; TipoCambio: string } | null;
  };
  DetallesItems: { NumeroLinea: number; IndicadorFacturacion: 1 | 2 | 3 | 4; NombreItem: string; CantidadItem: string; PrecioUnitarioItem: string; DescuentoMonto: string; MontoItem: string }[];
  InformacionReferencia: { NCFModificado: string; FechaNCFModificado: string; CodigoModificacion: string } | null;
}

export interface EcfContext {
  companyId: string; environment: 'TEST' | 'PROD'; settings: Record<string, unknown>; credentials: Record<string, string>;
}
export interface EcfRef { trackId: string | null; eNcf: string | null }

export type EcfOutcome = 'ACCEPTED' | 'ACCEPTED_CONDITIONAL' | 'REJECTED' | 'IN_PROCESS';
export interface EcfSendResult { outcome: EcfOutcome; trackId: string | null; eNcf?: string | null; securityCode?: string | null; message?: string | null; xml?: string | null }
export interface EcfStatusResult { outcome: EcfOutcome; securityCode?: string | null; message?: string | null; xml?: string | null }

/** Error de comunicación (el proveedor o la DGII no responden): el documento pasa a contingencia y se reintenta. */
export class EcfUnavailableError extends Error {}

export interface EcfProvider {
  readonly code: string;
  readonly label: string;
  send(doc: EcfPayload, ctx: EcfContext): Promise<EcfSendResult>;
  status(ref: EcfRef, ctx: EcfContext): Promise<EcfStatusResult>;
  /** ANECF: anular e-NCF no usados */
  voidUnused(r: { ecfType: string; from: string; to: string }, ctx: EcfContext): Promise<{ ok: boolean; message?: string }>;
  /** Prueba de conexión desde Configuración */
  check(ctx: EcfContext): Promise<{ ok: boolean; message: string }>;
}
