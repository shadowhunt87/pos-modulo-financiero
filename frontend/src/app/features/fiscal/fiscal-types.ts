/** Respuestas de /fiscal (backend src/fiscal). Los Decimal llegan como string. */
export type ParamStatus = 'OFICIAL' | 'POR_VALIDAR';
export interface FiscalParameter {
  id: string; key: string; label: string; kind: string; value: string | null; valueDate: string | null; valueJson: unknown;
  unit: string | null; base: 'ITBIS' | 'SUBTOTAL' | 'TOTAL' | null; validFrom: string; revision: number; source: string;
  sourceUrl: string | null; notes: string | null; status: ParamStatus; inForce: boolean; nextChange: string | null;
}
export interface ParameterVersion extends Omit<FiscalParameter, 'inForce' | 'nextChange'> {
  replaced: boolean; validations: { validatedBy: string; validatedAt: string; note: string | null }[];
}
export interface TaxLinkSuggestion {
  taxRateId: string; name: string; type: string; rate: string; linkedKey: string | null;
  status: 'ENLAZADO' | 'SUGERIDO' | 'AMBIGUO' | 'SIN_COINCIDENCIA' | 'NO_APLICA'; suggestedKey: string | null;
  options: { key: string; label: string; value: string | null; base: string | null; status: ParamStatus }[];
}
export interface FiscalProfile {
  dgiiClassification: string | null; taxRegime: string | null; legalForm: string | null; accountingFramework: string | null;
  frameworkAdoptionDate: string | null; ecfEmitterSince: string | null; isWithholdingAgent: boolean; updatedAt: string | null;
  closingMonth: number; closingMonthAllowed: boolean; complete: boolean; missing: string[];
}
export interface FiscalAlert { code: string; level: 'info' | 'warn' | 'neg'; text: string; link: string | null; linkText: string | null }

/** Cómo se muestra un valor según su tipo. */
export function showValue(p: Pick<FiscalParameter, 'kind' | 'value' | 'valueDate' | 'unit'>): string {
  if (p.kind === 'NONE') return 'No aplica';
  if (p.kind === 'TABLE') return 'Tabla';
  if (p.kind === 'DATE') return p.valueDate ? p.valueDate.slice(0, 10).split('-').reverse().join('/') : '—';
  if (p.kind === 'FLAG') return p.value === '1' ? 'Sí' : 'No';
  if (p.value === null) return '—';
  const v = p.value.replace(/\.?0+$/, '');
  if (p.kind === 'RATE') return `${v} %`;
  if (p.kind === 'DAYS') return `${v} días`;
  return p.unit && p.unit !== 'DOP' ? `${v} ${p.unit}` : `RD$${Number(p.value).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
}
