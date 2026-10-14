/** Respuestas de /financial-analysis (backend src/financial-analysis). Los Decimal llegan como string. */
export type Light = 'GREEN' | 'YELLOW' | 'RED' | 'GRAY' | 'NONE';
export type Unit = 'ratio' | 'percent' | 'days' | 'amount';

export interface HealthItem {
  key: string; group: 'LIQUIDITY' | 'LEVERAGE' | 'PROFITABILITY' | 'ACTIVITY'; label: string; formula: string; unit: Unit;
  value: string | null; evaluatedValue: string | null; annualized: boolean;
  direction: 'more' | 'less'; greenAt: string | null; redAt: string | null; enabled: boolean; custom: boolean;
  color: Light; status: string; message: string; note?: string;
}
export interface Health {
  from: string; to: string; periodDays: number; complete: boolean; balanced: boolean; unclassifiedCount: number;
  warnings: string[]; summary: { green: number; yellow: number; red: number; gray: number }; items: HealthItem[];
}
export interface TrendPoint { period: string; from: string; to: string; values: Record<string, { value: string | null; evaluatedValue: string | null; annualized: boolean; color: Light }> }
export interface Trend { granularity: 'MONTH' | 'QUARTER' | 'YEAR'; keys: string[]; labels: Record<string, string>; points: TrendPoint[] }
export interface CompareItem {
  key: string; label: string; unit: Unit; direction: 'more' | 'less';
  current: string | null; previous: string | null; difference: string | null; changePct: string | null;
  color: Light; previousColor: Light; improved: boolean | null;
}
export interface Compare {
  current: { from: string; to: string; periodDays: number }; previous: { from: string; to: string; periodDays: number };
  warnings: string[]; items: CompareItem[];
}
export interface Kpi {
  key: string; title: string; technical: string; unit: Unit; current: string | null; previous: string | null;
  color: Light; status: string; message: string; improved: boolean | null;
}
export interface Kpis { current: { from: string; to: string }; previous: { from: string; to: string }; warnings: string[]; items: Kpi[] }
export interface Threshold {
  ratioKey: string; direction: 'more' | 'less'; greenAt: string | null; redAt: string | null; enabled: boolean; custom: boolean;
  defaultGreenAt: string | null; defaultRedAt: string | null;
}
