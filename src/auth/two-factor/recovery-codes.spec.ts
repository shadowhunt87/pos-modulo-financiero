import { hashRecoveryCode, newRecoveryCodes, normalizeRecoveryCode } from './recovery-codes.js';

describe('códigos de emergencia', () => {
  it('10 distintos con formato XXXX-XXXX-XXXX-XXXX en Crockford', () => {
    const codes = newRecoveryCodes();
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){3}$/);
  });

  it('normaliza minúsculas, espacios, guiones, O, I y L; rechaza U y largos distintos de 16', () => {
    expect(normalizeRecoveryCode('7k2m-9qxd 4trw-hb6p')).toBe('7K2M9QXD4TRWHB6P');
    expect(normalizeRecoveryCode('O000-IIII-LLLL-0000')).toBe('0000111111110000');
    expect(normalizeRecoveryCode('UUUU-0000-0000-0000')).toBeNull();
    expect(normalizeRecoveryCode('0000-0000-0000-000')).toBeNull();
    expect(hashRecoveryCode('7K2M9QXD4TRWHB6P')).toMatch(/^[0-9a-f]{64}$/);
  });
});
