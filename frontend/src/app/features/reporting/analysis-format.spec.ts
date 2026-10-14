import { fmtDiff, fmtLimit, fmtValue } from './analysis-format';

describe('formato del semáforo', () => {
  it('muestra cada unidad como la lee el dueño', () => {
    expect(fmtValue('2.4167', 'ratio')).toBe('2.42');
    expect(fmtValue('49.5868', 'percent')).toBe('49.6 %');
    expect(fmtValue('40.3722', 'percent')).toBe('40.4 %');
    expect(fmtValue('44.4', 'days')).toBe('44 días');
    expect(fmtValue('85000', 'amount')).toBe('85,000.00');
    expect(fmtValue(null, 'ratio')).toBe('—');
  });

  it('explica el límite según si más es mejor o peor', () => {
    expect(fmtLimit('1.5', 'ratio', 'more', true)).toBe('desde 1.50');
    expect(fmtLimit('1', 'ratio', 'more', false)).toBe('menos de 1.00');
    expect(fmtLimit('50', 'percent', 'less', true)).toBe('hasta 50.0 %');
    expect(fmtLimit('70', 'percent', 'less', false)).toBe('más de 70.0 %');
  });

  it('diferencia con signo', () => {
    expect(fmtDiff('-1.25', 'ratio')).toBe('−1.25');
    expect(fmtDiff('3', 'percent')).toBe('+3.0 %');
    expect(fmtDiff('0', 'days')).toBe('0 días');
  });
});
