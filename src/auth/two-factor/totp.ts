import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * TOTP propio (ANEXO-S0 §2.1, §3.4): HOTP RFC 4226 + TOTP RFC 6238 (HMAC-SHA1, 6 dígitos, 30 s) y Base32 RFC 4648.
 * SHA1 porque es lo que leen todas las apps; en HOTP el problema de colisiones de SHA1 no aplica.
 */
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export const PERIOD_SECONDS = 30;
export const DIGITS = 6;

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error('Base32 inválido');
    value = (value << 5) | i; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** HOTP RFC 4226: código de 6 dígitos para un contador. */
export function hotp(secret: Buffer, counter: number): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** DIGITS).padStart(DIGITS, '0');
}

/** Paso de tiempo T = floor(segundos / 30). */
export const stepAt = (epochMs: number) => Math.floor(epochMs / 1000 / PERIOD_SECONDS);

/** ¿Es una entrada con forma de TOTP (exactamente 6 dígitos, sin espacios)? */
export const looksLikeTotp = (code: string) => /^\d{6}$/.test(code.replace(/\s/g, ''));

/**
 * Verifica con ventana ±1 paso, comparando LOS TRES en tiempo constante. Devuelve el mayor paso que coincide
 * (para el anti-reuso) o null.
 */
export function verifyTotp(secret: Buffer, code: string, epochMs: number): number | null {
  const c = code.replace(/\s/g, '');
  if (!looksLikeTotp(c)) return null;
  const t = stepAt(epochMs);
  const given = Buffer.from(c);
  let match: number | null = null;
  for (const step of [t - 1, t, t + 1]) {
    if (step < 0) continue;
    const ok = timingSafeEqual(Buffer.from(hotp(secret, step)), given);
    if (ok) match = step; // sin cortar el ciclo: siempre se calculan los tres
  }
  return match;
}

/** Secreto nuevo de 20 bytes (32 caracteres Base32). */
export const newSecret = () => randomBytes(20);

/** URI para la app del teléfono. */
export function otpauthUri(issuer: string, account: string, secretB32: string): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  return `otpauth://totp/${label}?secret=${secretB32}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${PERIOD_SECONDS}`;
}

/** El secreto en grupos de 4, para escribirlo a mano. */
export const groupSecret = (b32: string) => b32.replace(/(.{4})/g, '$1 ').trim();
