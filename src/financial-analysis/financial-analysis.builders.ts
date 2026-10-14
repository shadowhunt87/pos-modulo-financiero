import type { Prisma } from '../generated/prisma/client.js';
import type { Cell, Fmt, Section } from '../exports/table-doc.js';
import { STATUS_TEXT, type Color } from './ratio-thresholds.js';
import type { FinancialAnalysisService } from './financial-analysis.service.js';

type Health = Awaited<ReturnType<FinancialAnalysisService['health']>>;
type Compare = Awaited<ReturnType<FinancialAnalysisService['compare']>>;

const FMT: Record<string, Fmt> = { ratio: 'ratio', percent: 'percent', days: 'days', amount: 'money' };
const num = (d: Prisma.Decimal | null, unit: string): Cell => (d === null ? null : { v: d.toNumber(), fmt: FMT[unit] ?? 'ratio' });
// El PDF usa Helvetica: textos sin símbolos como «≥»
const limit = (dir: string, d: Prisma.Decimal | null, unit: string, green: boolean) =>
  d === null ? '' : `${green ? (dir === 'more' ? 'desde' : 'hasta') : dir === 'more' ? 'menos de' : 'más de'} ${d.toString()}${unit === 'percent' ? '%' : ''}`;

/** Semáforo: una fila por razón con su estado y la explicación para el dueño. */
export function healthSection(h: Health): Section {
  return {
    title: 'Semáforo financiero',
    columns: [
      { header: 'Indicador', w: 2.2 }, { header: 'Valor', w: 1 }, { header: 'Estado', w: 0.9 },
      { header: 'Verde', w: 1 }, { header: 'Rojo', w: 1 }, { header: 'Qué significa', w: 5, xlsxOnly: true },
    ],
    rows: h.items.map((i) => ({
      cells: [
        i.label, num(i.evaluatedValue, i.unit), STATUS_TEXT[i.color as Color],
        limit(i.direction, i.greenAt, i.unit, true), limit(i.direction, i.redAt, i.unit, false), i.message,
      ],
    })),
    notes: [
      `Resumen: ${h.summary.green} bien, ${h.summary.yellow} en atención, ${h.summary.red} en riesgo, ${h.summary.gray} sin dato.`,
      ...h.warnings,
      'Los límites son orientativos para pymes; tu contadora puede ajustarlos para tu tipo de negocio.',
    ],
  };
}

/** Comparación de dos períodos: ambos valores, diferencia, % y si mejoró. */
export function compareSection(c: Compare): Section {
  const yesNo = (v: boolean | null) => (v === null ? 'Igual' : v ? 'Mejoró' : 'Empeoró');
  return {
    title: `Comparación ${c.current.from} a ${c.current.to} contra ${c.previous.from} a ${c.previous.to}`,
    columns: [
      { header: 'Indicador', w: 2.4 }, { header: 'Actual', w: 1 }, { header: 'Anterior', w: 1 },
      { header: 'Diferencia', w: 1 }, { header: 'Cambio %', w: 0.9 }, { header: 'Estado', w: 0.9 }, { header: 'Tendencia', w: 0.9 },
    ],
    rows: c.items.map((i) => ({
      cells: [
        i.label, num(i.current, i.unit), num(i.previous, i.unit), num(i.difference, i.unit),
        i.changePct === null ? null : { v: i.changePct.toNumber(), fmt: 'percent' }, STATUS_TEXT[i.color as Color], yesNo(i.improved),
      ],
    })),
    notes: c.warnings,
  };
}
