import { scrubSecrets } from './audit.js';

describe('guardia de writeAudit: sin secretos en changes', () => {
  it('quita nombres de secreto a cualquier profundidad y conserva los booleanos', () => {
    const changes = { password: 'x', nested: { secretEnc: 'y', claveAcceso: 'z' }, codeHash: 'h', passwordReset: true, name: 'Ana' };
    expect(scrubSecrets(changes)).toEqual({ nested: {}, passwordReset: true, name: 'Ana' });
  });

  it('también dentro de listas; lo normal de un maestro queda igual', () => {
    expect(scrubSecrets({ items: [{ token: 't', rate: '18' }] })).toEqual({ items: [{ rate: '18' }] });
    expect(scrubSecrets({ name: 'ITBIS', rate: 18, active: true })).toEqual({ name: 'ITBIS', rate: 18, active: true });
  });
});
