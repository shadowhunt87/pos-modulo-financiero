import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import type { Response } from 'express';

export interface AttemptRule {
  key: string;
  /** intentos FALLIDOS permitidos dentro de la ventana */
  limit: number;
  windowMs?: number;
}

const DEFAULT_WINDOW_MS = 15 * 60_000;
const MAX_ENTRIES = 50_000;

/**
 * Límite de intentos fallidos en memoria (ventana fija desde el primer fallo).
 * Cuenta SOLO los fallos: un usuario que entra bien no se bloquea a sí mismo.
 * Es por instancia: con varias réplicas del backend, cada una lleva su propia cuenta (el límite
 * efectivo es N veces mayor); para un límite global haría falta Redis.
 */
@Injectable()
export class AttemptLimiter {
  private readonly hits = new Map<string, { count: number; resetAt: number }>();

  /** Separado para poder simular el paso del tiempo en los tests. */
  protected now() {
    return Date.now();
  }

  /** Segundos que faltan para poder reintentar; 0 si no está bloqueado. */
  check(rules: AttemptRule[]): number {
    const now = this.now();
    let wait = 0;
    for (const r of rules) {
      const h = this.hits.get(r.key);
      if (!h) continue;
      if (h.resetAt <= now) {
        this.hits.delete(r.key);
        continue;
      }
      if (h.count >= r.limit) wait = Math.max(wait, Math.ceil((h.resetAt - now) / 1000));
    }
    return wait;
  }

  recordFailure(rules: AttemptRule[]) {
    const now = this.now();
    for (const r of rules) {
      const h = this.hits.get(r.key);
      if (!h || h.resetAt <= now) this.hits.set(r.key, { count: 1, resetAt: now + (r.windowMs ?? DEFAULT_WINDOW_MS) });
      else h.count++;
    }
    if (this.hits.size > MAX_ENTRIES) this.evict(now);
  }

  /**
   * Reserva un intento ANTES de verificar (ANEXO-S0 §3.11, G1): síncrono, así dos peticiones simultáneas no se saltan el
   * límite. Si alguna regla está en su límite devuelve los segundos de espera SIN sumar; si no, suma 1 a todas y devuelve 0.
   */
  consume(rules: AttemptRule[]): number {
    const wait = this.check(rules);
    if (wait > 0) return wait;
    this.recordFailure(rules);
    return 0;
  }

  /** Devuelve una reserva (acierto, o no se llegó a probar nada). */
  refund(keys: string[]) {
    const now = this.now();
    for (const k of keys) {
      const h = this.hits.get(k);
      if (!h || h.resetAt <= now) continue;
      if (h.count <= 1) this.hits.delete(k); else h.count--;
    }
  }

  clear(keys: string[]) {
    for (const k of keys) this.hits.delete(k);
  }

  /** Evita crecimiento sin límite si alguien inunda con correos distintos. */
  private evict(now: number) {
    for (const [k, h] of this.hits) if (h.resetAt <= now) this.hits.delete(k);
    for (const k of this.hits.keys()) {
      if (this.hits.size <= MAX_ENTRIES * 0.9) break;
      this.hits.delete(k); // Map conserva orden de inserción: sale primero lo más viejo
    }
  }
}

/** Reglas del login: por IP, por cuenta y por el par cuenta+IP. */
export function loginRules(email: string, ip: string): AttemptRule[] {
  const e = email.trim().toLowerCase();
  return [
    { key: `login:pair:${e}|${ip}`, limit: 5 },
    { key: `login:acct:${e}`, limit: 20 },
    { key: `login:ip:${ip}`, limit: 40 },
  ];
}

export const loginPairKey = (email: string, ip: string) => `login:pair:${email.trim().toLowerCase()}|${ip}`;

/** IP para las reglas: una IPv6 se agrupa por su /64 (un atacante tiene millones de direcciones en su red). */
export function ipKey(ip: string): string {
  const v = ip.replace(/^::ffff:/i, '');
  if (!v.includes(':')) return v;
  const [head, tail = ''] = v.split('::');
  const h = head ? head.split(':') : [];
  const t = tail ? tail.split(':') : [];
  const full = v.includes('::') ? [...h, ...Array(8 - h.length - t.length).fill('0'), ...t] : h;
  return `${full.slice(0, 4).map((x) => (x || '0').toLowerCase().replace(/^0+(?=.)/, '')).join(':')}::/64`;
}

/** Regla por IP de la verificación en dos pasos: 40 en 15 min. */
export const twoFactorIpRule = (ip: string): AttemptRule => ({ key: `2fa:ip:${ipKey(ip)}`, limit: 40 });

/** Reglas para verificar la clave actual al cambiarla (por usuario). */
export const passwordRules = (userId: string): AttemptRule[] => [{ key: `pw:user:${userId}`, limit: 5 }];

export class TooManyAttemptsException extends HttpException {
  constructor(readonly retryAfterSeconds: number) {
    const mins = Math.max(1, Math.ceil(retryAfterSeconds / 60));
    super(
      { statusCode: 429, error: 'Too Many Requests', message: `Demasiados intentos fallidos. Intenta de nuevo en ${mins} minuto(s).` },
      HttpStatus.TOO_MANY_REQUESTS,
    );
  }
}

/** Agrega la cabecera Retry-After (HttpException por sí sola no puede). */
@Catch(TooManyAttemptsException)
export class TooManyAttemptsFilter implements ExceptionFilter {
  catch(e: TooManyAttemptsException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    res.setHeader('Retry-After', String(e.retryAfterSeconds));
    res.status(429).json(e.getResponse());
  }
}
