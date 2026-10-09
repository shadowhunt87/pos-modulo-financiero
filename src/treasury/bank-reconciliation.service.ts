import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction, BankTransactionStatus, JournalEntryStatus, ReconciliationStatus } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit, isUniqueViolation } from '../common/audit.js';
import { endOfDay } from '../reports/accounting-nature.utils.js';
import { CreateReconciliationDto, ListReconciliationsQuery, MatchTransactionDto } from './dto/reconciliation.dto.js';

type Dec = Prisma.Decimal;
const D = (v?: Dec | number | string | null): Dec => new Prisma.Decimal(v ?? 0);
const ZERO = D(0);
const DAY = 86_400_000;

/**
 * Modelo de conciliación:
 *  - Un movimiento del banco se enlaza con una o varias líneas del mayor de la cuenta
 *    contable del banco (1 depósito = 3 cobros). Cada línea se usa completa, una sola vez.
 *  - Saldo del extracto esperado = saldo en libros − partidas en libros que el banco aún no
 *    ve (depósitos en tránsito, cheques pendientes) + movimientos del banco aún no registrados.
 *  - Se concilia cuando la diferencia es 0 y no quedan movimientos pendientes.
 */
@Injectable()
export class BankReconciliationService {
  constructor(private readonly prisma: PrismaService) {}

