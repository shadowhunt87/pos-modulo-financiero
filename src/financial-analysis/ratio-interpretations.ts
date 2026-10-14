import type { Prisma } from '../generated/prisma/client.js';
import type { Color } from './ratio-thresholds.js';

/**
 * Una frase por razón y color, escrita para el dueño (P3, P6): qué significa el número y qué hacer.
 * Vive en el backend para que salga igual en pantalla y en el PDF. Los números con el mismo formato
 * que las pantallas (es-DO: 1,234.50). Sin símbolos fuera de Helvetica (nada de «≥»).
 */
const nf = (d: number) => new Intl.NumberFormat('es-DO', { minimumFractionDigits: d, maximumFractionDigits: d });
export const fmtRatio = (v: Prisma.Decimal) => nf(2).format(v.toNumber());
export const fmtPct = (v: Prisma.Decimal) => `${nf(1).format(v.toNumber())} %`;
export const fmtDays = (v: Prisma.Decimal) => `${nf(0).format(v.toNumber())} días`;
export const fmtMoney = (v: Prisma.Decimal) => `RD$${nf(2).format(v.toNumber())}`;
const n1 = (v: Prisma.Decimal) => nf(1).format(v.toNumber());

type Phrases = Partial<Record<'GREEN' | 'YELLOW' | 'RED' | 'NONE', (v: Prisma.Decimal) => string>>;

const PHRASES: Record<string, Phrases> = {
  currentRatio: {
    GREEN: (v) => `Por cada peso que la empresa debe a corto plazo, tiene ${fmtRatio(v)} pesos que puede convertir en efectivo en menos de un año. Puede pagar sus deudas inmediatas con holgura.`,
    YELLOW: (v) => `Por cada peso que debe a corto plazo tiene ${fmtRatio(v)} pesos disponibles en el año. Alcanza, pero con poco margen: vigile los cobros y los pagos próximos.`,
    RED: (v) => `Por cada peso que debe a corto plazo solo tiene ${fmtRatio(v)} pesos disponibles en el año. Podría no alcanzar para pagar a tiempo: revise cobros pendientes y plazos con proveedores.`,
  },
  quickRatio: {
    GREEN: (v) => `Sin contar el inventario, tiene ${fmtRatio(v)} pesos en efectivo y cuentas por cobrar por cada peso que debe a corto plazo. No depende de vender mercancía para pagar.`,
    YELLOW: (v) => `Sin contar el inventario, tiene ${fmtRatio(v)} pesos por cada peso que debe a corto plazo. Para pagar todo necesitaría vender parte del inventario.`,
    RED: (v) => `Sin contar el inventario, tiene apenas ${fmtRatio(v)} pesos por cada peso que debe a corto plazo. Depende de vender inventario para pagar sus deudas inmediatas.`,
  },
  cashRatio: {
    GREEN: (v) => `Tiene ${fmtRatio(v)} pesos en efectivo y banco por cada peso que debe a corto plazo. Tiene una buena reserva de efectivo.`,
    YELLOW: (v) => `Tiene ${fmtRatio(v)} pesos en efectivo por cada peso que debe a corto plazo. La caja está algo justa: dependerá de cobrar a tiempo.`,
    RED: (v) => `Tiene solo ${fmtRatio(v)} pesos en efectivo por cada peso que debe a corto plazo. La caja está tensa: un atraso en los cobros puede complicar los pagos.`,
  },
  workingCapital: {
    GREEN: (v) => `Lo que tiene disponible a corto plazo supera lo que debe a corto plazo en ${fmtMoney(v)}. Ese es su colchón para operar.`,
    RED: (v) => `Lo que debe a corto plazo supera lo que tiene disponible: el capital de trabajo es ${fmtMoney(v)}. Necesita cobrar más rápido, alargar plazos o conseguir financiamiento de largo plazo.`,
  },
  debtToAssets: {
    GREEN: (v) => `El ${fmtPct(v)} de lo que tiene la empresa está financiado con deudas; el resto es de los dueños. Es un nivel de deuda prudente.`,
    YELLOW: (v) => `El ${fmtPct(v)} de lo que tiene la empresa está financiado con deudas. Es un nivel que conviene no seguir subiendo.`,
    RED: (v) => `El ${fmtPct(v)} de lo que tiene la empresa está financiado con deudas. Depende mucho de terceros: un mal mes puede ser difícil de sostener.`,
  },
  debtToEquity: {
    GREEN: (v) => `Por cada peso que han puesto los dueños, la empresa debe ${fmtRatio(v)} pesos. La deuda está bajo control.`,
    YELLOW: (v) => `Por cada peso de los dueños, la empresa debe ${fmtRatio(v)} pesos. La deuda ya es mayor que lo aportado: vigílela.`,
    RED: (v) => `Por cada peso de los dueños, la empresa debe ${fmtRatio(v)} pesos. Está muy endeudada en relación con lo que es suyo.`,
  },
  equityMultiplier: {
    GREEN: (v) => `Por cada peso de los dueños, la empresa maneja ${fmtRatio(v)} pesos en bienes. Usa poca deuda para crecer.`,
    YELLOW: (v) => `Por cada peso de los dueños, la empresa maneja ${fmtRatio(v)} pesos en bienes. Usa bastante deuda para operar.`,
    RED: (v) => `Por cada peso de los dueños, la empresa maneja ${fmtRatio(v)} pesos en bienes. Depende mucho de la deuda: los intereses pesan.`,
  },
  interestCoverage: {
    GREEN: (v) => `Lo que gana la operación cubre ${fmtRatio(v)} veces los intereses que paga. Puede pagar sus préstamos sin problema.`,
    YELLOW: (v) => `Lo que gana la operación cubre ${fmtRatio(v)} veces los intereses. Hay poco margen si bajan las ventas.`,
    RED: (v) => `Lo que gana la operación cubre solo ${fmtRatio(v)} veces los intereses. Los préstamos se están comiendo la ganancia.`,
  },
  grossMargin: {
    GREEN: (v) => `De cada 100 pesos vendidos, le quedan ${n1(v)} después de pagar lo que cuesta lo vendido. (Este número varía mucho según el tipo de negocio.)`,
    YELLOW: (v) => `De cada 100 pesos vendidos, le quedan ${n1(v)} después del costo de lo vendido. Revise precios y costos de compra. (Varía mucho según el tipo de negocio.)`,
    RED: (v) => `De cada 100 pesos vendidos, solo le quedan ${n1(v)} después del costo de lo vendido. Puede que esté vendiendo muy barato o comprando caro. (Varía mucho según el tipo de negocio.)`,
  },
  operatingMargin: {
    GREEN: (v) => `De cada 100 pesos vendidos, la operación deja ${n1(v)} de ganancia antes de intereses e impuestos.`,
    YELLOW: (v) => `De cada 100 pesos vendidos, la operación deja ${n1(v)} antes de intereses e impuestos. Los gastos se llevan casi todo lo que deja la venta.`,
    RED: (v) => `De cada 100 pesos vendidos, la operación deja ${n1(v)} antes de intereses e impuestos. Los gastos de operar son muy altos para lo que se vende.`,
  },
  netMargin: {
    GREEN: (v) => `De cada 100 pesos que entran, le quedan ${n1(v)} de ganancia al final, después de todos los gastos e impuestos.`,
    YELLOW: (v) => `De cada 100 pesos que entran, le quedan ${n1(v)} de ganancia al final. La empresa gana, pero poco.`,
    RED: (v) => `La empresa está perdiendo: el margen neto es ${fmtPct(v)}. Los gastos superan a los ingresos.`,
  },
  ebitdaMargin: {
    GREEN: (v) => `De cada 100 pesos de venta, la operación genera ${n1(v)} antes de intereses, impuestos y depreciación. El negocio en sí produce buen dinero.`,
    YELLOW: (v) => `De cada 100 pesos de venta, la operación genera ${n1(v)} antes de intereses, impuestos y depreciación. Produce dinero, pero con poco margen.`,
    RED: (v) => `De cada 100 pesos de venta, la operación genera solo ${n1(v)} antes de intereses, impuestos y depreciación. El negocio casi no produce dinero por sí mismo.`,
  },
  roa: {
    GREEN: (v) => `Los bienes de la empresa rinden ${fmtPct(v)} al año en ganancia. Los está usando bien.`,
    YELLOW: (v) => `Los bienes de la empresa rinden ${fmtPct(v)} al año en ganancia. Es un rendimiento bajo para lo que tiene.`,
    RED: (v) => `Los bienes de la empresa rinden ${fmtPct(v)} al año: está perdiendo dinero con lo que tiene.`,
  },
  roe: {
    GREEN: (v) => `Lo que han puesto los dueños rinde ${fmtPct(v)} al año. Es un buen rendimiento para la inversión.`,
    YELLOW: (v) => `Lo que han puesto los dueños rinde ${fmtPct(v)} al año. Gana, pero menos de lo que se espera de un negocio.`,
    RED: (v) => `Lo que han puesto los dueños rinde ${fmtPct(v)} al año: la inversión está perdiendo valor.`,
  },
  daysSalesOutstanding: {
    GREEN: (v) => `Sus clientes le pagan, en promedio, en ${fmtDays(v)}. Cobra a tiempo.`,
    YELLOW: (v) => `Sus clientes le pagan, en promedio, en ${fmtDays(v)}. Están tardando más de lo habitual: revise quién debe.`,
    RED: (v) => `Sus clientes le pagan, en promedio, en ${fmtDays(v)}. Cobra muy tarde: ese dinero le falta en caja. Revise las cuentas por cobrar.`,
  },
};

