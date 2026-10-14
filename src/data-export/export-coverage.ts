import { SECRET_NAME_PATTERN } from '../common/secret-names.js';
import { ALLOWED_LOOKALIKES, FILE_NAME_PATTERN, type ExportEntry } from './export-registry.js';

/**
 * Prueba de cobertura del registro (ANEXO-S0 §4.4), como función pura: recibe los modelos, sus columnas y el texto de
 * schema.prisma, y devuelve la lista de problemas (vacía = bien). La usa la prueba de unidad.
 */
export function registryProblems(
  registry: ExportEntry[], models: string[], columnsOf: (model: string) => string[] | undefined, schema: string,
  allowed: Record<string, string> = ALLOWED_LOOKALIKES,
): string[] {
  const out: string[] = [];
  const names = registry.map((e) => e.model);
  for (const m of models) if (!names.includes(m)) out.push(`${m}: falta en src/data-export/export-registry.ts (agrégalo con su clase)`);
  for (const n of names) if (!models.includes(n)) out.push(`${n}: el registro nombra un modelo que no existe`);
  const dup = names.filter((n, i) => names.indexOf(n) !== i);
  for (const d of dup) out.push(`${d}: aparece dos veces en el registro`);

  const blocks = new Map<string, string>();
  for (const m of schema.matchAll(/^model (\w+) \{([\s\S]*?)^\}/gm)) blocks.set(m[1], m[2]);

  for (const e of registry) {
    const cols = columnsOf(e.model);
    if (!cols) continue;
    const silent = e.cls === 'SECRET' || e.cls === 'EXCLUDED_ROLE';
    if (silent) {
      if (!e.reason) out.push(`${e.model}: falta el motivo de por qué no se exporta`);
      if (e.files?.length || e.jsonColumns?.length || e.where) out.push(`${e.model}: un modelo ${e.cls} no puede tener salida`);
      continue;
    }
    if ((e.cls === 'COMPANY' || e.cls === 'ROW_FILTERED') && !cols.includes('companyId')) out.push(`${e.model}: es ${e.cls} pero no tiene companyId`);
    if (e.cls === 'ROW_FILTERED' && !e.reason) out.push(`${e.model}: falta el motivo del filtro de filas`);
    const excluded = (e.excludedColumns ?? []).map((x) => x.column);
    const fileCols = (e.files ?? []).map((f) => f.column);
    for (const c of [...excluded, ...(e.jsonColumns ?? []), ...fileCols]) if (!cols.includes(c)) out.push(`${e.model}.${c}: columna declarada que no existe (¿se renombró?)`);
    for (const c of cols) {
      const id = `${e.model}.${c}`;
      if (SECRET_NAME_PATTERN.test(c) && !excluded.includes(c) && !allowed[id]) out.push(`${id}: parece un secreto; exclúyela (excludedColumns) o justifícala en ALLOWED_LOOKALIKES`);
      if (FILE_NAME_PATTERN.test(c) && !fileCols.includes(c) && !allowed[id]) out.push(`${id}: parece un archivo; decláralo en files o justifícalo en ALLOWED_LOOKALIKES`);
    }
    const block = blocks.get(e.model) ?? '';
    for (const m of block.matchAll(/^\s+(\w+)\s+Json\??(\s|$)/gm)) {
      if (!(e.jsonColumns ?? []).includes(m[1])) out.push(`${e.model}.${m[1]}: es Json y falta en jsonColumns`);
    }
    if (e.cls === 'CHILD') {
      const rel = Object.keys(e.where?.('x') ?? {})[0];
      if (!rel || !new RegExp(`^\\s+${rel}\\s+\\w+`, 'm').test(block)) out.push(`${e.model}: la relación «${rel}» del filtro no es un campo del modelo`);
    }
  }
  return out;
}
