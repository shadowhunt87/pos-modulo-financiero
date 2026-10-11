import {
  BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { AuthUser } from '../auth/types/auth-user.js';
import { writeAudit } from '../common/audit.js';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction, FiscalPeriodStatus, ReconciliationStatus, UserRole } from '../generated/prisma/enums.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AttachmentParentDto } from './dto/attachments.dto.js';
import { detectFile, sanitizeFileName, type UploadedFileLike } from './file-type.js';
import { FILE_STORAGE, type FileStorage } from './file-storage.js';

export const MAX_ATTACHMENTS_PER_PARENT = 50;
const PARENT_FIELDS = ['invoiceId', 'paymentId', 'journalEntryId', 'reconciliationId'] as const;
type ParentField = (typeof PARENT_FIELDS)[number];
type Db = PrismaService | Prisma.TransactionClient;

const PUBLIC_SELECT = {
  id: true, invoiceId: true, paymentId: true, journalEntryId: true, reconciliationId: true,
  fileName: true, mimeType: true, sizeBytes: true, uploadedById: true, uploadedAt: true,
} satisfies Prisma.AttachmentSelect;

@Injectable()
export class AttachmentsService {
  private readonly log = new Logger(AttachmentsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  /** Exactamente un padre, y que sea de la empresa del usuario (404 si no existe o es de otra). */
  private async resolveParent(db: Db, companyId: string, p: AttachmentParentDto) {
    const given = PARENT_FIELDS.filter((f) => p[f] !== undefined);
    if (given.length !== 1) {
      throw new BadRequestException('Indica exactamente uno: invoiceId, paymentId, journalEntryId o reconciliationId');
    }
    const field: ParentField = given[0];
    const id = p[field]!;
    let date: Date | null = null;
    let locked: string | null = null;
    if (field === 'invoiceId') {
      const r = await db.invoice.findFirst({ where: { id, companyId }, select: { issueDate: true } });
      if (!r) throw new NotFoundException('Factura no encontrada');
      date = r.issueDate;
    } else if (field === 'paymentId') {
      const r = await db.payment.findFirst({ where: { id, companyId }, select: { date: true } });
      if (!r) throw new NotFoundException('Pago no encontrado');
      date = r.date;
    } else if (field === 'journalEntryId') {
      const r = await db.journalEntry.findFirst({ where: { id, companyId }, select: { date: true } });
      if (!r) throw new NotFoundException('Asiento no encontrado');
      date = r.date;
    } else {
      const r = await db.bankReconciliation.findFirst({ where: { id, companyId }, select: { status: true } });
      if (!r) throw new NotFoundException('Conciliación no encontrada');
      if (r.status === ReconciliationStatus.COMPLETED) locked = 'La conciliación está completada';
    }
    return { field, id, date, locked };
  }

  /** Quitar un soporte de un documento ya cerrado alteraría la evidencia: se bloquea. */
  private async assertNotLocked(db: Db, companyId: string, parent: { date: Date | null; locked: string | null }) {
    if (parent.locked) throw new UnprocessableEntityException(parent.locked);
    if (!parent.date) return;
    const period = await db.fiscalPeriod.findFirst({
      where: { companyId, status: FiscalPeriodStatus.CLOSED, startDate: { lte: parent.date }, endDate: { gte: parent.date } },
      select: { name: true },
    });
    if (period) throw new UnprocessableEntityException(`El período fiscal "${period.name}" está cerrado`);
    const year = await db.fiscalYear.findFirst({
      where: { companyId, status: FiscalPeriodStatus.CLOSED, startDate: { lte: parent.date }, endDate: { gte: parent.date } },
      select: { name: true },
    });
    if (year) throw new UnprocessableEntityException(`El año fiscal "${year.name}" está cerrado`);
  }

  async upload(file: UploadedFileLike | undefined, dto: AttachmentParentDto, user: AuthUser) {
    if (!file) throw new BadRequestException('Falta el archivo (campo multipart "file")');
    if (!file.size || !file.buffer?.length) throw new BadRequestException('El archivo está vacío');
    const fileName = sanitizeFileName(file.originalname ?? '');
    const detected = detectFile(file.buffer, fileName);
    const parent = await this.resolveParent(this.prisma, user.companyId, dto);

    const existing = await this.prisma.attachment.count({ where: { companyId: user.companyId, [parent.field]: parent.id } });
    if (existing >= MAX_ATTACHMENTS_PER_PARENT) {
      throw new UnprocessableEntityException(`Máximo ${MAX_ATTACHMENTS_PER_PARENT} adjuntos por documento`);
    }

    const key = `${user.companyId}/${randomUUID()}`;
    await this.storage.save(key, file.buffer);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const row = await tx.attachment.create({
          data: {
            companyId: user.companyId, [parent.field]: parent.id, fileName, fileUrl: key,
            mimeType: detected.mimeType, sizeBytes: file.buffer.length, uploadedById: user.id,
          },
          select: PUBLIC_SELECT,
        });
        await writeAudit(tx, user, 'Attachment', row.id, AuditAction.CREATE, {
          fileName, mimeType: detected.mimeType, sizeBytes: file.buffer.length, [parent.field]: parent.id,
        });
        return row;
      });
    } catch (e) {
      // Sin fila no debe quedar archivo huérfano
      await this.storage.remove(key).catch((err) => this.log.error(`No se pudo limpiar ${key}: ${err}`));
      throw e;
    }
  }

  async list(q: AttachmentParentDto, user: AuthUser) {
    const parent = await this.resolveParent(this.prisma, user.companyId, q);
    return this.prisma.attachment.findMany({
      where: { companyId: user.companyId, [parent.field]: parent.id },
      select: PUBLIC_SELECT,
      orderBy: { uploadedAt: 'asc' },
    });
  }

  async get(id: string, user: AuthUser) {
    const row = await this.prisma.attachment.findFirst({ where: { id, companyId: user.companyId }, select: PUBLIC_SELECT });
    if (!row) throw new NotFoundException('Adjunto no encontrado');
    return row;
  }

  async download(id: string, user: AuthUser) {
    const row = await this.prisma.attachment.findFirst({ where: { id, companyId: user.companyId } });
    if (!row) throw new NotFoundException('Adjunto no encontrado');
    let data: Buffer;
    try {
      data = await this.storage.read(row.fileUrl);
    } catch {
      throw new NotFoundException('El archivo ya no está disponible en el almacenamiento');
    }
    return { data, fileName: row.fileName, mimeType: row.mimeType };
  }

  async remove(id: string, user: AuthUser) {
    const key = await this.prisma.$transaction(async (tx) => {
      const row = await tx.attachment.findFirst({ where: { id, companyId: user.companyId } });
      if (!row) throw new NotFoundException('Adjunto no encontrado');
      if (user.role !== UserRole.ADMIN && row.uploadedById !== user.id) {
        throw new ForbiddenException('Solo un administrador o quien lo subió puede eliminarlo');
      }
      const field = PARENT_FIELDS.find((f) => row[f] !== null);
      if (field) {
        const parent = await this.resolveParent(tx, user.companyId, { [field]: row[field]! });
        await this.assertNotLocked(tx, user.companyId, parent);
      }
      // Condicional: si dos borrados llegan juntos, solo uno gana
      const gone = await tx.attachment.deleteMany({ where: { id, companyId: user.companyId } });
      if (gone.count !== 1) throw new NotFoundException('Adjunto no encontrado');
      await writeAudit(tx, user, 'Attachment', id, AuditAction.DELETE, { fileName: row.fileName });
      return row.fileUrl;
    });
    // El archivo se borra DESPUÉS de confirmar: si esto falla queda un archivo huérfano, nunca una fila sin archivo
    await this.storage.remove(key).catch((err) => this.log.error(`No se pudo borrar ${key}: ${err}`));
    return { deleted: true };
  }
}
