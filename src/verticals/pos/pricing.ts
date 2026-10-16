import { Prisma } from '../../generated/prisma/client.js';

/**
 * Precios del POS con promociones, como funciones puras con Decimal (R7: nada de float para dinero).
 * La misma lógica está copiada en el frontend (features/verticals/pos/pricing.ts) para que el carrito muestre lo que se
 * cobrará; el servidor siempre recalcula y manda.
 * Precios SIN ITBIS: el impuesto lo calcula la factura del núcleo.
 */
type Dec = Prisma.Decimal;
const D = (v: Dec | number | string | null | undefined) => new Prisma.Decimal(v ?? 0);
export const r2 = (d: Dec) => d.toDecimalPlaces(2, 4);

export interface PromoRule {
  id: string; name: string; type: 'PERCENT' | 'BUY_X_PAY_Y' | 'FIXED_PRICE';
  value: Dec | string | number | null; buyQty: number | null; payQty: number | null;
  productIds: string[]; categoryIds: string[]; startsAt: Date | string | null; endsAt: Date | string | null;
  weekdays: number[]; timeFrom: string | null; timeTo: string | null; priority: number; active: boolean;
}

export interface CartLine { productId: string; categoryId: string | null; quantity: Dec; unitPrice: Dec }
export interface PricedLine { gross: Dec; promoDiscount: Dec; promotionId: string | null; promotionName: string | null }

/** Hora de Santo Domingo (UTC−4, sin horario de verano): día de la semana y minuto del día. */
export function drClock(at: Date) {
  const local = new Date(at.getTime() - 4 * 3_600_000);
  return { dow: local.getUTCDay(), minute: local.getUTCHours() * 60 + local.getUTCMinutes() };
}
const minuteOf = (hhmm: string | null) => {
  const m = hhmm ? /^(\d{2}):(\d{2})$/.exec(hhmm) : null;
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

export function isPromoActiveAt(p: PromoRule, at: Date): boolean {
  if (!p.active) return false;
  if (p.startsAt && at < new Date(p.startsAt)) return false;
  if (p.endsAt && at > new Date(p.endsAt)) return false;
  const { dow, minute } = drClock(at);
  if (p.weekdays?.length && !p.weekdays.includes(dow)) return false;
  const from = minuteOf(p.timeFrom), to = minuteOf(p.timeTo);
  if (from !== null && to !== null) {
    // Ventanas que cruzan medianoche (22:00–02:00)
    const inside = from <= to ? minute >= from && minute < to : minute >= from || minute < to;
    if (!inside) return false;
  }
  return true;
}

const appliesTo = (p: PromoRule, l: CartLine) =>
  (!p.productIds.length && !p.categoryIds.length) || p.productIds.includes(l.productId) || (!!l.categoryId && p.categoryIds.includes(l.categoryId));

/** Descuento (monto) que da una promoción a una línea. */
export function promoDiscount(p: PromoRule, l: CartLine): Dec {
  const gross = l.quantity.times(l.unitPrice);
  if (l.quantity.lte(0) || l.unitPrice.lte(0)) return D(0);
  switch (p.type) {
    case 'PERCENT': {
      const pct = Prisma.Decimal.min(100, Prisma.Decimal.max(0, D(p.value)));
      return r2(gross.times(pct).div(100));
    }
    case 'BUY_X_PAY_Y': {
      const buy = p.buyQty ?? 0, pay = p.payQty ?? 0;
      if (buy <= 0 || pay < 0 || pay >= buy) return D(0);
      const free = l.quantity.div(buy).floor().times(buy - pay);
      return r2(free.times(l.unitPrice));
    }
    case 'FIXED_PRICE': {
      const fixed = D(p.value);
      if (fixed.gte(l.unitPrice)) return D(0);
      return r2(l.quantity.times(l.unitPrice.minus(fixed)));
    }
  }
}

/** Por línea, la promoción que más descuenta (empate: mayor prioridad). */
export function priceCart(rules: PromoRule[], lines: CartLine[], at: Date): PricedLine[] {
  const active = rules.filter((r) => isPromoActiveAt(r, at));
  return lines.map((l) => {
    const gross = r2(l.quantity.times(l.unitPrice));
    let best: PricedLine = { gross, promoDiscount: D(0), promotionId: null, promotionName: null };
    let bestPriority = -Infinity;
    for (const r of active) {
      if (!appliesTo(r, l)) continue;
      const d = Prisma.Decimal.min(promoDiscount(r, l), gross);
      if (d.lte(0)) continue;
      if (d.gt(best.promoDiscount) || (d.eq(best.promoDiscount) && r.priority > bestPriority)) {
        best = { gross, promoDiscount: d, promotionId: r.id, promotionName: r.name };
        bestPriority = r.priority;
      }
    }
    return best;
  });
}
