import { occurrences, type ObligationRule } from './occurrences.js';

const rule = (o: Partial<ObligationRule>): ObligationRule => ({ code: 'X', name: 'X', frequency: 'MONTHLY', rule: 'DAY_OF_NEXT_MONTH', ruleValue: 20, appliesWhen: null, validFrom: new Date('2025-01-01'), ...o });
const iso = (d: Date) => d.toISOString().slice(0, 10);

describe('occurrences (calendario fiscal)', () => {
  it('un día 20 en domingo pasa al lunes', () => {
    // 20-sep-2026 es domingo → lunes 21
    const r = occurrences([rule({ code: 'IT-1' })], new Date('2026-09-01'), new Date('2026-09-30'), 1, new Set());
    expect(r.map((o) => [o.period, iso(o.dueDate)])).toEqual([['2026-08', '2026-09-21']]);
  });

  it('un día 15 en feriado seguido de sábado pasa al lunes siguiente', () => {
    // 15-ene-2027 es viernes; si es feriado → sábado 16 y domingo 17 → lunes 18
    const r = occurrences([rule({ code: '606', ruleValue: 15 })], new Date('2027-01-01'), new Date('2027-01-31'), 1, new Set(['2027-01-15']));
    expect(r.map((o) => iso(o.dueDate))).toEqual(['2027-01-18']);
  });

  it('IR-2 con cierre al 30-jun vence 120 días después (corrido a laborable)', () => {
    // Inicio del año fiscal en julio → cierre 30-jun-2026; +120 días = 28-oct-2026 (miércoles)
    const r = occurrences([rule({ code: 'IR-2', frequency: 'ANNUAL', rule: 'DAYS_AFTER_FY_END', ruleValue: 120 })], new Date('2026-10-01'), new Date('2026-10-31'), 7, new Set());
    expect(r.map((o) => [o.period, iso(o.dueDate)])).toEqual([['2026', '2026-10-28']]);
  });

  it('cierre en diciembre: IR-2 del 2025 vence el 30-abr-2026 (jueves)', () => {
    const r = occurrences([rule({ code: 'IR-2', frequency: 'ANNUAL', rule: 'DAYS_AFTER_FY_END', ruleValue: 120 })], new Date('2026-04-01'), new Date('2026-05-31'), 1, new Set());
    expect(r.map((o) => [o.period, iso(o.dueDate)])).toEqual([['2025', '2026-04-30']]);
  });

  it('respeta appliesWhen (RST no presenta IT-1)', () => {
    const r = occurrences([rule({ code: 'IT-1', appliesWhen: { taxRegime: 'ORDINARIO' } })], new Date('2026-09-01'), new Date('2026-09-30'), 1, new Set(), { taxRegime: 'RST' });
    expect(r).toEqual([]);
  });
});
