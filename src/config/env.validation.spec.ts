import 'reflect-metadata';
import { validate } from './env.validation.js';

describe('variables del 2FA (ANEXO-S0 §3.3)', () => {
  const base = { DATABASE_URL: 'postgresql://x', JWT_SECRET: '9f8e7d6c5b4a39281706f5e4d3c2b1a0ffeeddccbbaa99887766' };
  const key = '0123456789abcdef'.repeat(4).split('').reverse().join('');

  it('con política y sin llave → error', () => {
    expect(() => validate({ ...base, TWO_FACTOR_REQUIRED_ROLES: 'ADMIN' })).toThrow(/TWO_FACTOR_ENCRYPTION_KEY: es obligatoria/);
  });
  it('llave de 63 caracteres → error; igual a JWT_SECRET → error', () => {
    expect(() => validate({ ...base, TWO_FACTOR_ENCRYPTION_KEY: key.slice(1) })).toThrow(/64 caracteres/);
    expect(() => validate({ ...base, JWT_SECRET: key, TWO_FACTOR_ENCRYPTION_KEY: key })).toThrow(/distinta de JWT_SECRET/);
  });
  it('política vacía y sin llave → bien; con llave válida → bien', () => {
    expect(() => validate({ ...base, TWO_FACTOR_REQUIRED_ROLES: '' })).not.toThrow();
    expect(() => validate({ ...base, TWO_FACTOR_REQUIRED_ROLES: 'ADMIN', TWO_FACTOR_ENCRYPTION_KEY: key })).not.toThrow();
  });
  it('un rol inexistente → error', () => {
    expect(() => validate({ ...base, TWO_FACTOR_REQUIRED_ROLES: 'JEFE', TWO_FACTOR_ENCRYPTION_KEY: key })).toThrow(/no es un rol/);
  });
});
