import { SecretBox, SecretBoxKeyError, aadFor } from './secret-box.js';

describe('SecretBox (AES-256-GCM)', () => {
  const box = new SecretBox('a'.repeat(32) + 'b'.repeat(32));
  const secret = Buffer.from('12345678901234567890');

  it('ida y vuelta; el cifrado no contiene el secreto', () => {
    const s = box.seal(secret, aadFor('u1', 'secret'));
    expect(s.startsWith(`v1:${box.kid}:`)).toBe(true);
    expect(s).not.toContain(secret.toString('base64url'));
    expect(box.open(s, aadFor('u1', 'secret')).equals(secret)).toBe(true);
  });

  it('un byte alterado u otro AAD → error; kid distinto → error propio', () => {
    const s = box.seal(secret, aadFor('u1', 'secret'));
    const parts = s.split(':');
    const enc = Buffer.from(parts[3], 'base64url'); enc[0] ^= 1; parts[3] = enc.toString('base64url');
    expect(() => box.open(parts.join(':'), aadFor('u1', 'secret'))).toThrow();
    expect(() => box.open(s, aadFor('u2', 'secret'))).toThrow();
    expect(() => box.open(s, aadFor('u1', 'pending'))).toThrow();
    expect(() => new SecretBox('c'.repeat(64)).open(s, aadFor('u1', 'secret'))).toThrow(SecretBoxKeyError);
  });

  it('rechaza llaves que no son 64 hex', () => {
    expect(() => new SecretBox('abc')).toThrow();
  });
});
