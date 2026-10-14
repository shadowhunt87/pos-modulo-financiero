import type { EcfContext, EcfOutcome, EcfPayload, EcfProvider, EcfRef, EcfSendResult, EcfStatusResult } from './provider.js';
import { EcfUnavailableError } from './provider.js';
import { payloadToXml } from './payload.js';

/**
 * Adaptador HTTP CONFIGURABLE para el proveedor certificado (lo que falte del proveedor es configuración, no código):
 *   settings = { baseUrl, sendPath, statusPath, voidPath, checkPath, format: 'json' | 'xml', authHeader?, timeoutMs?,
 *                fields?: { trackId, status, eNcf, securityCode, message, xml }, statusMap?: { "<valor del proveedor>": "ACCEPTED" | ... } }
 *   credentials = { token } (Bearer) o { user, password } (Basic) o { apiKey } (cabecera authHeader)
 * Las rutas aceptan {trackId} y {eNcf}. Un error de red o 5xx = proveedor caído → contingencia y reintento.
 */
const DEFAULT_MAP: Record<string, EcfOutcome> = {
  aceptado: 'ACCEPTED', accepted: 'ACCEPTED', 'aceptado condicional': 'ACCEPTED_CONDITIONAL', accepted_conditional: 'ACCEPTED_CONDITIONAL',
  rechazado: 'REJECTED', rejected: 'REJECTED', 'en proceso': 'IN_PROCESS', processing: 'IN_PROCESS', pending: 'IN_PROCESS',
};

export class HttpEcfProvider implements EcfProvider {
  readonly code = 'http';
  readonly label = 'Proveedor certificado (HTTP configurable)';

  private s(ctx: EcfContext) {
    const s = ctx.settings as Record<string, unknown>;
    if (typeof s.baseUrl !== 'string' || !/^https:\/\//.test(s.baseUrl)) throw new Error('Falta la URL https del proveedor (settings.baseUrl)');
    return s as { baseUrl: string; sendPath?: string; statusPath?: string; voidPath?: string; checkPath?: string; format?: 'json' | 'xml'; authHeader?: string; timeoutMs?: number; fields?: Record<string, string>; statusMap?: Record<string, EcfOutcome> };
  }

  private headers(ctx: EcfContext, contentType: string): Record<string, string> {
    const s = this.s(ctx), c = ctx.credentials;
    const h: Record<string, string> = { 'Content-Type': contentType, Accept: 'application/json' };
    if (c.token) h.Authorization = `Bearer ${c.token}`;
    else if (c.user && c.password) h.Authorization = `Basic ${Buffer.from(`${c.user}:${c.password}`).toString('base64')}`;
    if (c.apiKey) h[s.authHeader ?? 'X-Api-Key'] = c.apiKey;
    return h;
  }

  private async call(ctx: EcfContext, method: string, path: string, body?: string, contentType = 'application/json'): Promise<Record<string, unknown>> {
    const s = this.s(ctx);
    let res: Response;
    try {
      res = await fetch(new URL(path, s.baseUrl), { method, headers: this.headers(ctx, contentType), body, signal: AbortSignal.timeout(s.timeoutMs ?? 30_000) });
    } catch (e) { throw new EcfUnavailableError(`No se pudo conectar con el proveedor: ${(e as Error).message}`); }
    if (res.status >= 500 || res.status === 429) throw new EcfUnavailableError(`El proveedor respondió ${res.status}`);
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = text ? (JSON.parse(text) as Record<string, unknown>) : {}; } catch { json = { message: text.slice(0, 500) }; }
    if (res.status >= 400) return { __error: true, ...json, __status: res.status };
    return json;
  }

  private read(ctx: EcfContext, r: Record<string, unknown>) {
    const s = this.s(ctx), f = s.fields ?? {};
    const get = (k: string, d: string) => r[f[k] ?? d];
    const raw = String(get('status', 'status') ?? (r.__error ? 'rejected' : '')).toLowerCase();
    const map = { ...DEFAULT_MAP, ...Object.fromEntries(Object.entries(s.statusMap ?? {}).map(([k, v]) => [k.toLowerCase(), v])) };
    const outcome: EcfOutcome = map[raw] ?? (r.__error ? 'REJECTED' : 'IN_PROCESS');
    const str = (v: unknown) => (v === undefined || v === null ? null : String(v));
    return {
      outcome, trackId: str(get('trackId', 'trackId')), eNcf: str(get('eNcf', 'eNCF')), securityCode: str(get('securityCode', 'codigoSeguridad')),
      message: str(get('message', 'mensaje')) ?? (r.__error ? `Error ${String(r.__status)}` : null), xml: str(get('xml', 'xml')),
    };
  }

  async send(doc: EcfPayload, ctx: EcfContext): Promise<EcfSendResult> {
    const s = this.s(ctx);
    const xml = s.format === 'xml';
    const r = await this.call(ctx, 'POST', s.sendPath ?? '/ecf', xml ? payloadToXml(doc) : JSON.stringify(doc), xml ? 'application/xml' : 'application/json');
    return this.read(ctx, r);
  }

  async status(ref: EcfRef, ctx: EcfContext): Promise<EcfStatusResult> {
    const s = this.s(ctx);
    const path = (s.statusPath ?? '/ecf/{trackId}').replace('{trackId}', encodeURIComponent(ref.trackId ?? '')).replace('{eNcf}', encodeURIComponent(ref.eNcf ?? ''));
    return this.read(ctx, await this.call(ctx, 'GET', path));
  }

  async voidUnused(r: { ecfType: string; from: string; to: string }, ctx: EcfContext) {
    const res = await this.call(ctx, 'POST', this.s(ctx).voidPath ?? '/anecf', JSON.stringify(r));
    return { ok: !res.__error, message: res.__error ? String(res.message ?? 'Error') : undefined };
  }

  async check(ctx: EcfContext) {
    try {
      const r = await this.call(ctx, 'GET', this.s(ctx).checkPath ?? '/health');
      return r.__error ? { ok: false, message: `El proveedor respondió con error ${String(r.__status)}: revisa las credenciales` } : { ok: true, message: 'Conexión con el proveedor correcta' };
    } catch (e) { return { ok: false, message: (e as Error).message }; }
  }
}
