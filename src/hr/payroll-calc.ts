import { Prisma } from '../generated/prisma/client.js';
import type { PayFrequency } from '../generated/prisma/enums.js';

/**
 * Cálculo de la nómina dominicana (P3), como funciones puras: reciben los valores legales ya resueltos (de
 * FiscalParameter, R9) y devuelven montos a 2 decimales. Ningún valor legal vive aquí.
 */
type Dec = Prisma.Decimal;
const D = (v?: Dec | number | string | null): Dec => new Prisma.Decimal(v === null || v === undefined ? 0 : v);
const ZERO = D(0);
export const r2 = (d: Dec): Dec => d.toDecimalPlaces(2, 4);
const min = (a: Dec, b: Dec) => (a.lt(b) ? a : b);
const max = (a: Dec, b: Dec) => (a.gt(b) ? a : b);

export const PERIODS_PER_YEAR: Record<PayFrequency, number> = { MONTHLY: 12, BIWEEKLY: 24, WEEKLY: 52 };

/** Salario de un período completo a partir del salario mensual. */
export function periodSalary(monthly: Dec, frequency: PayFrequency): Dec {
  return monthly.times(12).div(PERIODS_PER_YEAR[frequency]);
}

const DAY = 86_400_000;
/** Días calendario entre dos fechas, ambas incluidas (fechas sin hora, en UTC). */
export function daysInclusive(from: Date, to: Date): number {
  return Math.floor((Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate()) - Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), from.getUTCDate())) / DAY) + 1;
}

/** Días del período en que la persona estuvo contratada (0 si no coincide). */
export function activeDays(periodStart: Date, periodEnd: Date, hireDate: Date, terminationDate: Date | null): number {
  const start = hireDate > periodStart ? hireDate : periodStart;
  const end = terminationDate && terminationDate < periodEnd ? terminationDate : periodEnd;
  return end < start ? 0 : daysInclusive(start, end);
}

export interface IsrBracket { desde: Dec; hasta: Dec | null; tasa: Dec; fijo: Dec; excedenteDe: Dec }

/** Lee la escala anual del valor fiscal ISR_ASALARIADOS_ESCALA. Lanza Error con el problema si no tiene la forma esperada. */
export function parseIsrScale(json: unknown): IsrBracket[] {
  const tramos = (json as { tramos?: unknown } | null)?.tramos;
  if (!Array.isArray(tramos) || !tramos.length) throw new Error('la escala del ISR no trae "tramos"');
  const num = (v: unknown, f: string) => {
    if (typeof v !== 'string' && typeof v !== 'number') throw new Error(`un tramo del ISR no trae "${f}"`);
    return D(v);
  };
  return tramos
    .map((t: Record<string, unknown>) => ({
      desde: num(t.desde, 'desde'), hasta: t.hasta === null || t.hasta === undefined ? null : num(t.hasta, 'hasta'),
      tasa: num(t.tasa, 'tasa'), fijo: num(t.fijo, 'fijo'), excedenteDe: num(t.excedenteDe, 'excedenteDe'),
    }))
    .sort((a, b) => a.desde.cmp(b.desde));
}

/** ISR anual de una renta anual: fijo + (renta − excedenteDe) × tasa del tramo donde cae. */
export function annualIsr(annual: Dec, scale: IsrBracket[]): Dec {
  if (annual.lte(0)) return ZERO;
  let bracket = scale[0];
  for (const b of scale) if (annual.gte(b.desde)) bracket = b;
  return max(ZERO, bracket.fijo.plus(annual.minus(bracket.excedenteDe).times(bracket.tasa).div(100)));
}

export interface PayrollRates {
  /** Porcentajes (2.87 = 2.87 %) */
  afpEmployee: Dec; sfsEmployee: Dec; afpEmployer: Dec; sfsEmployer: Dec; srlEmployer: Dec; infotepEmployer: Dec;
  /** Salario mínimo cotizable mensual y topes en cantidad de salarios mínimos */
  minWage: Dec; capAfp: Dec; capSfs: Dec; capSrl: Dec;
  isrScale: IsrBracket[];
}

export interface LineInput {
  frequency: PayFrequency;
  /** Salario del período, ya prorrateado (o la regalía) */
  salary: Dec;
  earnings: { amount: Dec; affectsTss: boolean; affectsIsr: boolean }[];
  deductions: Dec[];
  /** Regalía pascual: no cotiza a la TSS ni paga ISR (Código de Trabajo art. 222) */
  exempt: boolean;
}

export interface LineResult {
  salary: Dec; otherEarnings: Dec; grossTotal: Dec; tssBase: Dec; afpEmployee: Dec; sfsEmployee: Dec; isrBase: Dec; isr: Dec;
  otherDeductions: Dec; netPay: Dec; afpEmployer: Dec; sfsEmployer: Dec; srlEmployer: Dec; infotepEmployer: Dec;
}

const pct = (base: Dec, rate: Dec) => r2(base.times(rate).div(100));

/**
 * Una línea de nómina. Topes de la TSS: salario mínimo × cantidad, llevados al período (mensual × 12 / períodos del año).
 * ISR: la base del período (ingresos con ISR − AFP − SFS del empleado) se proyecta al año, se aplica la escala anual y
 * se divide entre los períodos del año.
 */
export function calcLine(i: LineInput, rates: PayrollRates | null): LineResult {
  const salary = r2(i.salary);
  const otherEarnings = r2(i.earnings.reduce((s, e) => s.plus(e.amount), ZERO));
  const grossTotal = salary.plus(otherEarnings);
  const otherDeductions = r2(i.deductions.reduce((s, d) => s.plus(d), ZERO));
  const zero = { tssBase: ZERO, afpEmployee: ZERO, sfsEmployee: ZERO, isrBase: ZERO, isr: ZERO, afpEmployer: ZERO, sfsEmployer: ZERO, srlEmployer: ZERO, infotepEmployer: ZERO };
  if (i.exempt || !rates) {
    return { salary, otherEarnings, grossTotal, ...zero, otherDeductions, netPay: grossTotal.minus(otherDeductions) };
  }
  const periods = PERIODS_PER_YEAR[i.frequency];
  const cap = (times: Dec) => rates.minWage.times(times).times(12).div(periods);
  const tssBase = salary.plus(i.earnings.filter((e) => e.affectsTss).reduce((s, e) => s.plus(e.amount), ZERO));
  const afpBase = min(tssBase, cap(rates.capAfp));
  const sfsBase = min(tssBase, cap(rates.capSfs));
  const srlBase = min(tssBase, cap(rates.capSrl));
  const afpEmployee = pct(afpBase, rates.afpEmployee);
  const sfsEmployee = pct(sfsBase, rates.sfsEmployee);
  const isrBase = max(ZERO, salary.plus(i.earnings.filter((e) => e.affectsIsr).reduce((s, e) => s.plus(e.amount), ZERO)).minus(afpEmployee).minus(sfsEmployee));
  const isr = r2(annualIsr(isrBase.times(periods), rates.isrScale).div(periods));
  return {
    salary, otherEarnings, grossTotal, tssBase: r2(tssBase), afpEmployee, sfsEmployee, isrBase: r2(isrBase), isr, otherDeductions,
    netPay: grossTotal.minus(afpEmployee).minus(sfsEmployee).minus(isr).minus(otherDeductions),
    afpEmployer: pct(afpBase, rates.afpEmployer), sfsEmployer: pct(sfsBase, rates.sfsEmployer), srlEmployer: pct(srlBase, rates.srlEmployer),
    infotepEmployer: pct(tssBase, rates.infotepEmployer),
  };
}
