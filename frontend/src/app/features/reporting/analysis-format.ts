import { dec, money } from '../../shared/format';
import type { Unit } from './analysis-types';

/** Valor de una razón con su unidad (los montos con el formato de dinero de siempre, nunca Number()). */
export function fmtValue(v: string | null | undefined, unit: Unit): string {
  if (v === null || v === undefined || v === '') return '—';
  switch (unit) {
    case 'percent': return `${dec(v).toFixed(1)} %`;
    case 'days': return `${dec(v).toFixed(0)} días`;
    case 'amount': return money(v);
    default: return dec(v).toFixed(2);
  }
}

/** Cómo se lee el límite, en palabras ("desde 1.50", "hasta 50.0 %"). */
export function fmtLimit(v: string | null, unit: Unit, direction: 'more' | 'less', green: boolean): string {
  if (v === null) return '—';
  const word = green ? (direction === 'more' ? 'desde' : 'hasta') : direction === 'more' ? 'menos de' : 'más de';
  return `${word} ${fmtValue(v, unit)}`;
}

/** Diferencia con signo, en la unidad de la razón. */
export function fmtDiff(v: string | null, unit: Unit): string {
  if (v === null) return '—';
  const s = fmtValue(dec(v).abs().toString(), unit);
  return dec(v).isNeg() ? `−${s}` : dec(v).isZero() ? s : `+${s}`;
}
