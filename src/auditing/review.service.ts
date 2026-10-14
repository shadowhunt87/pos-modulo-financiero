import { BadRequestException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction, AuditEntityType, EngagementStatus, FindingStatus, UserRole } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { FILE_STORAGE, type FileStorage } from '../attachments/file-storage.js';
import { detectFile, sanitizeFileName, type UploadedFileLike } from '../attachments/file-type.js';
import { FilesQuery, ItemsQuery, MarkDto, UploadAuditFileDto } from './dto/auditing.dto.js';

const MAX_FILES = 50;
const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Entidad de AuditLog que corresponde a cada tipo de partida. */
const LOG_ENTITY: Record<AuditEntityType, string> = { JOURNAL_ENTRY: 'JournalEntry', INVOICE: 'Invoice', PAYMENT: 'Payment', BANK_RECONCILIATION: 'BankReconciliation' };

interface Item { id: string; date: Date; number: string | null; description: string; amount: Prisma.Decimal | null; status: string }

/**
 * Revisión de partidas, marcas, historial y soportes de la auditora (PLAN-v0.2 §5.3, paquete A4; opcionales O1 y O2).
 * Las marcas apuntan a documentos sin llave foránea: aquí se verifica que existan, sean de la empresa y del período.
 */
@Injectable()
export class ReviewService {
  private readonly log = new Logger('AuditingFiles');
  constructor(private readonly prisma: PrismaService, @Inject(FILE_STORAGE) private readonly storage: FileStorage) {}

  private async engagement(id: string, user: AuthUser) {
    const e = await this.prisma.auditEngagement.findFirst({ where: { id, companyId: user.companyId } });
    if (!e) throw new NotFoundException('Encargo no encontrado');
    return e;
  }
  private assertOpen(e: { status: EngagementStatus }) {
    if (e.status === EngagementStatus.CLOSED) throw new UnprocessableEntityException('El encargo está cerrado: es de solo lectura');
  }

