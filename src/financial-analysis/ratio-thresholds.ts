import { Prisma } from '../generated/prisma/client.js';

/** "more" = más es mejor (verde arriba); "less" = menos es mejor (verde abajo). Fija en el código. */
export type Direction = 'more' | 'less';

export interface ThresholdDefault {
  direction: Direction;
  /** null = sin semáforo por defecto (depende del sector); la empresa puede activarlo */
  greenAt: number | null;
  redAt: number | null;
}

/**
 * Límites por defecto del semáforo (PLAN-v0.2 §6.2). Son reglas generales para pymes, no una ley:
 * **POR VALIDAR por las contadoras (D5)** antes de desplegar. Las unidades son las del generador:
 * los porcentajes van en por ciento (50 = 50 %) y los días en días.
 * "more": verde si valor ≥ greenAt; rojo si < redAt. "less": verde si ≤ greenAt; rojo si > redAt.
 */
export const RATIO_THRESHOLDS: Record<string, ThresholdDefault> = {
  // Liquidez
  currentRatio: { direction: 'more', greenAt: 1.5, redAt: 1.0 },
  quickRatio: { direction: 'more', greenAt: 1.0, redAt: 0.7 },
  cashRatio: { direction: 'more', greenAt: 0.3, redAt: 0.1 },
  // Capital de trabajo: positivo verde, cero o negativo rojo (sin amarillo): el límite es 1 centavo
  workingCapital: { direction: 'more', greenAt: 0.01, redAt: 0.01 },
  // Endeudamiento
  debtToAssets: { direction: 'less', greenAt: 50, redAt: 70 },
  debtToEquity: { direction: 'less', greenAt: 1.0, redAt: 2.0 },
  equityMultiplier: { direction: 'less', greenAt: 2.0, redAt: 3.0 },
  interestCoverage: { direction: 'more', greenAt: 3.0, redAt: 1.5 },
  // Rentabilidad (ROA y ROE se evalúan anualizados si el período es corto)
  grossMargin: { direction: 'more', greenAt: 30, redAt: 15 },
  operatingMargin: { direction: 'more', greenAt: 10, redAt: 3 },
  netMargin: { direction: 'more', greenAt: 5, redAt: 0 },
  ebitdaMargin: { direction: 'more', greenAt: 15, redAt: 5 },
  roa: { direction: 'more', greenAt: 5, redAt: 0 },
  roe: { direction: 'more', greenAt: 12, redAt: 0 },
  // Actividad: solo días de cobro tiene semáforo por defecto; el resto depende del sector
  daysSalesOutstanding: { direction: 'less', greenAt: 45, redAt: 75 },
  receivablesTurnover: { direction: 'more', greenAt: null, redAt: null },
  // Pagar más tarde deja más efectivo en la empresa (siempre que no se atrase con el proveedor)
  daysPayablesOutstanding: { direction: 'more', greenAt: null, redAt: null },
  payablesTurnover: { direction: 'less', greenAt: null, redAt: null },
  inventoryTurnover: { direction: 'more', greenAt: null, redAt: null },
  daysInventoryOutstanding: { direction: 'less', greenAt: null, redAt: null },
  cashConversionCycle: { direction: 'less', greenAt: null, redAt: null },
};

/** Razones que se evalúan anualizadas cuando el período tiene menos de 360 días (× 365 / días). */
export const ANNUALIZED_KEYS = ['roa', 'roe'];
export const ANNUALIZE_BELOW_DAYS = 360;

export type Color = 'GREEN' | 'YELLOW' | 'RED' | 'GRAY' | 'NONE';

export interface EffectiveThreshold {
  ratioKey: string;
  direction: Direction;
  greenAt: Prisma.Decimal | null;
  redAt: Prisma.Decimal | null;
  enabled: boolean;
  custom: boolean; // true = la empresa lo cambió
}

/** Verde/amarillo/rojo; GRAY sin dato; NONE sin semáforo (desactivado o sin límites). */
export function colorFor(value: Prisma.Decimal | null, t: EffectiveThreshold): Color {
  if (value === null) return 'GRAY';
  if (!t.enabled || t.greenAt === null || t.redAt === null) return 'NONE';
  if (t.direction === 'more') return value.gte(t.greenAt) ? 'GREEN' : value.lt(t.redAt) ? 'RED' : 'YELLOW';
  return value.lte(t.greenAt) ? 'GREEN' : value.gt(t.redAt) ? 'RED' : 'YELLOW';
}

/** ¿El verde es mejor que el rojo según la dirección? (límites coherentes) */
export function coherent(direction: Direction, greenAt: Prisma.Decimal, redAt: Prisma.Decimal) {
  return direction === 'more' ? greenAt.gte(redAt) : greenAt.lte(redAt);
}

export const STATUS_TEXT: Record<Color, string> = {
  GREEN: 'Bien', YELLOW: 'Atención', RED: 'Riesgo', GRAY: 'Sin dato', NONE: 'Sin semáforo',
};
