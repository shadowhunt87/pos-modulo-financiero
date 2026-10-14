/** Fechas de los parámetros fiscales: siempre el día en UTC (las columnas son DATE). */
export const ymd = (d: Date) => d.toISOString().slice(0, 10);
export const dateOnly = (d: Date) => new Date(`${ymd(d)}T00:00:00.000Z`);
export const dmy = (d: Date) => { const [y, m, day] = ymd(d).split('-'); return `${day}/${m}/${y}`; };

/** Fecha mínima con valores fiscales (A3, D38): todo cálculo con impuestos enlazados debe tener valor desde aquí. */
export const FISCAL_MIN_DATE = new Date('2025-01-01T00:00:00.000Z');
