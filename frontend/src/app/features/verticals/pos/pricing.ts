import Decimal from 'decimal.js';
import type { PosPromotion } from './types';

/**
 * Copia del motor de precios del backend (src/verticals/pos/pricing.ts) con decimal.js, para que el carrito muestre lo
 * mismo que cobrará el servidor. El servidor siempre recalcula; si difiere, responde TOTAL_MISMATCH.
 */
export const r2 = (d: Decimal) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const D = (v: Decimal.Value | null | undefined) => new Decimal(v ?? 0);

export function drClock(at: Date) {
  const local = new Date(at.getTime() - 4 * 3_600_000);
  return { dow: local.getUTCDay(), minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}
const minuteOf = (hhmm: string | null) => {
  const m = hhmm ? /^(\d{2}):(\d{2})$/.exec(hhmm) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function isPromoActiveAt(p: PosPromotion, at: Date): boolean {
  if (!p.active) return false;
  if (p.startsAt && at < new Date(p.startsAt)) return false;
  if (p.endsAt && at > new Date(p.endsAt)) return false;
  const { dow, minute } = drClock(at);
  if (p.weekdays?.length && !p.weekdays.includes(dow)) return false;
  const from = minuteOf(p.timeFrom), to = minuteOf(p.timeTo);
  if (from !== null && to !== null) {
    const inside = from <= to ? minute >= from && minute < to : minute >= from || minute < to;
    if (!inside) return false;
  }
  return true;
}

export interface CartLine { productId: string; categoryId: string | null; quantity: Decimal; unitPrice: Decimal }

function promoDiscount(p: PosPromotion, l: CartLine): Decimal {
  const gross = l.quantity.times(l.unitPrice);
  if (l.quantity.lte(0) || l.unitPrice.lte(0)) return D(0);
  switch (p.type) {
    case 'PERCENT': return r2(gross.times(Decimal.min(100, Decimal.max(0, D(p.value)))).div(100));
    case 'BUY_X_PAY_Y': {
      const buy = p.buyQty ?? 0, pay = p.payQty ?? 0;
      if (buy <= 0 || pay < 0 || pay >= buy) return D(0);
      return r2(l.quantity.div(buy).floor().times(buy - pay).times(l.unitPrice));
    }
    case 'FIXED_PRICE': {
      const fixed = D(p.value);
      return fixed.gte(l.unitPrice) ? D(0) : r2(l.quantity.times(l.unitPrice.minus(fixed)));
    }
  }
}

export function priceCart(rules: PosPromotion[], lines: CartLine[], at: Date) {
  const active = rules.filter((r) => isPromoActiveAt(r, at));
  return lines.map((l) => {
    const gross = r2(l.quantity.times(l.unitPrice));
    let best = { gross, promoDiscount: D(0), promotionName: null as string | null };
    let bestPriority = -Infinity;
    for (const r of active) {
      const applies = (!r.productIds.length && !r.categoryIds.length) || r.productIds.includes(l.productId) || (!!l.categoryId && r.categoryIds.includes(l.categoryId));
      if (!applies) continue;
      const d = Decimal.min(promoDiscount(r, l), gross);
      if (d.lte(0)) continue;
      if (d.gt(best.promoDiscount) || (d.eq(best.promoDiscount) && r.priority > bestPriority)) { best = { gross, promoDiscount: d, promotionName: r.name }; bestPriority = r.priority; }
    }
    return best;
  });
}