const NEUTRAL: Record<string, (v: Prisma.Decimal) => string> = {
  receivablesTurnover: (v) => `Las cuentas por cobrar se cobran y se renuevan ${fmtRatio(v)} veces en el período.`,
  daysPayablesOutstanding: (v) => `Paga a sus proveedores, en promedio, en ${fmtDays(v)}.`,
  payablesTurnover: (v) => `Las cuentas por pagar se pagan y se renuevan ${fmtRatio(v)} veces en el período.`,
  inventoryTurnover: (v) => `El inventario se vende y se repone ${fmtRatio(v)} veces en el período.`,
  daysInventoryOutstanding: (v) => `La mercancía dura, en promedio, ${fmtDays(v)} en el almacén antes de venderse.`,
  cashConversionCycle: (v) => `Desde que paga la mercancía hasta que cobra la venta pasan, en promedio, ${fmtDays(v)}.`,
};

/** Frase para el dueño. `value` es el valor evaluado (anualizado si aplica). */
export function interpret(key: string, color: Color, value: Prisma.Decimal | null, note?: string): string {
  if (value === null || color === 'GRAY') return `No se puede calcular todavía: ${note ?? 'faltan datos'}.`;
  const byColor = color === 'NONE' ? undefined : PHRASES[key]?.[color];
  if (byColor) return byColor(value);
  // Sin semáforo (desactivado por la empresa o sin límites): solo describe, no juzga
  return NEUTRAL[key]?.(value) ?? '';
}
