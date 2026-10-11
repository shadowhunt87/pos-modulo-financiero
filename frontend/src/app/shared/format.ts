import Decimal from 'decimal.js';
import { format, parseISO, isValid } from 'date-fns';

export type Num = string | number | Decimal | null | undefined;

/** Decimal seguro: nunca lanza con vacío o texto raro. */
export function dec(v: Num): Decimal {
  if (v === null || v === undefined || v === '') return new Decimal(0);
  try { return new Decimal(v); } catch { return new Decimal(0); }
}
export function sumDec(values: Num[]): Decimal {
  return values.reduce<Decimal>((s, v) => s.plus(dec(v)), new Decimal(0));
}

const nf = new Intl.NumberFormat('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 1180 → "1,180.00". Va por Decimal, así no se pierde precisión con montos grandes. */
export function money(v: Num, opts: { blankZero?: boolean; digits?: number } = {}): string {
  if (v === null || v === undefined || v === '') return '';
  const d = dec(v);
  if (opts.blankZero && d.isZero()) return '';
  const digits = opts.digits ?? 2;
  const fixed = d.toFixed(digits);
  const neg = fixed.startsWith('-');
  const [int, frac] = fixed.replace('-', '').split('.');
  const grouped = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + grouped + (frac ? '.' + frac : '');
}
export function pct(v: Num, digits = 1): string {
  if (v === null || v === undefined || v === '') return '';
  return dec(v).toFixed(digits) + '%';
}
export function number(v: Num): string {
  return v === null || v === undefined || v === '' ? '' : nf.format(Number(v)).replace(/\.00$/, '');
}

/** El backend manda las fechas "sin hora" como medianoche UTC ("2026-10-09T00:00:00.000Z"). */
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})(?:T00:00:00(?:\.0+)?Z)?$/;

/**
 * Fecha de calendario → "YYYY-MM-DD" sin corrimiento de zona horaria (para <input type="date">
 * y para mandar al backend). Si trae hora real, usa la fecha local.
 */
export function isoDate(v: string | Date | null | undefined): string {
  if (!v) return '';
  if (typeof v === 'string') {
    const m = DATE_ONLY.exec(v);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;
    const d = parseISO(v);
    return isValid(d) ? format(d, 'yyyy-MM-dd') : '';
  }
  return isValid(v) ? format(v, 'yyyy-MM-dd') : '';
}

/** "2026-10-09" o ISO → "09/10/2026" (nunca se corre un día por la zona horaria). */
export function fmtDate(v: string | Date | null | undefined): string {
  const iso = isoDate(v);
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
}
export function fmtDateTime(v: string | Date | null | undefined): string {
  if (!v) return '';
  const d = typeof v === 'string' ? parseISO(v) : v;
  return isValid(d) ? format(d, 'dd/MM/yyyy HH:mm') : '';
}

/** Fecha de hoy como "YYYY-MM-DD" (hora local, no UTC). */
export function today(): string { return format(new Date(), 'yyyy-MM-dd'); }
export function yearStart(year = new Date().getFullYear()): string { return `${year}-01-01`; }
export function yearEnd(year = new Date().getFullYear()): string { return `${year}-12-31`; }
export function monthRange(date = new Date()): { from: string; to: string } {
  const y = date.getFullYear(), m = date.getMonth();
  return { from: format(new Date(y, m, 1), 'yyyy-MM-dd'), to: format(new Date(y, m + 1, 0), 'yyyy-MM-dd') };
}
/** "YYYYMM" del mes actual (formato de período DGII). */
export function currentPeriod(date = new Date()): string { return format(date, 'yyyyMM'); }

/** Quita claves vacías de un objeto antes de mandarlo al backend. */
export function clean<T extends Record<string, unknown>>(obj: T): Partial<T> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === '' || v === null || v === undefined) continue;
    out[k] = v;
  }
  return out as Partial<T>;
}
