import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient } from '../generated/prisma/client.js';
import { FISCAL_MIN_DATE, ymd } from './fiscal-dates.js';

/**
 * Cargador del catálogo fiscal (PLAN-v0.3 §5.5, D25). Lee un archivo JSON estricto, simula (--dry-run) o carga en una
 * sola transacción. SOLO INSERTA: corregir un valor es una revisión nueva (revision n+1 de la misma clave y fecha).
 * Lo usa el comando `load-parameters.ts` y las pruebas e2e (sin proceso aparte).
 */

const KINDS = ['RATE', 'AMOUNT', 'DATE', 'DAYS', 'FLAG', 'TABLE', 'NONE'] as const;
const BASES = ['ITBIS', 'SUBTOTAL', 'TOTAL'] as const;
type Kind = (typeof KINDS)[number];

export interface ParamRow {
  key: string; kind: Kind; validFrom: string; revision: number; source: string;
  value?: string; valueDate?: string; valueJson?: Prisma.InputJsonValue; unit?: string; base?: (typeof BASES)[number];
  sourceUrl?: string; notes?: string;
}
export interface ValidationRow { key: string; validFrom: string; revision?: number; validatedBy: string; validatedAt: string; note?: string }
export interface ObligationRow {
  code: string; name: string; ownerText?: string; frequency: 'MONTHLY' | 'ANNUAL'; rule: 'DAY_OF_NEXT_MONTH' | 'DAYS_AFTER_FY_END' | 'FIXED_DATE';
  ruleValue: number; appliesWhen?: Prisma.InputJsonValue; validFrom: string; revision: number; source: string;
}
export interface HolidayRow { date: string; name: string; source: string }
export interface CatalogFile { description?: string; parameters: ParamRow[]; validations: ValidationRow[]; obligations: ObligationRow[]; holidays: HolidayRow[] }

export interface AffectedDocument { companyId: string; invoiceId: string; number: string | null; ncf: string | null; key: string; replacedParameterId: string }
export interface LoadReport {
  ok: boolean; errors: string[];
  newRows: { key: string; validFrom: string; revision: number; value: string }[];
  newObligations: { code: string; validFrom: string; revision: number }[];
  newHolidays: { date: string; name: string }[];
  revisions: { key: string; validFrom: string; revision: number; replaces: string }[];
  skipped: number; validations: { key: string; validFrom: string; validatedBy: string }[];
  affected: AffectedDocument[]; sha256: string; loadId?: string;
}

const PARAM_FIELDS = new Set(['key', 'kind', 'validFrom', 'revision', 'source', 'value', 'valueDate', 'valueJson', 'unit', 'base', 'sourceUrl', 'notes']);
const VALIDATION_FIELDS = new Set(['key', 'validFrom', 'revision', 'validatedBy', 'validatedAt', 'note']);
const TOP_FIELDS = new Set(['description', 'parameters', 'validations', 'obligations', 'holidays']);
const OBLIGATION_FIELDS = new Set(['code', 'name', 'ownerText', 'frequency', 'rule', 'ruleValue', 'appliesWhen', 'validFrom', 'revision', 'source']);
const HOLIDAY_FIELDS = new Set(['date', 'name', 'source']);
const KEY_RE = /^[A-Z][A-Z0-9_]{1,59}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const NUM_RE = /^-?\d{1,13}(\.\d{1,6})?$/;
// Claves que entran en un cálculo: deben tener valor desde la fecha mínima (A3, D38)
const isCalcKind = (k: Kind) => k === 'RATE' || k === 'AMOUNT';

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const validDate = (s: unknown) => typeof s === 'string' && DATE_RE.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().startsWith(s);

