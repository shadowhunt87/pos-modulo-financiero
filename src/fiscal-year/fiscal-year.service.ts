import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AccountType,
  AuditAction,
  FiscalPeriodStatus,
  JournalEntryStatus,
  JournalEntryType,
  JournalType,
  SourceDocumentType,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { PostingService, type PostLine } from '../posting/posting.service.js';
import { ZERO, dec, endOfDay, startOfDay } from '../reports/accounting-nature.utils.js';
import {
  CreateFiscalYearDto,
  OpeningBalanceDto,
  ReopenFiscalYearDto,
} from './dto/fiscal-year.dto.js';

type Tx = Prisma.TransactionClient;
type YearRow = Prisma.FiscalYearGetPayload<object>;

const MONTHS = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

/** Evita el "-0" que produce Decimal.neg() sobre cero. */
const clean = (d: Prisma.Decimal) => (d.isZero() ? ZERO : d);

@Injectable()
export class FiscalYearService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
  ) {}

  // ------------------------------------------------------------------
  // Años fiscales: alta y consulta
  // ------------------------------------------------------------------
  async create(dto: CreateFiscalYearDto, user: AuthUser) {
    const startDate = startOfDay(dto.startDate);
    const endDate = endOfDay(dto.endDate);
    if (startDate >= endDate) {
      throw new BadRequestException('startDate debe ser anterior a endDate');
    }
    const generate = dto.generatePeriods ?? true;

    try {
      return await this.prisma.$transaction(async (tx) => {
        const overlap = await tx.fiscalYear.findFirst({
          where: { companyId: user.companyId, startDate: { lte: endDate }, endDate: { gte: startDate } },
        });
        if (overlap) throw new ConflictException(`Se solapa con el año fiscal "${overlap.name}"`);

        const year = await tx.fiscalYear.create({
          data: { companyId: user.companyId, name: dto.name.trim(), startDate, endDate },
        });

        if (generate) {
          const existing = await tx.fiscalPeriod.findFirst({
            where: { companyId: user.companyId, startDate: { lte: endDate }, endDate: { gte: startDate } },
          });
          if (existing) {
            throw new ConflictException(
              `Ya existe el período "${existing.name}" dentro de ese rango; envía generatePeriods:false para enlazar los existentes`,
            );
          }
          const periods: Prisma.FiscalPeriodCreateManyInput[] = [];
          let cursor = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate()));
          while (cursor <= endDate) {
            const next = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
            const last = new Date(next.getTime() - 1); // 23:59:59.999 del último día del mes
            const pEnd = last > endDate ? endDate : last;
            periods.push({
              companyId: user.companyId,
              fiscalYearId: year.id,
              name: `${MONTHS[cursor.getUTCMonth()]} ${cursor.getUTCFullYear()}`,
              startDate: cursor,
              endDate: pEnd,
            });
            cursor = next;
          }
          await tx.fiscalPeriod.createMany({ data: periods });
        } else {
          await tx.fiscalPeriod.updateMany({
            where: {
              companyId: user.companyId,
              fiscalYearId: null,
              startDate: { gte: startDate },
              endDate: { lte: endDate },
            },
            data: { fiscalYearId: year.id },
          });
        }

        await writeAudit(tx, user, 'FiscalYear', year.id, AuditAction.CREATE, {
          name: year.name,
          generatePeriods: generate,
        });
        return tx.fiscalYear.findUniqueOrThrow({
          where: { id: year.id },
          include: { periods: { orderBy: { startDate: 'asc' } } },
        });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya existe ese año fiscal');
      throw e;
    }
  }

  list(user: AuthUser) {
    return this.prisma.fiscalYear.findMany({
      where: { companyId: user.companyId },
      orderBy: { startDate: 'asc' },
      include: { _count: { select: { periods: true } } },
    });
  }

  async get(id: string, user: AuthUser) {
    const y = await this.prisma.fiscalYear.findFirst({
      where: { id, companyId: user.companyId },
      include: { periods: { orderBy: { startDate: 'asc' } } },
    });
    if (!y) throw new NotFoundException('Año fiscal no encontrado');
    return y;
  }

  // ------------------------------------------------------------------
  // Cierre: se calcula igual para la vista previa y para el cierre real
  // ------------------------------------------------------------------
  private async findYear(tx: Tx, id: string, user: AuthUser) {
    const y = await tx.fiscalYear.findFirst({ where: { id, companyId: user.companyId } });
    if (!y) throw new NotFoundException('Año fiscal no encontrado');
    return y;
  }

  /** Saldos de ingresos y gastos del año y las líneas del asiento que los lleva a cero. */
  private async buildClosing(tx: Tx, year: YearRow, retainedEarningsAccountId: string | null, user: AuthUser) {
    const rows = await tx.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          companyId: user.companyId,
          status: JournalEntryStatus.POSTED,
          date: { gte: year.startDate, lte: year.endDate },
        },
        account: { type: { in: [AccountType.INCOME, AccountType.EXPENSE] } },
      },
      _sum: { debit: true, credit: true },
    });
    const accounts = await tx.account.findMany({
      where: { companyId: user.companyId, id: { in: rows.map((r) => r.accountId) } },
      select: { id: true, code: true, name: true, type: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    const income: { accountId: string; code: string; name: string; balance: Prisma.Decimal }[] = [];
    const expenses: typeof income = [];
    const lines: (PostLine & { code: string; name: string })[] = [];
    let debits = ZERO;
    let credits = ZERO;

    for (const r of rows) {
      const a = byId.get(r.accountId);
      if (!a) continue;
      const net = dec(r._sum.debit).minus(dec(r._sum.credit)); // débito - crédito
      if (net.isZero()) continue;
      const natural = a.type === AccountType.INCOME ? net.neg() : net;
      (a.type === AccountType.INCOME ? income : expenses).push({
        accountId: a.id, code: a.code, name: a.name, balance: natural,
      });
      // Para llevar la cuenta a cero se hace el movimiento contrario a su saldo
      const debit = net.isNegative() ? net.neg() : ZERO;
      const credit = net.isPositive() ? net : ZERO;
      debits = debits.plus(debit);
      credits = credits.plus(credit);
      lines.push({ accountId: a.id, debit, credit, code: a.code, name: a.name });
    }
    income.sort((x, y) => x.code.localeCompare(y.code));
    expenses.sort((x, y) => x.code.localeCompare(y.code));
    lines.sort((x, y) => x.code.localeCompare(y.code));

    const totalIncome = income.reduce((s, l) => s.plus(l.balance), ZERO);
    const totalExpenses = expenses.reduce((s, l) => s.plus(l.balance), ZERO);
    const netResult = totalIncome.minus(totalExpenses);

    // La diferencia va a Utilidades acumuladas: ganancia al crédito, pérdida al débito
    if (lines.length && retainedEarningsAccountId) {
      const diff = debits.minus(credits);
      if (!diff.isZero()) {
        lines.push({
          accountId: retainedEarningsAccountId,
          debit: diff.isNegative() ? diff.neg() : ZERO,
          credit: diff.isPositive() ? diff : ZERO,
          code: '',
          name: 'Utilidades acumuladas',
        });
      }
    }

    return { income, expenses, totalIncome, totalExpenses, netResult, lines };
  }

  private async closingIssues(tx: Tx, year: YearRow, user: AuthUser) {
    const issues: string[] = [];
    if (year.status !== FiscalPeriodStatus.OPEN) issues.push('El año fiscal ya está cerrado');

    const drafts = await tx.journalEntry.count({
      where: {
        companyId: user.companyId,
        status: JournalEntryStatus.DRAFT,
        date: { gte: year.startDate, lte: year.endDate },
      },
    });
    if (drafts) issues.push(`Hay ${drafts} asiento(s) en borrador dentro del año; publícalos o elimínalos antes de cerrar`);

    const earlier = await tx.fiscalYear.findFirst({
      where: { companyId: user.companyId, status: FiscalPeriodStatus.OPEN, endDate: { lt: year.startDate } },
      orderBy: { startDate: 'asc' },
    });
    if (earlier) issues.push(`Primero hay que cerrar el año fiscal "${earlier.name}"`);

    const s = await tx.accountingSettings.findUnique({ where: { companyId: user.companyId } });
    if (!s?.retainedEarningsAccountId) {
      issues.push('Falta configurar la cuenta de Utilidades acumuladas (retainedEarningsAccountId) en Configuración contable');
    }
    const journal = await tx.journal.findFirst({
      where: { companyId: user.companyId, type: JournalType.CLOSING, active: true },
    });
    if (!journal) issues.push('No hay diario de cierre; crea los diarios por defecto (POST /journals/defaults)');
    return { issues, retainedEarningsAccountId: s?.retainedEarningsAccountId ?? null };
  }

  async closingPreview(id: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const year = await this.findYear(tx, id, user);
      const { issues, retainedEarningsAccountId } = await this.closingIssues(tx, year, user);
      const c = await this.buildClosing(tx, year, retainedEarningsAccountId, user);
      let retained: { id: string; code: string; name: string } | null = null;
      if (retainedEarningsAccountId) {
        retained = await tx.account.findFirst({
          where: { id: retainedEarningsAccountId, companyId: user.companyId },
          select: { id: true, code: true, name: true },
        });
      }
      return {
        year: { id: year.id, name: year.name, status: year.status, startDate: year.startDate, endDate: year.endDate },
        canClose: issues.length === 0,
        issues,
        retainedEarningsAccount: retained,
        income: c.income,
        expenses: c.expenses,
        totalIncome: clean(c.totalIncome),
        totalExpenses: clean(c.totalExpenses),
        netResult: clean(c.netResult),
        entryLines: c.lines.map((l) => ({
          accountId: l.accountId,
          code: l.code || retained?.code || '',
          name: l.name,
          debit: l.debit,
          credit: l.credit,
        })),
      };
    });
  }

  // ------------------------------------------------------------------
  // CIERRE DEL AÑO FISCAL
  // ------------------------------------------------------------------
  async close(id: string, user: AuthUser) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const year = await this.findYear(tx, id, user);
          if (year.status !== FiscalPeriodStatus.OPEN) {
            throw new ConflictException('El año fiscal ya está cerrado');
          }
          const { issues, retainedEarningsAccountId } = await this.closingIssues(tx, year, user);
          if (issues.length) {
            throw new UnprocessableEntityException({
              message: 'No se puede cerrar el año fiscal',
              issues,
            });
          }
          const c = await this.buildClosing(tx, year, retainedEarningsAccountId, user);

          let closingEntryId: string | null = null;
          let entryNumber: string | null = null;
          if (c.lines.length) {
            // Si el período de la fecha de cierre ya estaba cerrado a mano, se abre dentro de esta
            // misma transacción solo para poder asentar el cierre; al final se cierran todos.
            await tx.fiscalPeriod.updateMany({
              where: {
                companyId: user.companyId,
                status: FiscalPeriodStatus.CLOSED,
                startDate: { lte: year.endDate },
                endDate: { gte: year.endDate },
              },
              data: { status: FiscalPeriodStatus.OPEN, closedById: null, closedAt: null },
            });
            const entry = await this.posting.post(tx, user, {
              date: year.endDate,
              description: `Cierre del ejercicio fiscal ${year.name}`,
              journalType: JournalType.CLOSING,
              type: JournalEntryType.CLOSING,
              sourceType: SourceDocumentType.YEAR_END_CLOSING,
              sourceId: year.id,
              lines: c.lines.map(({ accountId, debit, credit }) => ({ accountId, debit, credit })),
            });
            closingEntryId = entry.id;
            entryNumber = entry.number;
          }

          const now = new Date();
          await tx.fiscalPeriod.updateMany({
            where: {
              companyId: user.companyId,
              status: FiscalPeriodStatus.OPEN,
              startDate: { gte: year.startDate },
              endDate: { lte: year.endDate },
            },
            data: { status: FiscalPeriodStatus.CLOSED, closedById: user.id, closedAt: now },
          });
          await tx.fiscalPeriod.updateMany({
            where: {
              companyId: user.companyId,
              fiscalYearId: null,
              startDate: { gte: year.startDate },
              endDate: { lte: year.endDate },
            },
            data: { fiscalYearId: year.id },
          });

          // La condición de estado va en el WHERE: dos cierres simultáneos no pasan ambos
          const res = await tx.fiscalYear.updateMany({
            where: { id, companyId: user.companyId, status: FiscalPeriodStatus.OPEN },
            data: {
              status: FiscalPeriodStatus.CLOSED,
              closingEntryId,
              closedById: user.id,
              closedAt: now,
            },
          });
          if (res.count === 0) throw new ConflictException('El año fiscal ya está cerrado');

          await writeAudit(tx, user, 'FiscalYear', id, AuditAction.CLOSE, {
            netResult: clean(c.netResult).toString(),
            closingEntryId,
            entryNumber,
          });
          return {
            year: await tx.fiscalYear.findUniqueOrThrow({ where: { id } }),
            closingEntryId,
            entryNumber,
            totalIncome: clean(c.totalIncome),
            totalExpenses: clean(c.totalExpenses),
            netResult: clean(c.netResult),
          };
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 },
      );
    } catch (e) {
      // Otro proceso tocó la contabilidad a la vez (o cerró el mismo año)
      if ((e as { code?: string })?.code === 'P2034') {
        throw new ConflictException('La contabilidad cambió mientras se cerraba el año; reintenta');
      }
      throw e;
    }
  }

  // ------------------------------------------------------------------
  // REAPERTURA: anula el asiento de cierre y abre los períodos del año
  // ------------------------------------------------------------------
  async reopen(id: string, dto: ReopenFiscalYearDto, user: AuthUser) {
    try {
      return await this.prisma.$transaction(
        async (tx) => {
          const year = await this.findYear(tx, id, user);
          if (year.status !== FiscalPeriodStatus.CLOSED) {
            throw new ConflictException('El año fiscal no está cerrado');
          }
          const later = await tx.fiscalYear.findFirst({
            where: { companyId: user.companyId, status: FiscalPeriodStatus.CLOSED, startDate: { gt: year.endDate } },
            orderBy: { startDate: 'desc' },
          });
          if (later) {
            throw new ConflictException(`Primero hay que reabrir el año fiscal "${later.name}"`);
          }

          // 1) el año pasa a OPEN (con condición de estado); 2) se abren sus períodos;
          // 3) recién ahí se puede anular el asiento de cierre.
          const res = await tx.fiscalYear.updateMany({
            where: { id, companyId: user.companyId, status: FiscalPeriodStatus.CLOSED },
            data: { status: FiscalPeriodStatus.OPEN, closedById: null, closedAt: null },
          });
          if (res.count === 0) throw new ConflictException('El año fiscal no está cerrado');

          await tx.fiscalPeriod.updateMany({
            where: {
              companyId: user.companyId,
              status: FiscalPeriodStatus.CLOSED,
              startDate: { gte: year.startDate },
              endDate: { lte: year.endDate },
            },
            data: { status: FiscalPeriodStatus.OPEN, closedById: null, closedAt: null },
          });

          if (year.closingEntryId) {
            await this.posting.voidEntry(tx, user, year.closingEntryId, `Reapertura del año fiscal ${year.name}: ${dto.reason}`);
          }
          await tx.fiscalYear.update({ where: { id, companyId: user.companyId }, data: { closingEntryId: null } });

          await writeAudit(tx, user, 'FiscalYear', id, AuditAction.UPDATE, {
            action: 'REOPEN',
            reason: dto.reason,
            voidedClosingEntryId: year.closingEntryId,
          });
          return tx.fiscalYear.findUniqueOrThrow({ where: { id }, include: { periods: { orderBy: { startDate: 'asc' } } } });
        },
        { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, maxWait: 10000, timeout: 60000 },
      );
    } catch (e) {
      if ((e as { code?: string })?.code === 'P2034') {
        throw new ConflictException('La contabilidad cambió mientras se reabría el año; reintenta');
      }
      throw e;
    }
  }

  // ------------------------------------------------------------------
  // APERTURA DE SALDOS (migración): un solo asiento OPENING por empresa
  // ------------------------------------------------------------------
  async createOpeningBalances(dto: OpeningBalanceDto, user: AuthUser) {
    const lines: PostLine[] = dto.lines.map((l) => ({
      accountId: l.accountId,
      debit: dec(l.debit),
      credit: dec(l.credit),
      partnerId: l.partnerId,
      description: l.description,
    }));

    const partnerIds = [...new Set(dto.lines.map((l) => l.partnerId).filter((x): x is string => !!x))];
    if (partnerIds.length) {
      const found = await this.prisma.partner.count({
        where: { companyId: user.companyId, id: { in: partnerIds } },
      });
      if (found !== partnerIds.length) {
        throw new BadRequestException('Algún tercero no existe o no pertenece a la empresa');
      }
    }

    return this.prisma.$transaction(async (tx) => {
      // Un asiento de apertura por empresa: el candado evita que dos peticiones pasen la revisión a la vez
      await tx.$executeRaw(
        Prisma.sql`SELECT pg_advisory_xact_lock(hashtext(${'opening:' + user.companyId}))`,
      );
      const existing = await tx.journalEntry.findFirst({
        where: { companyId: user.companyId, type: JournalEntryType.OPENING, status: { not: JournalEntryStatus.VOIDED } },
      });
      if (existing) {
        throw new ConflictException(
          `Ya existe un asiento de apertura (${existing.number ?? existing.id}); anúlalo si hay que rehacerlo`,
        );
      }
      return this.posting.post(tx, user, {
        date: new Date(dto.date),
        description: dto.description ?? 'Asiento de apertura de saldos',
        reference: dto.reference,
        journalType: JournalType.OPENING,
        type: JournalEntryType.OPENING,
        sourceType: SourceDocumentType.MANUAL,
        lines,
      });
    });
  }

  async getOpeningBalances(user: AuthUser) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { companyId: user.companyId, type: JournalEntryType.OPENING, status: { not: JournalEntryStatus.VOIDED } },
      include: {
        lines: { include: { account: { select: { code: true, name: true, type: true } } }, orderBy: { id: 'asc' } },
      },
    });
    if (!entry) return { entry: null };
    const totalDebit = entry.lines.reduce((s, l) => s.plus(l.debit), ZERO);
    const totalCredit = entry.lines.reduce((s, l) => s.plus(l.credit), ZERO);
    return { entry, totalDebit, totalCredit };
  }
}
