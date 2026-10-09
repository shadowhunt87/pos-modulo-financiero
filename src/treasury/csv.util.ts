import { createHash } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';

export type DateFormat = 'ISO' | 'DMY' | 'MDY';
export type Field = 'date' | 'description' | 'amount' | 'debit' | 'credit' | 'reference' | 'balance' | 'externalId';
export interface RawRow {
  date?: string; description?: string; amount?: string | number; debit?: string | number; credit?: string | number;
  reference?: string; balance?: string | number; externalId?: string;
}

const strip = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

// Nombres de columna habituales en extractos (español/inglés), sin acentos
const ALIASES: Record<Field, string[]> = {
  date: ['fecha', 'date', 'fecha transaccion', 'fecha posteo', 'fecha valor'],
  description: ['descripcion', 'description', 'concepto', 'detalle', 'narrativa'],
  amount: ['monto', 'amount', 'importe', 'valor'],
  debit: ['debito', 'debit', 'retiro', 'retiros', 'cargo', 'cargos'],
  credit: ['credito', 'credit', 'deposito', 'depositos', 'abono', 'abonos'],
  reference: ['referencia', 'reference', 'ref', 'no. referencia', 'numero', 'documento'],
  balance: ['balance', 'saldo'],
  externalId: ['id', 'externalid', 'id transaccion', 'transaction id'],
};

/** Parser CSV básico: comillas dobles, delimitador configurable, saltos de línea CRLF/LF. */
export function parseCsv(text: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = '', quoted = false;
  const t = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (quoted) {
      if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === delimiter) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some((x) => x.trim() !== '')) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== '')) rows.push(row);
  return rows;
}

export function csvToRows(
  text: string,
  opts: { delimiter?: string; hasHeader?: boolean; columns?: Partial<Record<Field, string>> },
): RawRow[] {
  const first = text.split(/\r?\n/, 1)[0] ?? '';
  const delimiter = opts.delimiter ?? (first.split(';').length > first.split(',').length ? ';' : ',');
  const table = parseCsv(text, delimiter);
  if (table.length === 0) return [];
  const hasHeader = opts.hasHeader ?? true;
  const header = hasHeader ? table[0].map(strip) : [];
  const idx: Partial<Record<Field, number>> = {};
  for (const f of Object.keys(ALIASES) as Field[]) {
    const wanted = opts.columns?.[f] ? [strip(opts.columns[f]!)] : ALIASES[f];
    const i = header.findIndex((h) => wanted.includes(h));
    if (i >= 0) idx[f] = i;
  }
  if (!hasHeader) { // sin encabezado: fecha, descripción, monto
    idx.date = 0; idx.description = 1; idx.amount = 2;
  }
  if (idx.date === undefined || idx.description === undefined || (idx.amount === undefined && idx.debit === undefined && idx.credit === undefined)) {
    throw new Error('No se encontraron las columnas fecha, descripción y monto (o débito/crédito). Usa `columns` para indicarlas.');
  }
  return table.slice(hasHeader ? 1 : 0).map((cols) => {
    const get = (f: Field) => (idx[f] === undefined ? undefined : cols[idx[f]!]?.trim());
    return {
      date: get('date'), description: get('description'), amount: get('amount'), debit: get('debit'),
      credit: get('credit'), reference: get('reference'), balance: get('balance'), externalId: get('externalId'),
    };
  });
}

/** "1,234.56" | "1.234,56" | "(100.00)" | "100.00-" -> Decimal. null si no es un número. */
export function parseAmount(v: string | number | undefined | null, decimalSeparator: '.' | ',' = '.'): Prisma.Decimal | null {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? new Prisma.Decimal(v) : null;
  let s = v.trim();
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  s = s.replace(/[^\d.,]/g, '');
  s = decimalSeparator === ',' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const d = new Prisma.Decimal(s);
  return neg ? d.neg() : d;
}

export function parseDate(s: string | undefined, fmt: DateFormat = 'DMY'): Date | null {
  if (!s) return null;
  const t = s.trim();
  let y: number, m: number, d: number;
  let r = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (r) { y = +r[1]; m = +r[2]; d = +r[3]; }
  else {
    r = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/.exec(t);
    if (!r) return null;
    if (fmt === 'MDY') { m = +r[1]; d = +r[2]; } else { d = +r[1]; m = +r[2]; }
    y = +r[3];
  }
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

/** Id estable de una fila: re-importar el mismo extracto no duplica movimientos. */
export function fingerprint(date: Date, amount: Prisma.Decimal, description: string, reference: string, occurrence: number) {
  return 'h:' + createHash('sha1')
    .update(`${date.toISOString().slice(0, 10)}|${amount.toFixed(4)}|${description.toLowerCase()}|${reference}|${occurrence}`)
    .digest('hex');
}