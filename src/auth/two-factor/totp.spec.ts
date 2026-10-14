import { base32Decode, base32Encode, hotp, looksLikeTotp, otpauthUri, verifyTotp } from './totp.js';

describe('TOTP (RFC 4226 / RFC 6238 / RFC 4648)', () => {
  const secret = Buffer.from('12345678901234567890');

  it('HOTP: vectores del apéndice D de la RFC 4226', () => {
    const expected = ['755224', '287082', '359152', '969429', '338314', '254676', '287922', '162583', '399871', '520489'];
    expect(expected.map((_, i) => hotp(secret, i))).toEqual(expected);
  });

  it('TOTP: vectores del apéndice B de la RFC 6238 (SHA1, 6 dígitos)', () => {
    const cases: [number, string][] = [[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037'], [20000000000, '353130']];
    for (const [t, code] of cases) expect(hotp(secret, Math.floor(t / 30))).toBe(code);
  });

  it('Base32: vectores de la RFC 4648 §10 e ida y vuelta', () => {
    const v: [string, string][] = [['', ''], ['f', 'MY'], ['fo', 'MZXQ'], ['foo', 'MZXW6'], ['foob', 'MZXW6YQ'], ['fooba', 'MZXW6YTB'], ['foobar', 'MZXW6YTBOI']];
    for (const [plain, enc] of v) {
      expect(base32Encode(Buffer.from(plain))).toBe(enc);
      expect(base32Decode(enc).toString()).toBe(plain);
    }
    expect(base32Encode(secret)).toHaveLength(32);
  });

  it('ventana ±1 sí, ±2 no; 5 o 7 dígitos no son TOTP', () => {
    const now = 1_700_000_000_000;
    const t = Math.floor(now / 30000);
    expect(verifyTotp(secret, hotp(secret, t - 1), now)).toBe(t - 1);
    expect(verifyTotp(secret, hotp(secret, t + 1), now)).toBe(t + 1);
    expect(verifyTotp(secret, hotp(secret, t - 2), now)).toBeNull();
    expect(verifyTotp(secret, hotp(secret, t + 2), now)).toBeNull();
    expect(looksLikeTotp('12345')).toBe(false);
    expect(looksLikeTotp('1234567')).toBe(false);
    expect(verifyTotp(secret, hotp(secret, t).replace(/^(\d{3})/, '$1 '), now)).toBe(t);
  });

  it('URI para la app', () => {
    expect(otpauthUri('Finanzas', 'ana@x.do', 'ABC')).toBe('otpauth://totp/Finanzas:ana%40x.do?secret=ABC&issuer=Finanzas&algorithm=SHA1&digits=6&period=30');
  });
});
