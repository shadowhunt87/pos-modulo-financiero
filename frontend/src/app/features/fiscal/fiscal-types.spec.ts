import { showValue } from './fiscal-types';

describe('showValue (valores fiscales)', () => {
  const p = (kind: string, value: string | null, extra: Partial<{ valueDate: string; unit: string }> = {}) =>
    ({ kind, value, valueDate: extra.valueDate ?? null, unit: extra.unit ?? null });

  it('tasas sin ceros de sobra, días, banderas y fechas', () => {
    expect(showValue(p('RATE', '18.000000'))).toBe('18 %');
    expect(showValue(p('RATE', '0.150000'))).toBe('0.15 %');
    expect(showValue(p('DAYS', '15.000000'))).toBe('15 días');
    expect(showValue(p('FLAG', '0'))).toBe('No');
    expect(showValue(p('DATE', null, { valueDate: '2026-10-31T00:00:00.000Z' }))).toBe('31/10/2026');
  });

  it('montos en pesos, horas y lo que no aplica', () => {
    expect(showValue(p('AMOUNT', '250000.000000', { unit: 'DOP' }))).toMatch(/^RD\$250,000\.00$/);
    expect(showValue(p('AMOUNT', '72.000000', { unit: 'horas' }))).toBe('72 horas');
    expect(showValue(p('NONE', null))).toBe('No aplica');
    expect(showValue(p('TABLE', null))).toBe('Tabla');
  });
});