  /** Documentos del período (por tipo) con su búsqueda; filtro por empresa y fechas. */
  private async documents(type: AuditEntityType, companyId: string, start: Date, end: Date, q?: string): Promise<Item[]> {
    const range = { gte: start, lte: new Date(end.getTime() + 86_399_999) };
    const text = q?.trim();
    switch (type) {
      case 'JOURNAL_ENTRY': {
        const rows = await this.prisma.journalEntry.findMany({
          where: { companyId, date: range, status: { not: 'DRAFT' }, ...(text ? { OR: [{ number: { contains: text, mode: 'insensitive' } }, { description: { contains: text, mode: 'insensitive' } }] } : {}) },
          select: { id: true, date: true, number: true, description: true, status: true, lines: { select: { debit: true } } }, orderBy: { date: 'asc' },
        });
        return rows.map((r) => ({ id: r.id, date: r.date, number: r.number, description: r.description, status: r.status, amount: r.lines.reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0)) }));
      }
      case 'INVOICE': {
        const rows = await this.prisma.invoice.findMany({
          where: { companyId, issueDate: range, status: { not: 'DRAFT' }, ...(text ? { OR: [{ number: { contains: text, mode: 'insensitive' } }, { ncf: { contains: text, mode: 'insensitive' } }, { partner: { name: { contains: text, mode: 'insensitive' } } }] } : {}) },
          select: { id: true, issueDate: true, number: true, ncf: true, type: true, status: true, total: true, partner: { select: { name: true } } }, orderBy: { issueDate: 'asc' },
        });
        return rows.map((r) => ({ id: r.id, date: r.issueDate, number: r.ncf ? `${r.number} · ${r.ncf}` : r.number, description: `${r.type} · ${r.partner.name}`, status: r.status, amount: r.total }));
      }
      case 'PAYMENT': {
        const rows = await this.prisma.payment.findMany({
          where: { companyId, date: range, ...(text ? { OR: [{ number: { contains: text, mode: 'insensitive' } }, { reference: { contains: text, mode: 'insensitive' } }, { partner: { name: { contains: text, mode: 'insensitive' } } }] } : {}) },
          select: { id: true, date: true, number: true, direction: true, status: true, amount: true, partner: { select: { name: true } } }, orderBy: { date: 'asc' },
        });
        return rows.map((r) => ({ id: r.id, date: r.date, number: r.number, description: `${r.direction === 'RECEIVED' ? 'Cobro' : 'Pago'} · ${r.partner.name}`, status: r.status, amount: r.amount }));
      }
      case 'BANK_RECONCILIATION': {
        const rows = await this.prisma.bankReconciliation.findMany({
          where: { companyId, statementDate: range }, select: { id: true, statementDate: true, status: true, statementBalance: true, bankAccount: { select: { bankName: true, accountNumber: true } } }, orderBy: { statementDate: 'asc' },
        });
        return rows.map((r) => ({ id: r.id, date: r.statementDate, number: null, description: `${r.bankAccount.bankName} ${r.bankAccount.accountNumber}`, status: r.status, amount: r.statementBalance }));
      }
    }
  }

  async items(engagementId: string, q: ItemsQuery, user: AuthUser) {
    const e = await this.engagement(engagementId, user);
    const docs = await this.documents(q.entityType, user.companyId, e.periodStart, e.periodEnd, q.q);
    const marks = await this.prisma.auditCheckmark.findMany({ where: { engagementId, companyId: user.companyId, entityType: q.entityType } });
    const byId = new Map(marks.map((m) => [m.entityId, m]));
    // O2: ¿cambió el documento después de la marca? (registro posterior en la bitácora)
    const changed = new Set<string>();
    if (marks.length) {
      const logs = await this.prisma.auditLog.findMany({
        where: { companyId: user.companyId, entityName: LOG_ENTITY[q.entityType], entityId: { in: marks.map((m) => m.entityId) } },
        select: { entityId: true, createdAt: true },
      });
      for (const l of logs) { const m = byId.get(l.entityId); if (m && l.createdAt > m.updatedAt) changed.add(l.entityId); }
    }
    let rows = docs.map((d) => {
      const m = byId.get(d.id);
      return { ...d, mark: m ? { id: m.id, mark: m.mark, note: m.note, workpaperId: m.workpaperId, at: m.updatedAt } : null, changedAfterReview: changed.has(d.id) };
    });
    if (q.filter === 'reviewed') rows = rows.filter((r) => r.mark);
    if (q.filter === 'pending') rows = rows.filter((r) => !r.mark);
    const page = q.page ?? 1, limit = q.limit ?? 50;
    return { data: rows.slice((page - 1) * limit, page * limit), total: rows.length, page, limit, reviewed: marks.length };
  }

  async setMark(engagementId: string, dto: MarkDto, user: AuthUser) {
    const e = await this.engagement(engagementId, user);
    this.assertOpen(e);
    // Existe, es de la empresa (404 si no) y está en el período (422)
    const all = await this.documents(dto.entityType, user.companyId, new Date('1900-01-01'), new Date('2999-12-31'));
    const doc = all.find((d) => d.id === dto.entityId);
    if (!doc) throw new NotFoundException('Documento no encontrado');
    if (doc.date < e.periodStart || doc.date.getTime() > e.periodEnd.getTime() + 86_399_999) throw new UnprocessableEntityException('El documento está fuera del período del encargo');
    if (dto.workpaperId) {
      const w = await this.prisma.auditWorkpaper.findFirst({ where: { id: dto.workpaperId, engagementId, companyId: user.companyId } });
      if (!w) throw new NotFoundException('Papel de trabajo no encontrado');
    }
    return this.prisma.$transaction(async (tx) => {
      const m = await tx.auditCheckmark.upsert({
        where: { engagementId_entityType_entityId: { engagementId, entityType: dto.entityType, entityId: dto.entityId } },
        create: { companyId: user.companyId, engagementId, entityType: dto.entityType, entityId: dto.entityId, mark: dto.mark, note: dto.note, workpaperId: dto.workpaperId, createdById: user.id },
        update: { mark: dto.mark, note: dto.note, workpaperId: dto.workpaperId },
      });
      await writeAudit(tx, user, 'AuditCheckmark', m.id, AuditAction.UPDATE, { entityType: dto.entityType, entityId: dto.entityId, mark: dto.mark });
      return m;
    });
  }

  async deleteMark(id: string, user: AuthUser) {
    const m = await this.prisma.auditCheckmark.findFirst({ where: { id, companyId: user.companyId }, include: { engagement: true } });
    if (!m) throw new NotFoundException('Marca no encontrada');
    this.assertOpen(m.engagement);
    await this.prisma.$transaction(async (tx) => {
      await tx.auditCheckmark.deleteMany({ where: { id, companyId: user.companyId } });
      await writeAudit(tx, user, 'AuditCheckmark', id, AuditAction.DELETE, { entityType: m.entityType, entityId: m.entityId });
    });
    return { ok: true };
  }

  /** O1: historial de UN documento (quién lo creó, emitió, aprobó, anuló…) desde la bitácora. */
  async history(entityType: AuditEntityType, entityId: string, user: AuthUser) {
    const logs = await this.prisma.auditLog.findMany({
      where: { companyId: user.companyId, entityName: LOG_ENTITY[entityType], entityId }, orderBy: { createdAt: 'asc' },
      select: { id: true, action: true, changes: true, createdAt: true, user: { select: { name: true } } },
    });
    return logs.map((l) => ({ id: l.id, action: l.action, at: l.createdAt, by: l.user.name, changes: l.changes }));
  }

  // ------------------------------------------------------------------ archivos

  /** El ADMIN solo ve archivos de hallazgos comunicados; nunca los de papeles de trabajo (D3). */
  private visibleFilter(user: AuthUser): Prisma.AuditFileWhereInput {
    return user.role === UserRole.AUDITOR ? {} : { finding: { status: { not: FindingStatus.DRAFT } } };
  }

  async listFiles(q: FilesQuery, user: AuthUser) {
    if (!!q.workpaperId === !!q.findingId) throw new BadRequestException('Indica workpaperId o findingId (uno solo)');
    return this.prisma.auditFile.findMany({
      where: { companyId: user.companyId, ...(q.workpaperId ? { workpaperId: q.workpaperId } : { findingId: q.findingId }), ...this.visibleFilter(user) },
      orderBy: { uploadedAt: 'desc' }, select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true, workpaperId: true, findingId: true },
    });
  }

  async upload(file: UploadedFileLike | undefined, dto: UploadAuditFileDto, user: AuthUser) {
    if (!file?.buffer?.length) throw new BadRequestException('Falta el archivo (campo multipart "file")');
    if (!!dto.workpaperId === !!dto.findingId) throw new BadRequestException('Indica workpaperId o findingId (uno solo)');
    const parent = dto.workpaperId
      ? await this.prisma.auditWorkpaper.findFirst({ where: { id: dto.workpaperId, companyId: user.companyId }, include: { engagement: true } })
      : await this.prisma.auditFinding.findFirst({ where: { id: dto.findingId, companyId: user.companyId }, include: { engagement: true } });
    if (!parent) throw new NotFoundException('Papel de trabajo o hallazgo no encontrado');
    this.assertOpen(parent.engagement);
    const n = await this.prisma.auditFile.count({ where: { companyId: user.companyId, ...(dto.workpaperId ? { workpaperId: dto.workpaperId } : { findingId: dto.findingId }) } });
    if (n >= MAX_FILES) throw new UnprocessableEntityException(`Máximo ${MAX_FILES} archivos por papel o hallazgo`);
    const fileName = sanitizeFileName(file.originalname ?? '');
    const detected = detectFile(file.buffer, fileName);
    const key = `${user.companyId}/auditing/${randomUUID()}`;
    await this.storage.save(key, file.buffer);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.auditFile.create({
          data: {
            companyId: user.companyId, engagementId: parent.engagementId, workpaperId: dto.workpaperId ?? null, findingId: dto.findingId ?? null,
            fileName, fileUrl: key, mimeType: detected.mimeType, sizeBytes: file.buffer.length, uploadedById: user.id,
          },
          select: { id: true, fileName: true, mimeType: true, sizeBytes: true, uploadedAt: true, workpaperId: true, findingId: true },
        });
        await writeAudit(tx, user, 'AuditFile', row.id, AuditAction.CREATE, { fileName, sizeBytes: row.sizeBytes });
        return row;
      });
    } catch (e) {
      await this.storage.remove(key).catch(() => undefined);
      if (isUniqueViolation(e)) throw new UnprocessableEntityException('No se pudo guardar el archivo');
      throw e;
    }
  }

  async download(id: string, user: AuthUser) {
    const row = await this.prisma.auditFile.findFirst({ where: { id, companyId: user.companyId, ...this.visibleFilter(user) } });
    if (!row) throw new NotFoundException('Archivo no encontrado');
    if (!new RegExp(`^${user.companyId}/auditing/${UUID}$`).test(row.fileUrl)) {
      this.log.warn(`Clave de archivo de auditoría con forma inesperada (${row.id})`);
      throw new NotFoundException('El archivo ya no está disponible en el almacenamiento');
    }
    try { return { data: await this.storage.read(row.fileUrl), fileName: row.fileName, mimeType: row.mimeType }; }
    catch { throw new NotFoundException('El archivo ya no está disponible en el almacenamiento'); }
  }

  async deleteFile(id: string, user: AuthUser) {
    const row = await this.prisma.auditFile.findFirst({ where: { id, companyId: user.companyId }, include: { engagement: true } });
    if (!row) throw new NotFoundException('Archivo no encontrado');
    this.assertOpen(row.engagement);
    await this.prisma.$transaction(async (tx) => {
      await tx.auditFile.deleteMany({ where: { id, companyId: user.companyId } });
      await writeAudit(tx, user, 'AuditFile', id, AuditAction.DELETE, { fileName: row.fileName });
    });
    await this.storage.remove(row.fileUrl).catch(() => undefined);
    return { ok: true };
  }
}
