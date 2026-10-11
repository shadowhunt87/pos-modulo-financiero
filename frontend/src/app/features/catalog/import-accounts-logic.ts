/** Lógica pura del asistente de importación del plan de cuentas (se prueba sin pantalla). */

export type ImportAction = 'create' | 'update' | 'unchanged' | 'skip' | 'error';

export interface ImportRow {
  fila: number;
  codigo: string;
  nombre: string;
  tipo: string;
  padre: string | null;
  accion: ImportAction;
  mensajes: string[];
}
export interface ImportSummary { crear: number; actualizar: number; sinCambios: number; omitidas: number; errores: number }
export interface ImportPreview { resumen: ImportSummary; filas: ImportRow[] }

export const MAX_IMPORT_BYTES = 2 * 1024 * 1024;

/** Texto de error si el archivo no sirve, o '' si está bien. */
export function fileProblem(f: { name: string; size: number }): string {
  if (!/\.(xlsx|csv)$/i.test(f.name)) return 'El archivo debe ser Excel (.xlsx) o CSV (.csv).';
  if (f.size > MAX_IMPORT_BYTES) return 'El archivo pesa más de 2 MB. Divídelo en partes más chicas.';
  if (f.size === 0) return 'El archivo está vacío.';
  return '';
}

const ORDER: Record<ImportAction, number> = { error: 0, create: 1, update: 2, skip: 3, unchanged: 4 };

/** Errores primero, luego el resto, respetando el orden del archivo dentro de cada grupo. */
export function sortRows(rows: ImportRow[], filter: ImportAction | ''): ImportRow[] {
  return rows
    .filter((r) => !filter || r.accion === filter)
    .sort((a, b) => ORDER[a.accion] - ORDER[b.accion] || a.fila - b.fila);
}

/** El POST de importar puede devolver `{ resumen }` o el resumen suelto. */
export function summaryOf(r: ImportSummary | { resumen: ImportSummary }): ImportSummary {
  return 'resumen' in r ? r.resumen : r;
}

export function resultText(s: ImportSummary): string {
  const parts: string[] = [];
  if (s.crear) parts.push(`${s.crear} ${s.crear === 1 ? 'cuenta creada' : 'cuentas creadas'}`);
  if (s.actualizar) parts.push(`${s.actualizar} ${s.actualizar === 1 ? 'actualizada' : 'actualizadas'}`);
  if (!parts.length) return 'No hubo cambios: tu plan de cuentas ya estaba al día.';
  return `Listo: ${parts.join(' y ')}.`;
}
