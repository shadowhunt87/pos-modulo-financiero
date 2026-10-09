import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction, JournalType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../../common/audit.js';
import { CreateJournalDto, UpdateJournalDto } from '../dto/journal.dto.js';

const DEFAULT_JOURNALS: { code: string; name: string; type: JournalType }[] = [
  { code: 'DG', name: 'Diario General', type: JournalType.GENERAL },
  { code: 'VEN', name: 'Diario de Ventas', type: JournalType.SALES },
  { code: 'COM', name: 'Diario de Compras', type: JournalType.PURCHASES },
  { code: 'BCO', name: 'Diario de Bancos', type: JournalType.BANK },
  { code: 'CAJ', name: 'Diario de Caja', type: JournalType.CASH },
  { code: 'AJ', name: 'Ajustes', type: JournalType.ADJUSTMENT },
  { code: 'AP', name: 'Apertura', type: JournalType.OPENING },
  { code: 'CI', name: 'Cierre', type: JournalType.CLOSING },
];

@Injectable()
export class JournalsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Número correlativo del asiento ("DG-000123"), atómico dentro de la transacción. */
  async nextEntryNumber(tx: Prisma.TransactionClient, companyId: string, journalId: string) {
    const claimed = await tx.journal.updateMany({
      where: { id: journalId, companyId },
      data: { nextNumber: { increment: 1 } },
    });
    if (claimed.count === 0) throw new NotFoundException('Diario no encontrado');
    const j = await tx.journal.findUniqueOrThrow({ where: { id: journalId } });
    return `${j.code}-${String(j.nextNumber - 1).padStart(6, '0')}`;
  }

  async findByType(tx: Prisma.TransactionClient, companyId: string, type: JournalType) {
    const j = await tx.journal.findFirst({ where: { companyId, type, active: true }, orderBy: { code: 'asc' } });
    if (!j) throw new NotFoundException(`No hay diario ${type}; crea los diarios por defecto (POST /journals/defaults)`);
    return j;
  }

  async create(dto: CreateJournalDto, user: AuthUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const j = await tx.journal.create({ data: { ...dto, companyId: user.companyId } });
        await writeAudit(tx, user, 'Journal', j.id, AuditAction.CREATE, { code: j.code, type: j.type });
        return j;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Ya existe un diario con el código ${dto.code}`);
      throw e;
    }
  }

  /** Crea los diarios estándar que falten (idempotente). */
  async createDefaults(user: AuthUser) {
    const created = await this.prisma.journal.createMany({
      data: DEFAULT_JOURNALS.map((j) => ({ ...j, companyId: user.companyId })),
      skipDuplicates: true,
    });
    return { created: created.count, journals: await this.list(user) };
  }

  list(user: AuthUser) {
    return this.prisma.journal.findMany({ where: { companyId: user.companyId }, orderBy: { code: 'asc' } });
  }

  async update(id: string, dto: UpdateJournalDto, user: AuthUser) {
    const j = await this.prisma.journal.findFirst({ where: { id, companyId: user.companyId } });
    if (!j) throw new NotFoundException('Diario no encontrado');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.journal.update({ where: { id }, data: dto });
      await writeAudit(tx, user, 'Journal', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)));
      return updated;
    });
  }
}
