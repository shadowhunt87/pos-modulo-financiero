import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit } from '../../common/audit.js';
import { UpdateDocumentSequenceDto } from '../dto/document-sequence.dto.js';

export const DOC_TYPES = {
  INVOICE_SALE: 'FV',
  INVOICE_PURCHASE: 'FC',
  CREDIT_NOTE: 'NC',
  DEBIT_NOTE: 'ND',
  PAYMENT_RECEIVED: 'RC',
  PAYMENT_MADE: 'PG',
  INVENTORY_ADJUSTMENT: 'AJ',
} as const;
export type DocType = keyof typeof DOC_TYPES;

@Injectable()
export class DocumentSequencesService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Siguiente número correlativo, atómico y dentro de la transacción del
   * documento (si esta falla, el contador se revierte). Ej: "FV-000001".
   */
  async next(tx: Prisma.TransactionClient, companyId: string, docType: DocType) {
    await tx.documentSequence.upsert({
      where: { companyId_docType: { companyId, docType } },
      update: {},
      create: { companyId, docType, prefix: DOC_TYPES[docType] + '-', nextNumber: 1 },
    });
    const row = await tx.documentSequence.update({
      where: { companyId_docType: { companyId, docType } },
      data: { nextNumber: { increment: 1 } },
    });
    return row.prefix + String(row.nextNumber - 1).padStart(row.padding, '0');
  }

  async list(user: AuthUser) {
    const rows = await this.prisma.documentSequence.findMany({ where: { companyId: user.companyId }, orderBy: { docType: 'asc' } });
    const have = new Set(rows.map((r) => r.docType));
    // Los tipos aún sin usar se muestran con sus valores por defecto
    const pending = (Object.keys(DOC_TYPES) as DocType[])
      .filter((t) => !have.has(t))
      .map((t) => ({ docType: t, prefix: DOC_TYPES[t] + '-', padding: 6, nextNumber: 1, persisted: false }));
    return [...rows.map((r) => ({ ...r, persisted: true })), ...pending];
  }

  async update(docType: string, dto: UpdateDocumentSequenceDto, user: AuthUser) {
    if (!(docType in DOC_TYPES)) throw new NotFoundException('Tipo de documento desconocido');
    const type = docType as DocType;
    return this.prisma.$transaction(async (tx) => {
      const current = await tx.documentSequence.upsert({
        where: { companyId_docType: { companyId: user.companyId, docType: type } },
        update: {},
        create: { companyId: user.companyId, docType: type, prefix: DOC_TYPES[type] + '-', nextNumber: 1 },
      });
      if (dto.nextNumber !== undefined && dto.nextNumber < current.nextNumber) {
        throw new UnprocessableEntityException('nextNumber solo puede aumentar: no se reutilizan números');
      }
      const row = await tx.documentSequence.update({ where: { id: current.id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'DocumentSequence', row.id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)));
      return row;
    });
  }
}