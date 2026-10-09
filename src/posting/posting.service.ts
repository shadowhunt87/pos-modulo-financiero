import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AuditAction, FiscalPeriodStatus, JournalEntryStatus, JournalEntryType, JournalType, SourceDocumentType,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { writeAudit } from '../common/audit.js';
import { JournalsService } from '../masters/journals/journals.service.js';

type Tx = Prisma.TransactionClient;

export interface PostLine {
  accountId: string;
  debit: Prisma.Decimal; // moneda base
  credit: Prisma.Decimal; // moneda base
  partnerId?: string;
  costCenterId?: string;
  description?: string;
  currency?: string;
  exchangeRate?: Prisma.Decimal;
  amountForeign?: Prisma.Decimal; // firmado: débito +, crédito -
}

export interface PostEntryInput {
  date: Date;
  description: string;
  reference?: string;
  journalType: JournalType;
  type?: JournalEntryType;
  sourceType: SourceDocumentType;
  sourceId?: string;
  currency?: string;
  exchangeRate?: Prisma.Decimal;
  lines: PostLine[];
}

/**
 * Único punto por donde los módulos (facturación, pagos, tesorería, cierre)
 * crean y anulan asientos DENTRO de su propia transacción. Aplica las mismas
 * reglas que el módulo de contabilidad: partida doble, período abierto, cuentas
 * válidas, y además asigna número, diario y período.
 */
@Injectable()
export class PostingService {
  constructor(private readonly journals: JournalsService) {}

  private async periodFor(tx: Tx, companyId: string, date: Date) {
    const period = await tx.fiscalPeriod.findFirst({
      where: { companyId, startDate: { lte: date }, endDate: { gte: date } },
    });
    if (period?.status === FiscalPeriodStatus.CLOSED) {
      throw new UnprocessableEntityException(`El período fiscal "${period.name}" está cerrado`);
    }
    return period;
  }

  assertPeriodOpen(tx: Tx, companyId: string, date: Date) {
    return this.periodFor(tx, companyId, date);
  }

  async post(tx: Tx, user: AuthUser, input: PostEntryInput) {
    const lines = input.lines.filter((l) => l.debit.gt(0) || l.credit.gt(0));
    if (lines.length < 2) throw new UnprocessableEntityException('El asiento necesita al menos dos líneas');
    for (const [i, l] of lines.entries()) {
      if (l.debit.gt(0) === l.credit.gt(0)) {
        throw new BadRequestException(`Línea ${i + 1}: debe tener débito o crédito (uno solo)`);
      }
    }
    const totalDebit = lines.reduce((s, l) => s.plus(l.debit), new Prisma.Decimal(0));
    const totalCredit = lines.reduce((s, l) => s.plus(l.credit), new Prisma.Decimal(0));
    if (!totalDebit.equals(totalCredit)) {
      throw new UnprocessableEntityException(
        `El asiento no cuadra: débitos ${totalDebit.toFixed(4)} ≠ créditos ${totalCredit.toFixed(4)}`,
      );
    }

    const period = await this.periodFor(tx, user.companyId, input.date);

    const accountIds = [...new Set(lines.map((l) => l.accountId))];
    const accounts = await tx.account.findMany({ where: { companyId: user.companyId, id: { in: accountIds } } });
    if (accounts.length !== accountIds.length) {
      const found = new Set(accounts.map((a) => a.id));
      throw new BadRequestException(`Cuentas no encontradas: ${accountIds.filter((id) => !found.has(id)).join(', ')}`);
    }
    const bad = accounts.filter((a) => !a.active || !a.isPostable);
    if (bad.length) {
      throw new UnprocessableEntityException(`Cuentas inactivas o que no admiten movimientos: ${bad.map((a) => a.code).join(', ')}`);
    }
    const parents = await tx.account.findMany({
      where: { companyId: user.companyId, parentId: { in: accountIds } },
      select: { parentId: true },
      distinct: ['parentId'],
    });
    if (parents.length) {
      const ids = new Set(parents.map((p) => p.parentId));
      throw new UnprocessableEntityException(
        `No se puede postear en cuentas con subcuentas: ${accounts.filter((a) => ids.has(a.id)).map((a) => a.code).join(', ')}`,
      );
    }

    const journal = await this.journals.findByType(tx, user.companyId, input.journalType);
    const number = await this.journals.nextEntryNumber(tx, user.companyId, journal.id);

    const entry = await tx.journalEntry.create({
      data: {
        companyId: user.companyId,
        number,
        journalId: journal.id,
        fiscalPeriodId: period?.id,
        type: input.type ?? JournalEntryType.STANDARD,
        date: input.date,
        description: input.description,
        reference: input.reference,
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        currency: input.currency ?? 'DOP',
        exchangeRate: input.exchangeRate ?? new Prisma.Decimal(1),
        status: JournalEntryStatus.POSTED,
        postedAt: new Date(),
        createdById: user.id,
        lines: { create: lines },
      },
      include: { lines: true },
    });
    await writeAudit(tx, user, 'JournalEntry', entry.id, AuditAction.POST, {
      number, source: input.sourceType, sourceId: input.sourceId ?? null, total: totalDebit.toString(),
    });
    return entry;
  }

  /** Anula un asiento (mismas reglas que /accounting/journal-entries/:id/void). */
  async voidEntry(tx: Tx, user: AuthUser, entryId: string, reason: string) {
    const entry = await tx.journalEntry.findFirst({ where: { id: entryId, companyId: user.companyId } });
    if (!entry) throw new NotFoundException('Asiento no encontrado');
    if (entry.reconciled) throw new UnprocessableEntityException('No se puede anular un asiento conciliado');
    await this.periodFor(tx, user.companyId, entry.date);

    const res = await tx.journalEntry.updateMany({
      where: { id: entryId, companyId: user.companyId, status: { not: JournalEntryStatus.VOIDED } },
      data: { status: JournalEntryStatus.VOIDED, voidedAt: new Date(), voidedById: user.id, voidReason: reason },
    });
    if (res.count === 0) throw new ConflictException('El asiento ya está anulado');
    await writeAudit(tx, user, 'JournalEntry', entryId, AuditAction.VOID, { reason });
  }
}