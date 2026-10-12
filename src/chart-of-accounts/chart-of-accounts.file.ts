import { BadRequestException, PayloadTooLargeException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';
import ExcelJS from 'exceljs';
import { detectFile, sanitizeFileName, type UploadedFileLike } from '../attachments/file-type.js';
import { MAX_COLS, MAX_ROWS, rowsFromGrid, parseCsv, type RawRow } from './chart-of-accounts.rules.js';

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;
export const TOO_LARGE_MESSAGE = 'El archivo pesa más de 2 MB. Divide el plan de cuentas en varios archivos más pequeños';
/** Un plan de 5.000 cuentas ocupa unos pocos MB descomprimido; más que esto es un archivo anómalo. */
const MAX_UNZIPPED_BYTES = 30 * 1024 * 1024;
const MAX_ZIP_ENTRIES = 200;
/** Celdas que pueden cubrir, sumados, los rangos de los nombres definidos del libro (5.000 filas x 20 columnas). */
const MAX_NAMED_CELLS = 100_000;

const colNumber = (letters: string) => letters.split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0);

/**
 * exceljs expande celda por celda los rangos de los nombres definidos (<definedName> en xl/workbook.xml):
 * uno sobre toda la hoja ($A$1:$XFD$1048576) agota la memoria. Los rangos de columnas enteras ($A:$J),
 * que Excel usa para el área de impresión, no se expanden y no cuentan.
 */
function assertSmallDefinedNames(xml: string) {
  const names = xml.match(/<definedNames[\s>][\s\S]*?<\/definedNames>/)?.[0] ?? '';
  let cells = 0;
  for (const m of names.matchAll(/\$?([A-Z]{1,3})\$?(\d{1,7}):\$?([A-Z]{1,3})\$?(\d{1,7})/g)) {
    cells += (Math.abs(colNumber(m[3]) - colNumber(m[1])) + 1) * (Math.abs(Number(m[4]) - Number(m[2])) + 1);
    if (cells > MAX_NAMED_CELLS) {
      throw new BadRequestException('El archivo Excel tiene un nombre definido que cubre una zona enorme de la hoja. Copia las cuentas a un libro nuevo y vuelve a subirlo');
    }
  }
}

const notExcel = () =>
  new BadRequestException('El archivo debe ser un Excel (.xlsx) o un CSV guardado como "CSV UTF-8". Descarga la plantilla si tienes dudas');

/**
 * Un .xlsx es un zip. Antes de dárselo a exceljs se descomprime cada parte con tope de tamaño:
 * un zip de 2 MB bien armado puede inflarse a varios GB ("bomba zip") y tumbar el servidor.
 * El tope se aplica sobre los bytes reales, no sobre lo que el zip declara.
 */
function assertSafeZip(buf: Buffer) {
  const bad = () => new BadRequestException('El archivo Excel está dañado o es demasiado grande por dentro');
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw bad();
  const entries = buf.readUInt16LE(eocd + 10);
  if (entries > MAX_ZIP_ENTRIES) throw bad();
  let p = buf.readUInt32LE(eocd + 16);
  let total = 0;
  for (let n = 0; n < entries; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) throw bad();
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const local = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + buf.readUInt16LE(p + 28)).replace(/^\//, '');
    p += 46 + buf.readUInt16LE(p + 28) + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32);
    if (local + 30 > buf.length || buf.readUInt32LE(local) !== 0x04034b50) throw bad();
    const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    if (start + compSize > buf.length) throw bad();
    let data = buf.subarray(start, start + compSize);
    if (method === 8) {
      try {
        data = inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED_BYTES - total + 1 });
      } catch {
        throw bad();
      }
    } else if (method !== 0) throw bad();
    total += data.length;
    if (total > MAX_UNZIPPED_BYTES) throw bad();
    if (name === 'xl/workbook.xml') assertSmallDefinedNames(data.toString('utf8'));
  }
}

/**
 * Partes de la hoja que la importación no necesita y que exceljs expande celda por celda: una sola
 * <mergeCell ref="A1:XFD1048576"/> (o una validación o formato condicional sobre toda la hoja) en un archivo
 * de pocos KB agota la memoria del servidor ("bomba de celdas"). No se leen.
 */
const IGNORED_SHEET_NODES = ['mergeCells', 'dataValidations', 'conditionalFormatting', 'extLst', 'hyperlinks', 'autoFilter'];

const tooManyRows = () => new BadRequestException(`El archivo tiene más de ${String(MAX_ROWS).replace(/\B(?=(\d{3})+$)/g, '.')} filas. Divídelo en varios archivos`);

async function gridFromXlsx(buf: Buffer) {
  assertSafeZip(buf);
  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(buf as unknown as ArrayBuffer, { ignoreNodes: IGNORED_SHEET_NODES });
  } catch {
    throw notExcel();
  }
  // Primera hoja que tenga el encabezado "Código..." (la plantilla trae además la hoja "Instrucciones")
  for (const ws of wb.worksheets) {
    if (ws.actualRowCount > MAX_ROWS + 50) throw tooManyRows();
    const grid: { n: number; cells: string[] }[] = [];
    ws.eachRow((row, n) => {
      const cells: string[] = [];
      for (let c = 1; c <= Math.min(row.cellCount, MAX_COLS); c++) cells.push(row.getCell(c).text ?? '');
      grid.push({ n, cells });
    });
    const rows = rowsFromGrid(grid);
    if (rows) return rows;
  }
  return null;
}

/** Valida y lee el archivo subido (xlsx o csv). Lanza errores en español; nunca guarda nada. */
export async function readChartFile(file: UploadedFileLike | undefined): Promise<RawRow[]> {
  if (!file) throw new BadRequestException('Falta el archivo (campo "file")');
  if (!file.size || !file.buffer?.length) throw new BadRequestException('El archivo está vacío');
  if (file.buffer.length > MAX_UPLOAD_BYTES) throw new PayloadTooLargeException(TOO_LARGE_MESSAGE);

  // Tipo REAL por el contenido (debe coincidir con la extensión); solo xlsx o csv
  let ext: string;
  try {
    ext = detectFile(file.buffer, sanitizeFileName(file.originalname ?? '')).ext;
  } catch {
    throw notExcel();
  }
  if (ext !== 'xlsx' && ext !== 'csv') throw notExcel();

  let rows: RawRow[] | null;
  if (ext === 'xlsx') rows = await gridFromXlsx(file.buffer);
  else {
    const grid = parseCsv(file.buffer.toString('utf8'));
    if (grid.length > MAX_ROWS + 50) throw tooManyRows();
    rows = rowsFromGrid(grid);
  }
  if (!rows) {
    throw new BadRequestException('No se encontró el encabezado: debe haber una fila con "Código de Cuenta" y "Nombre / Descripción de la Cuenta". Descarga la plantilla para ver el formato');
  }
  if (rows.length > MAX_ROWS) throw tooManyRows();
  if (!rows.length) throw new BadRequestException('El archivo no tiene cuentas debajo del encabezado');
  return rows;
}

/** CSV en UTF-8 con BOM (Excel lo abre con acentos correctos). Todo valor va entre comillas. */
export function toCsv(header: string[], rows: string[][]): Buffer {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = [header, ...rows].map((r) => r.map(q).join(','));
  return Buffer.from('﻿' + lines.join('\r\n') + '\r\n', 'utf8');
}
