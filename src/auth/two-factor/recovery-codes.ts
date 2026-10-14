import { createHash, randomBytes } from 'node:crypto';

/**
 * Códigos de emergencia (ANEXO-S0 §3.6): 10 × 80 bits en Base32 Crockford, en grupos (`7K2M-9QXD-4TRW-HB6P`).
 * Se guarda SHA-256 del código normalizado; se muestran una sola vez.
 */
const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const RECOVERY_CODE_COUNT = 10;

function crockford(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += CROCKFORD[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += CROCKFORD[(value << (5 - bits)) & 31];
  return out;
}

/** Un código: 10 bytes = 16 caracteres, en 4 grupos de 4. */
export function newRecoveryCode(): string {
  return crockford(randomBytes(10)).replace(/(.{4})(?!$)/g, '$1-');
}

export function newRecoveryCodes(n = RECOVERY_CODE_COUNT): string[] {
  const set = new Set<string>();
  while (set.size < n) set.add(newRecoveryCode());
  return [...set];
}

/** Mayúsculas, sin guiones ni espacios, O→0, I→1, L→1. null si no quedan 16 caracteres válidos. */
export function normalizeRecoveryCode(input: string): string | null {
  const s = input.toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
  if (s.length !== 16) return null;
  for (const ch of s) if (!CROCKFORD.includes(ch)) return null;
  return s;
}

export const hashRecoveryCode = (normalized: string) => createHash('sha256').update(normalized).digest('hex');
