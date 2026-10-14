import { Inject, Injectable, Logger } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { Readable, type Writable } from 'node:stream';
import { ZipFile } from 'yazl';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit, type AuditMeta } from '../common/audit.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { FILE_STORAGE, type FileStorage } from '../attachments/file-storage.js';
import { sanitizeFileName } from '../attachments/file-type.js';
import { EXPORT_REGISTRY, type ExportEntry, type FileColumn } from './export-registry.js';
import { BOM, csvCell, csvLine, zipSafeName } from './csv.js';
import { LEEME } from './leeme.js';

type Tx = Prisma.TransactionClient;
export type ExportPurpose = 'ON_DEMAND' | 'CANCELLATION';
export type FailReason = 'CLIENT_ABORTED' | 'TIMEOUT' | 'STALLED' | 'ERROR';

/** Topes del ciclo de vida (ANEXO-S0 §4.5); se pueden bajar en pruebas. */
export const EXPORT_LIMITS = { txTimeoutMs: 30 * 60_000, totalMs: 45 * 60_000, stallMs: 60_000, pageSize: 1000 };

export interface ExportContext {
  companyId: string;
  actor: AuthUser;
  via: 'API' | 'operator-cli';
  purpose: ExportPurpose;
  meta: AuditMeta;
  motivo?: string;
}

interface FileRef { model: string; id: string; key: string; name: string; entry: FileColumn }
interface TableInfo { model: string; file: string; rows: number; sha256: string; excludedColumns: string[]; rowFilter: string | null }
interface FileInfo { model: string; id: string; path: string | null; sizeBytes: number; sha256: string | null; status: 'OK' | 'MISSING' | 'REJECTED_PATH' }

class ExportAborted extends Error { constructor(readonly reason: FailReason) { super(reason); } }

const OUTPUT: ExportEntry['cls'][] = ['SELF', 'COMPANY', 'CHILD', 'ROW_FILTERED', 'GLOBAL_PUBLIC'];
const delegate = (tx: Tx, model: string) =>
  (tx as unknown as Record<string, { findMany: (a: unknown) => Promise<Record<string, unknown>[]>; count: (a: unknown) => Promise<number> }>)[model[0].toLowerCase() + model.slice(1)];
const columnsOf = (model: string) =>
  Object.values((Prisma as unknown as Record<string, Record<string, string>>)[`${model}ScalarFieldEnum`] ?? {});

/** Hora de RD para el nombre del archivo (UTC-4, sin horario de verano). */
function rdStamp(d = new Date()) {
  const t = new Date(d.getTime() - 4 * 3600_000).toISOString();
  return `${t.slice(0, 10).replace(/-/g, '')}-${t.slice(11, 19).replace(/:/g, '')}`;
}

/**
 * Exportación completa de una empresa en un ZIP (ANEXO-S0 §4): un CSV por modelo del registro, adjuntos, XML,
 * LEEME.txt y manifest.json con SHA-256. Todo en flujo: memoria acotada y nada escrito en el disco de la API.
 */
@Injectable()
export class DataExportService {
  private readonly logger = new Logger('DataExport');
  /** Semáforo global: una exportación a la vez en todo el servidor. */
  private static running = false;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Síncrono, antes de cualquier await (§4.5 paso 1). */
  tryAcquire(): boolean {
    if (DataExportService.running) return false;
    DataExportService.running = true;
    return true;
  }
  release() { DataExportService.running = false; }

  fileName(rnc: string) { return `exportacion-${rnc.replace(/[^0-9A-Za-z-]/g, '')}-${rdStamp()}.zip`; }

  /** Cuánto pesa la exportación, más o menos (pantalla). */
  async summary(companyId: string) {
    const tables: { model: string; rows: number }[] = [];
    for (const e of EXPORT_REGISTRY.filter((x) => OUTPUT.includes(x.cls))) {
      tables.push({ model: e.model, rows: await delegate(this.prisma, e.model).count({ where: e.where?.(companyId) ?? {} }) });
    }
    const files = await this.prisma.attachment.aggregate({ where: { companyId }, _count: true, _sum: { sizeBytes: true } });
    const xml = await this.prisma.ecfDocument.count({ where: { companyId, xmlFileUrl: { not: null } } });
    const rows = tables.reduce((n, t) => n + t.rows, 0);
    const totalBytes = files._sum.sizeBytes ?? 0;
    return {
      tables, files: { count: files._count + xml, totalBytes },
      // ~200 bytes por fila de CSV comprimida a la mitad, más los adjuntos (sin comprimir) y ~8 KB por XML
      estimatedBytes: Math.round(rows * 100 + totalBytes + xml * 8192), limits: { perHour: 3 },
    };
  }

  private async audit(ctx: ExportContext, exportId: string, action: AuditAction, changes: Prisma.InputJsonValue) {
    await this.prisma.$transaction((tx) => writeAudit(tx, ctx.actor, 'DataExport', exportId, action, changes, ctx.meta));
  }