  private async account(id: string, user: AuthUser) {
    const acc = await this.prisma.bankAccount.findFirst({ where: { id, companyId: user.companyId } });
    if (!acc) throw new NotFoundException('Cuenta bancaria no encontrada');
    if (!acc.glAccountId) throw new UnprocessableEntityException('La cuenta bancaria no tiene cuenta contable asociada');
    const base = (await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId } })).baseCurrency;
    if (acc.currency !== base) throw new UnprocessableEntityException('La conciliación de cuentas en moneda extranjera aún no está disponible');
    return { ...acc, glAccountId: acc.glAccountId };
  }

  // ------------------------------------------------------------------
  // Enlazar movimientos con asientos
  // ------------------------------------------------------------------
  async match(txId: string, dto: MatchTransactionDto, user: AuthUser) {
    return this.prisma.$transaction(async (db) => {
      const { companyId } = user;
      const bt = await db.bankTransaction.findFirst({ where: { id: txId, bankAccount: { companyId } }, include: { bankAccount: true } });
      if (!bt) throw new NotFoundException('Movimiento no encontrado');
      if (bt.status !== BankTransactionStatus.PENDING) throw new UnprocessableEntityException(`El movimiento está ${bt.status}`);
      const gl = bt.bankAccount.glAccountId;
      if (!gl) throw new UnprocessableEntityException('La cuenta bancaria no tiene cuenta contable asociada');

      const ids = [...new Set(dto.journalEntryLineIds)];
      const lines = await db.journalEntryLine.findMany({
        where: { id: { in: ids }, accountId: gl, journalEntry: { companyId, status: JournalEntryStatus.POSTED } },
        include: { bankMatches: true },
      });
      if (lines.length !== ids.length) throw new UnprocessableEntityException('Alguna línea no existe, no es de la cuenta contable del banco o su asiento no está vigente');
      if (lines.some((l) => l.bankMatches.length)) throw new UnprocessableEntityException('Alguna línea ya está conciliada con otro movimiento');

      const nets = lines.map((l) => l.debit.minus(l.credit));
      if (nets.some((n) => n.gt(0) !== bt.amount.gt(0))) throw new UnprocessableEntityException('Las líneas deben ser del mismo sentido que el movimiento (entrada/salida)');
      const sum = nets.reduce((s, n) => s.plus(n), ZERO);
      if (!sum.equals(bt.amount)) throw new UnprocessableEntityException(`Las líneas suman ${sum} y el movimiento es ${bt.amount}`);

      const claimed = await db.bankTransaction.updateMany({ where: { id: txId, status: BankTransactionStatus.PENDING }, data: { status: BankTransactionStatus.MATCHED } });
      if (claimed.count === 0) throw new ConflictException('El movimiento cambió de estado; reintenta');
      await db.bankMatch.createMany({ data: lines.map((l, i) => ({ bankTransactionId: txId, journalEntryLineId: l.id, amount: nets[i] })) });
      await writeAudit(db, user, 'BankTransaction', txId, AuditAction.UPDATE, { matchedLines: ids.length });
      return db.bankTransaction.findUniqueOrThrow({ where: { id: txId }, include: { matches: true } });
    });
  }

  async unmatch(txId: string, user: AuthUser) {
    return this.prisma.$transaction(async (db) => {
      const claimed = await db.bankTransaction.updateMany({
        where: { id: txId, bankAccount: { companyId: user.companyId }, status: BankTransactionStatus.MATCHED },
        data: { status: BankTransactionStatus.PENDING },
      });
      if (claimed.count === 0) throw new UnprocessableEntityException('Solo se deshacen movimientos enlazados y aún no conciliados');
      await db.bankMatch.deleteMany({ where: { bankTransactionId: txId } });
      await writeAudit(db, user, 'BankTransaction', txId, AuditAction.UPDATE, { unmatched: true });
      return db.bankTransaction.findUniqueOrThrow({ where: { id: txId } });
    });
  }

  // ------------------------------------------------------------------
  // Sugerencias y enlace automático (monto exacto + cercanía de fecha)
  // ------------------------------------------------------------------
  private async computeSuggestions(bankAccountId: string, days: number, user: AuthUser) {
    const acc = await this.account(bankAccountId, user);
    const pending = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId, status: BankTransactionStatus.PENDING }, orderBy: { date: 'asc' }, take: 300,
    });
    if (!pending.length) return [];
    const from = new Date(pending[0].date.getTime() - days * DAY);
    const to = new Date(pending[pending.length - 1].date.getTime() + days * DAY);
    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        accountId: acc.glAccountId, bankMatches: { none: {} },
        journalEntry: { companyId: user.companyId, status: JournalEntryStatus.POSTED, date: { gte: from, lte: to } },
      },
      include: { journalEntry: { select: { id: true, number: true, date: true, description: true, reference: true } } },
    });
    const has = (a?: string | null, b?: string | null) => !!a && !!b && a.toLowerCase().includes(b.toLowerCase());

    return pending.map((bt) => {
      const candidates = lines
        .filter((l) => l.debit.minus(l.credit).equals(bt.amount) && Math.abs(l.journalEntry.date.getTime() - bt.date.getTime()) <= days * DAY)
        .map((l) => {
          const dayDiff = Math.round(Math.abs(l.journalEntry.date.getTime() - bt.date.getTime()) / DAY);
          let score = 100 - dayDiff * 5;
          if (has(bt.description, l.journalEntry.reference) || has(l.journalEntry.reference, bt.reference)) score += 25;
          return {
            journalEntryLineId: l.id, entryId: l.journalEntry.id, entryNumber: l.journalEntry.number, date: l.journalEntry.date,
            description: l.description ?? l.journalEntry.description, reference: l.journalEntry.reference, amount: l.debit.minus(l.credit), score,
          };
        })
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);
      return { transaction: { id: bt.id, date: bt.date, description: bt.description, reference: bt.reference, amount: bt.amount }, candidates };
    });
  }

  suggestions(bankAccountId: string, days: number | undefined, user: AuthUser) {
    return this.computeSuggestions(bankAccountId, days ?? 5, user);
  }

  /** Enlaza solo los pares sin ambigüedad: un único candidato y que nadie más lo reclame. */
  async autoMatch(bankAccountId: string, days: number | undefined, user: AuthUser) {
    const sugg = await this.computeSuggestions(bankAccountId, days ?? 5, user);
    const claims = new Map<string, number>();
    for (const s of sugg) for (const c of s.candidates) claims.set(c.journalEntryLineId, (claims.get(c.journalEntryLineId) ?? 0) + 1);
    let matched = 0, ambiguous = 0, unmatched = 0;
    for (const s of sugg) {
      if (s.candidates.length === 0) { unmatched++; continue; }
      const only = s.candidates[0];
      if (s.candidates.length > 1 || claims.get(only.journalEntryLineId)! > 1) { ambiguous++; continue; }
      try {
        await this.match(s.transaction.id, { journalEntryLineIds: [only.journalEntryLineId] }, user);
        matched++;
      } catch { ambiguous++; }
    }
    return { matched, ambiguous, unmatched };
  }

  // ------------------------------------------------------------------
  // Conciliación por fecha de corte
  // ------------------------------------------------------------------
  private async summary(bankAccountId: string, glAccountId: string, companyId: string, statementDate: Date, statementBalance: Dec) {
    const end = endOfDay(statementDate.toISOString());
    const entryFilter = { companyId, status: JournalEntryStatus.POSTED, date: { lte: end } };

    const book = await this.prisma.journalEntryLine.aggregate({
      where: { accountId: glAccountId, journalEntry: entryFilter }, _sum: { debit: true, credit: true },
    });
    const bookBalance = D(book._sum.debit).minus(D(book._sum.credit));

    // Partidas en libros que el banco todavía no refleja a la fecha de corte
    const open = await this.prisma.journalEntryLine.findMany({
      where: {
        accountId: glAccountId, journalEntry: entryFilter,
        OR: [{ bankMatches: { none: {} } }, { bankMatches: { some: { bankTransaction: { date: { gt: end } } } } }],
      },
      include: { journalEntry: { select: { id: true, number: true, date: true, description: true, reference: true } } },
      orderBy: { journalEntry: { date: 'asc' } },
    });
    const item = (l: (typeof open)[number]) => ({
      journalEntryLineId: l.id, entryId: l.journalEntry.id, entryNumber: l.journalEntry.number, date: l.journalEntry.date,
      description: l.description ?? l.journalEntry.description, reference: l.journalEntry.reference, amount: l.debit.minus(l.credit),
    });
    const depositsInTransit = open.filter((l) => l.debit.gt(l.credit)).map(item);
    const outstandingPayments = open.filter((l) => !l.debit.gt(l.credit)).map(item);
    const outstandingNet = open.reduce((s, l) => s.plus(l.debit).minus(l.credit), ZERO);

    // Movimientos del banco que aún no están en libros
    const unmatched = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId, date: { lte: end }, status: BankTransactionStatus.PENDING }, orderBy: { date: 'asc' },
    });
    const unmatchedSum = unmatched.reduce((s, t) => s.plus(t.amount), ZERO);

    // Enlaces a asientos que se anularon después
    const voidedLinks = await this.prisma.bankMatch.count({
      where: {
        bankTransaction: { bankAccountId, date: { lte: end }, status: BankTransactionStatus.MATCHED },
        journalEntryLine: { journalEntry: { status: { not: JournalEntryStatus.POSTED } } },
      },
    });

    const expectedStatementBalance = bookBalance.minus(outstandingNet).plus(unmatchedSum);
    const difference = statementBalance.minus(expectedStatementBalance);
    const blockers: string[] = [];
    if (!difference.isZero()) blockers.push(`Diferencia de ${difference.toFixed(2)} entre el extracto y los libros`);
    if (unmatched.length) blockers.push(`${unmatched.length} movimiento(s) del banco sin enlazar o categorizar`);
    if (voidedLinks) blockers.push(`${voidedLinks} movimiento(s) enlazados a asientos anulados: deshaz el enlace`);

    return {
      statementDate, statementBalance, bookBalance, depositsInTransit, outstandingPayments, outstandingNet,
      unmatchedTransactions: unmatched, unmatchedSum, expectedStatementBalance, difference,
      canComplete: blockers.length === 0, blockers,
    };
  }

  async create(dto: CreateReconciliationDto, user: AuthUser) {
    const acc = await this.account(dto.bankAccountId, user);
    const statementDate = new Date(dto.statementDate);
    const last = await this.prisma.bankReconciliation.findFirst({
      where: { bankAccountId: acc.id, status: ReconciliationStatus.COMPLETED }, orderBy: { statementDate: 'desc' },
    });
    if (last && statementDate <= last.statementDate) {
      throw new UnprocessableEntityException(`La fecha debe ser posterior a la última conciliación (${last.statementDate.toISOString().slice(0, 10)})`);
    }
    const s = await this.summary(acc.id, acc.glAccountId, user.companyId, statementDate, D(dto.statementBalance));
    try {
      return await this.prisma.$transaction(async (tx) => {
        const rec = await tx.bankReconciliation.create({
          data: {
            companyId: user.companyId, bankAccountId: acc.id, statementDate, statementBalance: dto.statementBalance,
            bookBalance: s.bookBalance, difference: s.difference, notes: dto.notes,
          },
        });
        await writeAudit(tx, user, 'BankReconciliation', rec.id, AuditAction.CREATE, { statementDate: dto.statementDate });
        return { ...rec, summary: s };
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya existe una conciliación de esa cuenta para esa fecha');
      throw e;
    }
  }

  list(q: ListReconciliationsQuery, user: AuthUser) {
    return this.prisma.bankReconciliation.findMany({
      where: { companyId: user.companyId, bankAccountId: q.bankAccountId, status: q.status },
      include: { bankAccount: { select: { bankName: true, accountNumber: true } } }, orderBy: { statementDate: 'desc' },
    });
  }

  async get(id: string, user: AuthUser) {
    const rec = await this.prisma.bankReconciliation.findFirst({
      where: { id, companyId: user.companyId },
      include: { bankAccount: { select: { id: true, bankName: true, accountNumber: true, glAccountId: true } } },
    });
    if (!rec) throw new NotFoundException('Conciliación no encontrada');
    const summary = await this.summary(rec.bankAccountId, rec.bankAccount.glAccountId!, user.companyId, rec.statementDate, rec.statementBalance);
    return { ...rec, summary };
  }

  async complete(id: string, user: AuthUser) {
    return this.prisma.$transaction(async (db) => {
      const rec = await db.bankReconciliation.findFirst({ where: { id, companyId: user.companyId }, include: { bankAccount: true } });
      if (!rec) throw new NotFoundException('Conciliación no encontrada');
      const claimed = await db.bankReconciliation.updateMany({
        where: { id, status: ReconciliationStatus.DRAFT },
        data: { status: ReconciliationStatus.COMPLETED, completedById: user.id, completedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException('La conciliación ya está completada');

      const s = await this.summary(rec.bankAccountId, rec.bankAccount.glAccountId!, user.companyId, rec.statementDate, rec.statementBalance);
      if (!s.canComplete) throw new UnprocessableEntityException({ message: 'No se puede completar la conciliación', blockers: s.blockers });

      const end = endOfDay(rec.statementDate.toISOString());
      const txs = await db.bankTransaction.findMany({
        where: { bankAccountId: rec.bankAccountId, date: { lte: end }, status: BankTransactionStatus.MATCHED }, select: { id: true },
      });
      const txIds = txs.map((t) => t.id);
      await db.bankTransaction.updateMany({
        where: { id: { in: txIds } }, data: { status: BankTransactionStatus.RECONCILED, reconciled: true, reconciliationId: id },
      });
      const links = await db.bankMatch.findMany({ where: { bankTransactionId: { in: txIds } }, select: { journalEntryLine: { select: { journalEntryId: true } } } });
      const entryIds = [...new Set(links.map((l) => l.journalEntryLine.journalEntryId))];
      // Un asiento conciliado ya no se puede anular
      await db.journalEntry.updateMany({ where: { id: { in: entryIds } }, data: { reconciled: true } });
      await db.bankReconciliation.update({ where: { id }, data: { bookBalance: s.bookBalance, difference: s.difference } });
      await writeAudit(db, user, 'BankReconciliation', id, AuditAction.RECONCILE, { transactions: txIds.length, entries: entryIds.length });
      return { id, status: ReconciliationStatus.COMPLETED, reconciledTransactions: txIds.length, reconciledEntries: entryIds.length };
    });
  }

  /** Solo la última conciliación completada de la cuenta puede reabrirse. */
  async reopen(id: string, user: AuthUser) {
    return this.prisma.$transaction(async (db) => {
      const rec = await db.bankReconciliation.findFirst({ where: { id, companyId: user.companyId } });
      if (!rec) throw new NotFoundException('Conciliación no encontrada');
      if (rec.status !== ReconciliationStatus.COMPLETED) throw new UnprocessableEntityException('La conciliación no está completada');
      const later = await db.bankReconciliation.count({
        where: { bankAccountId: rec.bankAccountId, status: ReconciliationStatus.COMPLETED, statementDate: { gt: rec.statementDate } },
      });
      if (later) throw new UnprocessableEntityException('Hay conciliaciones posteriores: reabre primero la más reciente');

      const txs = await db.bankTransaction.findMany({ where: { reconciliationId: id }, select: { id: true } });
      const txIds = txs.map((t) => t.id);
      const links = await db.bankMatch.findMany({ where: { bankTransactionId: { in: txIds } }, select: { journalEntryLine: { select: { journalEntryId: true } } } });
      const entryIds = [...new Set(links.map((l) => l.journalEntryLine.journalEntryId))];
      await db.bankTransaction.updateMany({ where: { id: { in: txIds } }, data: { status: BankTransactionStatus.MATCHED, reconciled: false, reconciliationId: null } });
      await db.journalEntry.updateMany({ where: { id: { in: entryIds } }, data: { reconciled: false } });
      await db.bankReconciliation.update({ where: { id }, data: { status: ReconciliationStatus.DRAFT, completedById: null, completedAt: null } });
      await writeAudit(db, user, 'BankReconciliation', id, AuditAction.UPDATE, { reopened: true });
      return { id, status: ReconciliationStatus.DRAFT };
    });
  }

  async remove(id: string, user: AuthUser) {
    const res = await this.prisma.bankReconciliation.deleteMany({ where: { id, companyId: user.companyId, status: ReconciliationStatus.DRAFT } });
    if (res.count === 0) throw new UnprocessableEntityException('Solo se eliminan conciliaciones en borrador');
    return { deleted: true };
  }
}