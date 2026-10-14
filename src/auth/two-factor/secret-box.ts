import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Cifrado del secreto del 2FA (ANEXO-S0 §3.5): AES-256-GCM, IV de 12 bytes, etiqueta de 16, AAD por usuario.
 * Formato `v1:<kid>:<iv>:<cifrado>:<etiqueta>` en base64url; kid = primeros 8 hex de SHA-256(llave).
 */
export class SecretBoxKeyError extends Error {
  constructor() { super('La llave del 2FA no está o no coincide con la que cifró el secreto'); }
}

export class SecretBox {
  private readonly key: Buffer;
  readonly kid: string;

  constructor(hexKey: string) {
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) throw new Error('TWO_FACTOR_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales');
    this.key = Buffer.from(hexKey, 'hex');
    this.kid = createHash('sha256').update(this.key).digest('hex').slice(0, 8);
  }

  seal(plain: Buffer, aad: string): string {
    const iv = randomBytes(12);
    const c = createCipheriv('aes-256-gcm', this.key, iv);
    c.setAAD(Buffer.from(aad));
    const enc = Buffer.concat([c.update(plain), c.final()]);
    return ['v1', this.kid, iv.toString('base64url'), enc.toString('base64url'), c.getAuthTag().toString('base64url')].join(':');
  }

  open(sealed: string, aad: string): Buffer {
    const [v, kid, iv, enc, tag] = sealed.split(':');
    if (v !== 'v1' || !iv || !enc || !tag) throw new Error('Formato de secreto cifrado inválido');
    if (kid !== this.kid) throw new SecretBoxKeyError();
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(enc, 'base64url')), d.final()]);
  }
}

export const aadFor = (userId: string, slot: 'secret' | 'pending') => `UserTwoFactor:${userId}:${slot}`;