  /** Bitácora antes del primer byte (§4.7). Devuelve el id de la exportación. */
  async start(ctx: ExportContext) {
    const exportId = randomUUID();
    await this.audit(ctx, exportId, AuditAction.CREATE, { event: 'DATA_EXPORT_STARTED', purpose: ctx.purpose, via: ctx.via, ...(ctx.motivo ? { motivo: ctx.motivo } : {}) });
    return exportId;
  }

  /**
   * Escribe el ZIP en `target` (la respuesta HTTP o la salida estándar del comando). El que llama ya tomó el semáforo y
   * lo libera en su `finally`. Resuelve al terminar; rechaza si se corta (y deja DATA_EXPORT_FAILED).
   */
  async stream(target: Writable, ctx: ExportContext, exportId: string): Promise<void> {
    const zip = new ZipFile();
    const out = zip.outputStream as unknown as Readable;
    const zipHash = createHash('sha256');
    let bytes = 0;
    let finished = false;
    let abortReason: FailReason | null = null;
    let rejectAbort: (e: ExportAborted) => void = () => undefined;
    const aborted = new Promise<never>((_, rej) => { rejectAbort = rej; });
    aborted.catch(() => undefined);
    const timers: NodeJS.Timeout[] = [];
    const abort = (reason: FailReason) => {
      if (abortReason || finished) return;
      abortReason = reason;
      rejectAbort(new ExportAborted(reason));
      out.destroy();
    };

    // Bombeo manual: si el cliente no lee en 60 s se corta (§4.5 «cliente que no lee»)
    out.on('data', (chunk: Buffer) => {
      zipHash.update(chunk); bytes += chunk.length;
      if (!target.write(chunk)) {
        out.pause();
        const t = setTimeout(() => abort('STALLED'), EXPORT_LIMITS.stallMs);
        target.once('drain', () => { clearTimeout(t); out.resume(); });
      }
    });
    const outDone = new Promise<void>((res, rej) => { out.on('end', res); out.on('error', rej); });
    target.on('close', () => { if (!finished) abort('CLIENT_ABORTED'); });
    target.on('error', () => abort('CLIENT_ABORTED'));
    timers.push(setTimeout(() => abort('TIMEOUT'), EXPORT_LIMITS.totalMs));

    const tables: TableInfo[] = [];
    const fileRefs: FileRef[] = [];
    const fileInfos: FileInfo[] = [];
    let totalRows = 0;
    try {
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: ctx.companyId }, select: { id: true, name: true, taxId: true } });
      const migration = await this.prisma.$queryRaw<{ migration_name: string }[]>(
        Prisma.sql`SELECT migration_name FROM _prisma_migrations WHERE finished_at IS NOT NULL ORDER BY finished_at DESC, migration_name DESC LIMIT 1`);
      zip.addBuffer(Buffer.from(LEEME, 'utf8'), 'LEEME.txt');

      // 1) CSV dentro de una transacción de solo lectura (foto coherente de la base)
      await Promise.race([aborted, this.prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET TRANSACTION READ ONLY');
        const entries = EXPORT_REGISTRY.filter((e) => OUTPUT.includes(e.cls));
        const done: Promise<void>[] = [];
        for (const e of entries) {
          const file = `datos/${e.model}.csv`;
          done.push(new Promise<void>((resolve, reject) => {
            zip.addReadStreamLazy(file, (cb) => {
              const s = this.csvStream(tx, e, ctx.companyId, fileRefs, (rows, sha) => {
                totalRows += rows;
                tables.push({ model: e.model, file, rows, sha256: sha, excludedColumns: (e.excludedColumns ?? []).map((x) => x.column), rowFilter: e.cls === 'ROW_FILTERED' ? (e.reason ?? null) : null });
                resolve();
              });
              s.on('error', reject);
              cb(null, s);
            });
          }));
        }
        await Promise.race([aborted, Promise.all(done)]);
      }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: EXPORT_LIMITS.txTimeoutMs, maxWait: 30_000 })
        .catch((e: unknown) => { if (e instanceof ExportAborted) throw e; if (/expired|timeout/i.test(String(e))) throw new ExportAborted('TIMEOUT'); throw e; })]);

      // 2) Archivos, de a uno (como mucho uno en memoria), sin compresión
      for (const f of fileRefs) {
        if (abortReason) throw new ExportAborted(abortReason);
        if (!f.entry.pattern(ctx.companyId).test(f.key)) {
          this.logger.warn(`Clave de archivo rechazada en la exportación (${f.model} ${f.id})`);
          fileInfos.push({ model: f.model, id: f.id, path: null, sizeBytes: 0, sha256: null, status: 'REJECTED_PATH' });
          continue;
        }
        let data: Buffer;
        try { data = await this.storage.read(f.key); }
        catch { fileInfos.push({ model: f.model, id: f.id, path: null, sizeBytes: 0, sha256: null, status: 'MISSING' }); continue; }
        const path = f.entry.folder === 'adjuntos' ? `adjuntos/${f.id}/${zipSafeName(sanitizeFileName(f.name))}` : `xml/${f.model}/${f.id}.xml`;
        fileInfos.push({ model: f.model, id: f.id, path, sizeBytes: data.length, sha256: createHash('sha256').update(data).digest('hex'), status: 'OK' });
        await Promise.race([aborted, new Promise<void>((resolve) => {
          zip.addReadStreamLazy(path, { compress: false }, (cb) => { const r = Readable.from([data]); r.on('end', () => resolve()); cb(null, r); });
        })]);
      }

      // 3) Índice al final
      const manifest = {
        formatVersion: 1, exportId, purpose: ctx.purpose, generatedAt: new Date().toISOString(),
        company, generatedBy: { userId: ctx.actor.id, email: ctx.actor.email, via: ctx.via },
        schemaMigration: migration[0]?.migration_name ?? null, csvFormulaEscape: true,
        tables, files: fileInfos,
        excludedModels: EXPORT_REGISTRY.filter((e) => !OUTPUT.includes(e.cls)).map((e) => ({ model: e.model, reason: e.reason ?? '' })),
      };
      zip.addBuffer(Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'), 'manifest.json');
      zip.end();
      await Promise.race([aborted, outDone]);
      finished = true;
      await new Promise<void>((res) => { target.end(res); });
      const missing = fileInfos.filter((f) => f.status === 'MISSING').length;
      const rejected = fileInfos.filter((f) => f.status === 'REJECTED_PATH').length;
      await this.audit(ctx, exportId, AuditAction.UPDATE, {
        event: 'DATA_EXPORT_COMPLETED', bytes, sha256: zipHash.digest('hex'), rows: totalRows,
        files: fileInfos.length - missing - rejected, missingFiles: missing, rejectedFiles: rejected,
      });
    } catch (e) {
      const reason: FailReason = e instanceof ExportAborted ? e.reason : 'ERROR';
      if (!(e instanceof ExportAborted)) this.logger.error(`Exportación ${exportId} falló: ${e instanceof Error ? e.message : String(e)}`);
      abort(reason);
      if (!target.destroyed) target.destroy();
      await this.audit(ctx, exportId, AuditAction.UPDATE, { event: 'DATA_EXPORT_FAILED', reason }).catch(() => undefined);
      throw e;
    } finally {
      for (const t of timers) clearTimeout(t);
    }
  }

  /**
   * CSV perezoso: pide la página siguiente (1 000 filas, cursor por id) solo cuando el ZIP le pide datos.
   * Junta las referencias a archivos de los modelos que tienen `files`.
   */
  private csvStream(tx: Tx, e: ExportEntry, companyId: string, files: FileRef[], onEnd: (rows: number, sha: string) => void): Readable {
    const excluded = new Set((e.excludedColumns ?? []).map((x) => x.column));
    const json = new Set(e.jsonColumns ?? []);
    const cols = columnsOf(e.model).filter((c) => !excluded.has(c));
    const header = [...cols, ...(e.files?.length ? ['exportPath'] : [])];
    const select = Object.fromEntries(cols.map((c) => [c, true]));
    const where = e.where?.(companyId) ?? {};
    const hash = createHash('sha256');
    let cursor: string | null = null;
    let rows = 0;
    let started = false;
    const emit = (s: string) => { const b = Buffer.from(s, 'utf8'); hash.update(b); return b; };
    return new Readable({
      read() {
        void (async () => {
          try {
            if (!started) { started = true; this.push(emit(BOM + csvLine(header))); return; }
            const page = await delegate(tx, e.model).findMany({
              where, select, orderBy: { id: 'asc' }, take: EXPORT_LIMITS.pageSize, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
            });
            if (!page.length) { this.push(null); onEnd(rows, hash.digest('hex')); return; }
            cursor = String(page[page.length - 1].id);
            rows += page.length;
            let text = '';
            for (const r of page) {
              const cells = cols.map((c) => csvCell(r[c], json.has(c)));
              if (e.files?.length) {
                const paths: string[] = [];
                for (const f of e.files) {
                  const key = r[f.column];
                  if (typeof key !== 'string' || !key) continue;
                  const name = f.nameColumn ? String(r[f.nameColumn] ?? 'archivo') : `${String(r.id)}.xml`;
                  files.push({ model: e.model, id: String(r.id), key, name, entry: f });
                  paths.push(f.folder === 'adjuntos' ? `adjuntos/${String(r.id)}/${zipSafeName(sanitizeFileName(name))}` : `xml/${e.model}/${String(r.id)}.xml`);
                }
                cells.push(csvCell(paths.join(' ')));
              }
              text += csvLine(cells);
            }
            this.push(emit(text));
          } catch (err) { this.destroy(err as Error); }
        })();
      },
    });
  }
}
