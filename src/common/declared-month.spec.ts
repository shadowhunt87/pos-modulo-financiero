import { declaredDeadline, isMonthDeclared } from './declared-month.js';

describe('mes ya declarado (día 15 del mes siguiente, hora de RD)', () => {
  const d = (s: string) => new Date(s);

  it('el plazo de enero vence al terminar el 15 de febrero en RD', () => {
    expect(declaredDeadline(d('2030-01-31T00:00:00Z')).toISOString()).toBe('2030-02-16T04:00:00.000Z');
  });

  it('el 15 a las 11:59 p. m. de RD todavía no está declarado; un minuto después sí', () => {
    expect(isMonthDeclared(d('2030-01-10T00:00:00Z'), d('2030-02-16T03:59:00Z'))).toBe(false);
    expect(isMonthDeclared(d('2030-01-10T00:00:00Z'), d('2030-02-16T04:00:00Z'))).toBe(true);
  });

  it('diciembre pasa al 15 de enero del año siguiente', () => {
    expect(declaredDeadline(d('2030-12-20T00:00:00Z')).toISOString()).toBe('2031-01-16T04:00:00.000Z');
  });

  it('el día límite puede venir como dato', () => {
    expect(declaredDeadline(d('2030-03-05T00:00:00Z'), 20).toISOString()).toBe('2030-04-21T04:00:00.000Z');
  });
});