/** Valida el archivo. Cualquier campo desconocido, tipo raro o valor que no corresponda al `kind` es un error. */
export function parseCatalog(text: string): { file: CatalogFile | null; errors: string[] } {
  const errors: string[] = [];
  let raw: unknown;
  try { raw = JSON.parse(text); } catch (e) { return { file: null, errors: [`El archivo no es JSON válido: ${(e as Error).message}`] }; }
  if (!isObj(raw)) return { file: null, errors: ['El archivo debe ser un objeto con "parameters"'] };
  for (const k of Object.keys(raw)) if (!TOP_FIELDS.has(k)) errors.push(`Campo desconocido en la raíz: "${k}"`);
  if (raw.parameters !== undefined && !Array.isArray(raw.parameters)) errors.push('"parameters" debe ser una lista');
  if (raw.parameters === undefined && raw.obligations === undefined && raw.holidays === undefined) errors.push('El archivo no trae "parameters", "obligations" ni "holidays"');
  for (const k of ['obligations', 'holidays'] as const) if (raw[k] !== undefined && !Array.isArray(raw[k])) errors.push(`"${k}" debe ser una lista`);
  if (raw.validations !== undefined && !Array.isArray(raw.validations)) errors.push('"validations" debe ser una lista');
  if (raw.description !== undefined && typeof raw.description !== 'string') errors.push('"description" debe ser texto');

  const parameters: ParamRow[] = [];
  for (const [i, r] of (Array.isArray(raw.parameters) ? raw.parameters : []).entries()) {
    const at = `parameters[${i}]`;
    if (!isObj(r)) { errors.push(`${at}: debe ser un objeto`); continue; }
    for (const k of Object.keys(r)) if (!PARAM_FIELDS.has(k)) errors.push(`${at}: campo desconocido "${k}"`);
    const key = r.key, kind = r.kind;
    if (typeof key !== 'string' || !KEY_RE.test(key)) errors.push(`${at}: "key" debe ser MAYÚSCULAS_CON_GUIONES (hasta 60)`);
    if (typeof kind !== 'string' || !(KINDS as readonly string[]).includes(kind)) errors.push(`${at}: "kind" inválido (${KINDS.join(', ')})`);
    if (!validDate(r.validFrom)) errors.push(`${at}: "validFrom" debe ser una fecha AAAA-MM-DD`);
    const revision = r.revision === undefined ? 1 : r.revision;
    if (!Number.isInteger(revision) || (revision as number) < 1) errors.push(`${at}: "revision" debe ser un entero desde 1`);
    if (typeof r.source !== 'string' || !r.source.trim() || r.source.length > 300) errors.push(`${at}: "source" es obligatorio (hasta 300)`);
    for (const f of ['unit', 'sourceUrl', 'notes'] as const) if (r[f] !== undefined && typeof r[f] !== 'string') errors.push(`${at}: "${f}" debe ser texto`);
    if (r.sourceUrl !== undefined && typeof r.sourceUrl === 'string' && !/^https:\/\//.test(r.sourceUrl)) errors.push(`${at}: "sourceUrl" debe empezar con https://`);
    const k = kind as Kind;
    const needsValue = k === 'RATE' || k === 'AMOUNT' || k === 'DAYS' || k === 'FLAG';
    if (needsValue) {
      if (typeof r.value !== 'string' || !NUM_RE.test(r.value)) errors.push(`${at}: "value" debe ser un número en texto (ej. "18" o "0.15")`);
      else if (k === 'FLAG' && r.value !== '0' && r.value !== '1') errors.push(`${at}: una bandera (FLAG) vale "0" o "1"`);
      else if ((k === 'DAYS') && !/^\d+$/.test(r.value)) errors.push(`${at}: los días son un entero`);
    } else if (r.value !== undefined) errors.push(`${at}: "value" no corresponde a un ${k}`);
    if (k === 'DATE') { if (!validDate(r.valueDate)) errors.push(`${at}: "valueDate" (AAAA-MM-DD) es obligatorio en un DATE`); }
    else if (r.valueDate !== undefined) errors.push(`${at}: "valueDate" solo va en un DATE`);
    if (k === 'TABLE') { if (r.valueJson === undefined || r.valueJson === null) errors.push(`${at}: "valueJson" es obligatorio en un TABLE`); }
    else if (r.valueJson !== undefined) errors.push(`${at}: "valueJson" solo va en un TABLE`);
    if (r.base !== undefined) {
      if (!(BASES as readonly string[]).includes(r.base as string)) errors.push(`${at}: "base" inválida (${BASES.join(', ')})`);
      else if (k !== 'RATE') errors.push(`${at}: "base" solo va en una tasa (retenciones)`);
    }
    parameters.push({ ...(r as unknown as ParamRow), revision: revision as number });
  }

  const validations: ValidationRow[] = [];
  for (const [i, r] of (Array.isArray(raw.validations) ? raw.validations : []).entries()) {
    const at = `validations[${i}]`;
    if (!isObj(r)) { errors.push(`${at}: debe ser un objeto`); continue; }
    for (const k of Object.keys(r)) if (!VALIDATION_FIELDS.has(k)) errors.push(`${at}: campo desconocido "${k}"`);
    if (typeof r.key !== 'string' || !KEY_RE.test(r.key)) errors.push(`${at}: "key" inválida`);
    if (!validDate(r.validFrom)) errors.push(`${at}: "validFrom" debe ser AAAA-MM-DD`);
    if (r.revision !== undefined && (!Number.isInteger(r.revision) || (r.revision as number) < 1)) errors.push(`${at}: "revision" inválida`);
    if (typeof r.validatedBy !== 'string' || r.validatedBy.trim().length < 3) errors.push(`${at}: "validatedBy" es el nombre de quien valida`);
    if (!validDate(r.validatedAt)) errors.push(`${at}: "validatedAt" debe ser AAAA-MM-DD`);
    if (r.note !== undefined && typeof r.note !== 'string') errors.push(`${at}: "note" debe ser texto`);
    validations.push(r as unknown as ValidationRow);
  }

  const obligations: ObligationRow[] = [];
  for (const [i, r] of (Array.isArray(raw.obligations) ? raw.obligations : []).entries()) {
    const at = `obligations[${i}]`;
    if (!isObj(r)) { errors.push(`${at}: debe ser un objeto`); continue; }
    for (const k of Object.keys(r)) if (!OBLIGATION_FIELDS.has(k)) errors.push(`${at}: campo desconocido "${k}"`);
    if (typeof r.code !== 'string' || !/^[A-Z0-9-]{2,30}$/.test(r.code)) errors.push(`${at}: "code" inválido (ej. IT-1, 606)`);
    if (typeof r.name !== 'string' || !r.name.trim()) errors.push(`${at}: "name" es obligatorio`);
    if (!['MONTHLY', 'ANNUAL'].includes(r.frequency as string)) errors.push(`${at}: "frequency" debe ser MONTHLY o ANNUAL`);
    if (!['DAY_OF_NEXT_MONTH', 'DAYS_AFTER_FY_END', 'FIXED_DATE'].includes(r.rule as string)) errors.push(`${at}: "rule" inválida`);
    if (!Number.isInteger(r.ruleValue) || (r.ruleValue as number) < 1) errors.push(`${at}: "ruleValue" debe ser un entero positivo`);
    else if (r.rule === 'DAY_OF_NEXT_MONTH' && (r.ruleValue as number) > 31) errors.push(`${at}: un día del mes va de 1 a 31`);
    else if (r.rule === 'FIXED_DATE' && !validDate(`2000-${String(r.ruleValue).padStart(4, '0').slice(0, 2)}-${String(r.ruleValue).padStart(4, '0').slice(2)}`)) errors.push(`${at}: FIXED_DATE usa MMDD (ej. 331 = 31 de marzo)`);
    if (r.appliesWhen !== undefined && !isObj(r.appliesWhen)) errors.push(`${at}: "appliesWhen" debe ser un objeto`);
    if (!validDate(r.validFrom)) errors.push(`${at}: "validFrom" debe ser AAAA-MM-DD`);
    if (typeof r.source !== 'string' || !r.source.trim()) errors.push(`${at}: "source" es obligatorio`);
    const revision = r.revision === undefined ? 1 : r.revision;
    if (!Number.isInteger(revision) || (revision as number) < 1) errors.push(`${at}: "revision" inválida`);
    obligations.push({ ...(r as unknown as ObligationRow), revision: revision as number });
  }
  const holidays: HolidayRow[] = [];
  for (const [i, r] of (Array.isArray(raw.holidays) ? raw.holidays : []).entries()) {
    const at = `holidays[${i}]`;
    if (!isObj(r)) { errors.push(`${at}: debe ser un objeto`); continue; }
    for (const k of Object.keys(r)) if (!HOLIDAY_FIELDS.has(k)) errors.push(`${at}: campo desconocido "${k}"`);
    if (!validDate(r.date)) errors.push(`${at}: "date" debe ser AAAA-MM-DD`);
    if (typeof r.name !== 'string' || !r.name.trim()) errors.push(`${at}: "name" es obligatorio`);
    if (typeof r.source !== 'string' || !r.source.trim()) errors.push(`${at}: "source" es obligatorio`);
    holidays.push(r as unknown as HolidayRow);
  }

  // Repetidos dentro del mismo archivo
  const seen = new Set<string>();
  for (const p of parameters) {
    const id = `${p.key}|${p.validFrom}|${p.revision}`;
    if (seen.has(id)) errors.push(`Fila repetida: ${p.key} desde ${p.validFrom} revisión ${p.revision}`);
    seen.add(id);
  }
  return { file: errors.length ? null : { description: raw.description as string | undefined, parameters, validations, obligations, holidays }, errors };
}

const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
const numEq = (a: string | undefined, b: Prisma.Decimal | null) => (a === undefined ? b === null : b !== null && new Prisma.Decimal(a).eq(b));
const sameRow = (a: ParamRow, b: { kind: string; value: Prisma.Decimal | null; valueDate: Date | null; valueJson: Prisma.JsonValue | null; unit: string | null; base: string | null; source: string }) =>
  a.kind === b.kind && numEq(a.value, b.value) && (a.valueDate ?? null) === (b.valueDate ? ymd(b.valueDate) : null)
  && JSON.stringify(a.valueJson ?? null) === JSON.stringify(b.valueJson ?? null)
  && (a.unit ?? null) === b.unit && (a.base ?? null) === b.base && a.source === b.source;

/** Calcula qué haría la carga, sin escribir nada. */
export async function planLoad(db: PrismaClient | Prisma.TransactionClient, file: CatalogFile, text: string): Promise<LoadReport> {
  const report: LoadReport = {
    ok: true, errors: [], newRows: [], newObligations: [], newHolidays: [], revisions: [], skipped: 0, validations: [], affected: [],
    sha256: createHash('sha256').update(text).digest('hex'),
  };
  // Obligaciones (idempotente por código, fecha y revisión) y feriados (por fecha)
  if (file.obligations.length) {
    const ex = await db.fiscalObligation.findMany({ where: { code: { in: [...new Set(file.obligations.map((o) => o.code))] } } });
    for (const o of file.obligations) {
      const f = ex.find((e) => e.code === o.code && ymd(e.validFrom) === o.validFrom && e.revision === o.revision);
      if (f) {
        if (f.rule === o.rule && f.ruleValue === o.ruleValue && f.name === o.name && f.frequency === o.frequency) { report.skipped++; continue; }
        report.errors.push(`Obligación ${o.code} desde ${o.validFrom} revisión ${o.revision} ya existe con otros datos: carga la revisión ${o.revision + 1}`);
        continue;
      }
      if (o.revision > 1 && !ex.some((e) => e.code === o.code && ymd(e.validFrom) === o.validFrom && e.revision === o.revision - 1)
        && !file.obligations.some((q) => q.code === o.code && q.validFrom === o.validFrom && q.revision === o.revision - 1)) {
        report.errors.push(`Obligación ${o.code}: la revisión ${o.revision} necesita la ${o.revision - 1}`); continue;
      }
      report.newObligations.push({ code: o.code, validFrom: o.validFrom, revision: o.revision });
    }
  }
  if (file.holidays.length) {
    const ex = await db.holiday.findMany({ where: { date: { in: file.holidays.map((h) => d(h.date)) } } });
    for (const h of file.holidays) {
      const f = ex.find((e) => ymd(e.date) === h.date);
      if (f) { if (f.name === h.name) report.skipped++; else report.errors.push(`El feriado del ${h.date} ya está cargado como «${f.name}»: no se cambia`); continue; }
      report.newHolidays.push({ date: h.date, name: h.name });
    }
  }
  const keys = [...new Set([...file.parameters.map((p) => p.key), ...file.validations.map((v) => v.key)])];
  const existing = await db.fiscalParameter.findMany({ where: { key: { in: keys } }, include: { validations: { select: { validatedBy: true } } } });
  const exId = (k: string, vf: string, rev: number) => existing.find((e) => e.key === k && ymd(e.validFrom) === vf && e.revision === rev);

  for (const p of [...file.parameters].sort((a, b) => a.revision - b.revision)) {
    const found = exId(p.key, p.validFrom, p.revision);
    if (found) {
      if (sameRow(p, found)) { report.skipped++; continue; }
      report.errors.push(`${p.key} desde ${p.validFrom} revisión ${p.revision} ya existe con otros datos: no se cambia; carga la revisión ${p.revision + 1}`);
      continue;
    }
    if (p.revision > 1) {
      const prev = exId(p.key, p.validFrom, p.revision - 1);
      const prevInFile = file.parameters.some((q) => q.key === p.key && q.validFrom === p.validFrom && q.revision === p.revision - 1);
      if (!prev && !prevInFile) { report.errors.push(`${p.key} desde ${p.validFrom}: la revisión ${p.revision} necesita la ${p.revision - 1}`); continue; }
      report.revisions.push({ key: p.key, validFrom: p.validFrom, revision: p.revision, replaces: prev?.id ?? `(revisión ${p.revision - 1} de este archivo)` });
      if (prev) {
        // Documentos emitidos con el valor reemplazado: la contadora decide si hacen falta notas (§5.4)
        const lines = await db.invoiceLine.findMany({
          where: { fiscalParameterId: prev.id, invoice: { status: { not: 'DRAFT' } } },
          select: { invoice: { select: { id: true, companyId: true, number: true, ncf: true } } },
        });
        const whs = await db.invoiceWithholding.findMany({
          where: { fiscalParameterId: prev.id, invoice: { status: { not: 'DRAFT' } } },
          select: { invoice: { select: { id: true, companyId: true, number: true, ncf: true } } },
        });
        const seen = new Set(report.affected.map((a) => a.invoiceId));
        for (const { invoice: inv } of [...lines, ...whs]) {
          if (seen.has(inv.id)) continue;
          seen.add(inv.id);
          report.affected.push({ companyId: inv.companyId, invoiceId: inv.id, number: inv.number, ncf: inv.ncf, key: p.key, replacedParameterId: prev.id });
        }
      }
    }
    report.newRows.push({ key: p.key, validFrom: p.validFrom, revision: p.revision, value: p.value ?? p.valueDate ?? (p.kind === 'TABLE' ? '(tabla)' : p.kind) });
  }

  // Fecha mínima: cada clave de cálculo (tasa o monto) debe tener valor el 2025-01-01, contando lo ya cargado
  const minDay = ymd(FISCAL_MIN_DATE);
  const calcKeys = new Set([...file.parameters.filter((p) => isCalcKind(p.kind)).map((p) => p.key), ...existing.filter((e) => isCalcKind(e.kind as Kind)).map((e) => e.key)]);
  for (const key of calcKeys) {
    const covers = file.parameters.some((p) => p.key === key && p.validFrom <= minDay) || existing.some((e) => e.key === key && ymd(e.validFrom) <= minDay);
    if (!covers) report.errors.push(`${key}: falta su valor desde el ${minDay} (fecha mínima del sistema). Se rechaza todo el catálogo`);
  }

  for (const v of file.validations) {
    const rows = [...existing.filter((e) => e.key === v.key && ymd(e.validFrom) === v.validFrom), ...file.parameters.filter((p) => p.key === v.key && p.validFrom === v.validFrom)];
    if (!rows.length) { report.errors.push(`Validación de ${v.key} desde ${v.validFrom}: no existe ese valor`); continue; }
    const rev = v.revision ?? Math.max(...rows.map((r) => r.revision));
    const ex = exId(v.key, v.validFrom, rev);
    if (ex?.validations.some((x) => x.validatedBy === v.validatedBy)) { report.skipped++; continue; }
    report.validations.push({ key: v.key, validFrom: v.validFrom, validatedBy: v.validatedBy });
  }

  report.ok = report.errors.length === 0;
  return report;
}

/** Carga real en UNA transacción (todo o nada). Vuelve a planear dentro de la transacción. */
export async function applyLoad(
  prisma: PrismaClient, file: CatalogFile, text: string, meta: { fileName: string; gitCommit: string; loadedBy: string },
): Promise<LoadReport> {
  if (!/^[0-9a-f]{7,40}$/.test(meta.gitCommit)) {
    return { ok: false, errors: ['--commit debe ser el hash de git del archivo (7 a 40 caracteres hexadecimales)'], newRows: [], newObligations: [], newHolidays: [], revisions: [], skipped: 0, validations: [], affected: [], sha256: '' };
  }
  return prisma.$transaction(async (tx) => {
    const report = await planLoad(tx, file, text);
    if (!report.ok) return report;
    const load = await tx.fiscalParameterLoad.create({
      data: {
        loadedBy: meta.loadedBy, fileName: meta.fileName, sha256: report.sha256, gitCommit: meta.gitCommit,
        summary: { newRows: report.newRows.length, revisions: report.revisions.length, validations: report.validations.length, skipped: report.skipped, affected: report.affected.length, obligations: report.newObligations.length, holidays: report.newHolidays.length },
      },
    });
    for (const o of [...file.obligations].sort((a, b) => a.revision - b.revision)) {
      if (!report.newObligations.some((n) => n.code === o.code && n.validFrom === o.validFrom && n.revision === o.revision)) continue;
      const prev = o.revision > 1 ? await tx.fiscalObligation.findUnique({ where: { code_validFrom_revision: { code: o.code, validFrom: d(o.validFrom), revision: o.revision - 1 } } }) : null;
      await tx.fiscalObligation.create({
        data: {
          code: o.code, revision: o.revision, name: o.name, ownerText: o.ownerText ?? null, frequency: o.frequency, rule: o.rule, ruleValue: o.ruleValue,
          appliesWhen: o.appliesWhen ?? Prisma.JsonNull, validFrom: d(o.validFrom), supersedesId: prev?.id ?? null, source: o.source, loadId: load.id,
        },
      });
    }
    for (const h of file.holidays) {
      if (report.newHolidays.some((n) => n.date === h.date)) await tx.holiday.create({ data: { date: d(h.date), name: h.name, source: h.source, loadId: load.id } });
    }
    const isNew = (p: ParamRow) => report.newRows.some((n) => n.key === p.key && n.validFrom === p.validFrom && n.revision === p.revision);
    for (const p of [...file.parameters].sort((a, b) => a.revision - b.revision).filter(isNew)) {
      const prev = p.revision > 1
        ? await tx.fiscalParameter.findUnique({ where: { key_validFrom_revision: { key: p.key, validFrom: d(p.validFrom), revision: p.revision - 1 } } })
        : null;
      await tx.fiscalParameter.create({
        data: {
          key: p.key, revision: p.revision, kind: p.kind, value: p.value ?? null, valueDate: p.valueDate ? d(p.valueDate) : null,
          valueJson: p.valueJson ?? Prisma.JsonNull, unit: p.unit ?? null, base: p.base ?? null, validFrom: d(p.validFrom),
          supersedesId: prev?.id ?? null, source: p.source, sourceUrl: p.sourceUrl ?? null, notes: p.notes ?? null, loadId: load.id,
        },
      });
    }
    for (const v of file.validations) {
      if (!report.validations.some((x) => x.key === v.key && x.validFrom === v.validFrom && x.validatedBy === v.validatedBy)) continue;
      const rows = await tx.fiscalParameter.findMany({ where: { key: v.key, validFrom: d(v.validFrom) }, orderBy: { revision: 'desc' } });
      const target = v.revision ? rows.find((r) => r.revision === v.revision) : rows[0];
      if (!target) continue;
      await tx.fiscalParameterValidation.create({
        data: { parameterId: target.id, validatedBy: v.validatedBy, validatedAt: d(v.validatedAt), note: v.note ?? null, loadId: load.id },
      });
    }
    return { ...report, loadId: load.id };
  }, { timeout: 60_000 });
}
