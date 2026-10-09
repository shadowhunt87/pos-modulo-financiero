import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { JournalEntryStatus } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  DateRangeQuery,
  JournalBookQuery,
  LedgerDetailQuery,
} from './dto/reports-queries.dto.js';
import {
  ZERO,
  dec,
  startOfDay,
  endOfDay,
  natureOf,
  byNature,
  type DecimalLike,
} from './accounting-nature.utils.js';

interface LedgerRow {
  lineId: string;
  entryId: string;
  date: Date;
  description: string;
  reference: string | null;
  lineDescription: string | null;
  debit: DecimalLike;
  credit: DecimalLike;
  running: DecimalLike;
}

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private range(q: DateRangeQuery) {
    const from = q.from ? startOfDay(q.from) : undefined;
    const to = q.to ? endOfDay(q.to) : undefined;
    if (from && to && from > to) {
      throw new BadRequestException('from no puede ser posterior a to');
    }
    return { from, to };
  }

  // ------------------------------------------------------------------
  // LIBRO DIARIO: asientos POSTED en orden cronológico (los anulados no salen)
  // ------------------------------------------------------------------
  async journalBook(q: JournalBookQuery, user: AuthUser) {
    const { from, to } = this.range(q);
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;

    const where: Prisma.JournalEntryWhereInput = {
      companyId: user.companyId,
      status: JournalEntryStatus.POSTED,
      date: { gte: from, lte: to },
    };

    const [entries, total, sums] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        // Por fecha del asiento, no de captura: un asiento atrasado queda en su lugar
        orderBy: [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
        skip: (page - 1) * limit,
        take: limit,
        include: {
          lines: {
            orderBy: [{ debit: 'desc' }, { id: 'asc' }], // el "debe" primero
            include: { account: { select: { code: true, name: true } } },
          },
        },
      }),
      this.prisma.journalEntry.count({ where }),
      this.prisma.journalEntryLine.aggregate({
        where: { journalEntry: where },
        _sum: { debit: true, credit: true },
      }),
    ]);

    return {
      from: q.from ?? null,
      to: q.to ?? null,
      page,
      limit,
      total,
      // Totales de TODO el rango, no solo de la página
      totalDebit: sums._sum.debit ?? ZERO,
      totalCredit: sums._sum.credit ?? ZERO,
      data: entries.map((e) => ({
        id: e.id,
        date: e.date,
        description: e.description,
        reference: e.reference,
        totalDebit: e.lines.reduce((s, l) => s.plus(l.debit), ZERO),
        totalCredit: e.lines.reduce((s, l) => s.plus(l.credit), ZERO),
        lines: e.lines.map((l) => ({
          accountId: l.accountId,
          code: l.account.code,
          name: l.account.name,
          description: l.description,
          debit: l.debit,
          credit: l.credit,
        })),
      })),
    };
  }

  // ------------------------------------------------------------------
  // MAYOR GENERAL (resumen): por cuenta, saldo inicial, débitos, créditos y
  // saldo final. Cada fila trae accountId para bajar al detalle.
  // ------------------------------------------------------------------
  async generalLedgerSummary(q: DateRangeQuery, user: AuthUser) {
    const { from, to } = this.range(q);
    const base = {
      companyId: user.companyId,
      status: JournalEntryStatus.POSTED,
    };

    const [before, within] = await Promise.all([
      from
        ? this.prisma.journalEntryLine.groupBy({
            by: ['accountId'],
            where: { journalEntry: { ...base, date: { lt: from } } },
            _sum: { debit: true, credit: true },
          })
        : Promise.resolve([]),
      this.prisma.journalEntryLine.groupBy({
        by: ['accountId'],
        where: { journalEntry: { ...base, date: { gte: from, lte: to } } },
        _sum: { debit: true, credit: true },
      }),
    ]);

    const acc = new Map<
      string,
      { opening: Prisma.Decimal; debit: Prisma.Decimal; credit: Prisma.Decimal }
    >();
    const slot = (id: string) => {
      if (!acc.has(id)) {
        acc.set(id, { opening: ZERO, debit: ZERO, credit: ZERO });
      }
      return acc.get(id)!;
    };
    for (const r of before) {
      slot(r.accountId).opening = dec(r._sum.debit).minus(dec(r._sum.credit));
    }
    for (const r of within) {
      const s = slot(r.accountId);
      s.debit = dec(r._sum.debit);
      s.credit = dec(r._sum.credit);
    }

    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, id: { in: [...acc.keys()] } },
    });

    const lines = accounts
      .map((a) => {
        const s = acc.get(a.id)!;
        return {
          accountId: a.id,
          code: a.code,
          name: a.name,
          type: a.type,
          nature: natureOf(a.type),
          openingBalance: byNature(a.type, s.opening),
          debit: s.debit,
          credit: s.credit,
          closingBalance: byNature(
            a.type,
            s.opening.plus(s.debit).minus(s.credit),
          ),
        };
      })
      // Se omiten las cuentas sin saldo inicial ni movimiento en el rango
      .filter(
        (l) =>
          !(l.openingBalance.isZero() && l.debit.isZero() && l.credit.isZero()),
      )
      .sort((x, y) => x.code.localeCompare(y.code));

    return {
      from: q.from ?? null,
      to: q.to ?? null,
      lines,
      totalDebit: lines.reduce((s, l) => s.plus(l.debit), ZERO),
      totalCredit: lines.reduce((s, l) => s.plus(l.credit), ZERO),
    };
  }

  // ------------------------------------------------------------------
  // MAYOR GENERAL (detalle de una cuenta): movimientos con saldo corrido.
  // Cada movimiento trae entryId -> GET /accounting/journal-entries/:id
  // (así se baja de la cifra al asiento). El saldo corrido sale de una window
  // function en SQL, por eso es correcto en cualquier página.
  // ------------------------------------------------------------------
  async generalLedger(
    accountId: string,
    q: LedgerDetailQuery,
    user: AuthUser,
  ) {
    const account = await this.prisma.account.findFirst({
      where: { id: accountId, companyId: user.companyId },
    });
    if (!account) throw new NotFoundException('Cuenta no encontrada');

    const { from, to } = this.range(q);
    const page = q.page ?? 1;
    const limit = q.limit ?? 100;
    const offset = (page - 1) * limit;
    const posted = {
      companyId: user.companyId,
      status: JournalEntryStatus.POSTED,
    };

    // Saldo inicial = todo lo anterior a `from`
    let openingRaw = ZERO;
    if (from) {
      const before = await this.prisma.journalEntryLine.aggregate({
        where: { accountId, journalEntry: { ...posted, date: { lt: from } } },
        _sum: { debit: true, credit: true },
      });
      openingRaw = dec(before._sum.debit).minus(dec(before._sum.credit));
    }

    const inRange: Prisma.JournalEntryLineWhereInput = {
      accountId,
      journalEntry: { ...posted, date: { gte: from, lte: to } },
    };

    const fromSql = from ? Prisma.sql`AND e."date" >= ${from}` : Prisma.empty;
    const toSql = to ? Prisma.sql`AND e."date" <= ${to}` : Prisma.empty;

    const [rows, total, sums] = await Promise.all([
      this.prisma.$queryRaw<LedgerRow[]>(Prisma.sql`
        SELECT * FROM (
          SELECT l."id" AS "lineId", e."id" AS "entryId", e."date" AS "date",
                 e."createdAt" AS "createdAt", e."description" AS "description",
                 e."reference" AS "reference", l."description" AS "lineDescription",
                 l."debit" AS "debit", l."credit" AS "credit",
                 SUM(l."debit" - l."credit")
                   OVER (ORDER BY e."date", e."createdAt", l."id") AS "running"
          FROM "JournalEntryLine" l
          JOIN "JournalEntry" e ON e."id" = l."journalEntryId"
          WHERE e."companyId" = ${user.companyId}
            AND e."status" = 'POSTED'
            AND l."accountId" = ${accountId}
            ${fromSql} ${toSql}
        ) t
        ORDER BY t."date", t."createdAt", t."lineId"
        LIMIT ${limit} OFFSET ${offset}`),
      this.prisma.journalEntryLine.count({ where: inRange }),
      this.prisma.journalEntryLine.aggregate({
        where: inRange,
        _sum: { debit: true, credit: true },
      }),
    ]);

    const totalDebit = dec(sums._sum.debit);
    const totalCredit = dec(sums._sum.credit);

    return {
      account: {
        id: account.id,
        code: account.code,
        name: account.name,
        type: account.type,
        nature: natureOf(account.type),
      },
      from: q.from ?? null,
      to: q.to ?? null,
      page,
      limit,
      total,
      openingBalance: byNature(account.type, openingRaw),
      totalDebit,
      totalCredit,
      closingBalance: byNature(
        account.type,
        openingRaw.plus(totalDebit).minus(totalCredit),
      ),
      movements: rows.map((r) => ({
        entryId: r.entryId,
        date: r.date,
        description: r.description,
        reference: r.reference,
        lineDescription: r.lineDescription,
        debit: dec(r.debit),
        credit: dec(r.credit),
        balance: byNature(account.type, openingRaw.plus(dec(r.running))),
      })),
    };
  }
}