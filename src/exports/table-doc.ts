/**
 * Modelo común de documento exportable: todos los reportes se convierten a esto y de aquí salen
 * el Excel y el PDF. Así cada reporte nuevo solo necesita un "builder", no dos renderers.
 */
export type Fmt = 'text' | 'money' | 'int' | 'percent' | 'ratio' | 'days';
export type Cell = string | number | null | { v: string | number | null; fmt: Fmt };

export interface Column {
  header: string;
  fmt?: Fmt; // default 'text'
  /** peso relativo del ancho (default 1) */
  w?: number;
  /** true = solo en Excel (columnas de detalle que no caben en una hoja impresa) */
  xlsxOnly?: boolean;
}

export interface Row {
  cells: Cell[];
  bold?: boolean;
}

export interface Section {
  title: string;
  columns: Column[];
  rows: Row[];
  /** fila de totales: misma cantidad de celdas que columns */
  totals?: Cell[];
  notes?: string[];
}

export interface TableDoc {
  title: string;
  subtitle?: string;
  company: { name: string; taxId?: string | null };
  /** nombre de archivo sin extensión */
  fileBase: string;
  sections: Section[];
}

export const cellValue = (c: Cell) => (c !== null && typeof c === 'object' ? c.v : c);
export const cellFmt = (c: Cell, col: Column): Fmt => (c !== null && typeof c === 'object' ? c.fmt : (col.fmt ?? 'text'));

export const XLSX_NUMFMT: Record<Fmt, string | undefined> = {
  text: undefined,
  money: '#,##0.00;[Red]-#,##0.00',
  int: '#,##0',
  percent: '0.00"%"',
  ratio: '0.00',
  days: '0.0',
};
