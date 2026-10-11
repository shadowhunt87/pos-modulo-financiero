import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AccountType,
  AuditAction,
  BudgetStatus,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { ZERO, dec } from '../reports/accounting-nature.utils.js';
import {
  BudgetVsActualQuery,
  CreateBudgetDto,
  ListBudgetsQuery,
  SetBudgetLinesDto,
  UpdateBudgetDto,
} from './dto/budget.dto.js';

/** Evita el "-0" que produce Decimal.neg() sobre cero. */
const clean = (d: Prisma.Decimal) => (d.isZero() ? ZERO : d);

interface ActualRow {
  accountId: string;
  month: number;
  net: Prisma.Decimal | string; // débitos - créditos
}

@Injectable()
export class BudgetsService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------------------------------------------
  // CRUD de cabecera
  // ---------------------------------------------------------------
  async create(dto: CreateBudgetDto, user: AuthUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const b = await tx.budget.create({
          data: {
            companyId: user.companyId,
            name: dto.name.trim(),
            year: dto.year,
            notes: dto.notes,
          },
        });
        await writeAudit(tx, user, 'Budget', b.id, AuditAction.CREATE, {
          name: b.name,
          year: b.year,
        });
        return b;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(
          'Ya existe un presupuesto con ese nombre para ese año',
        );
      }
      throw e;
    }
  }

  async list(q: ListBudgetsQuery, user: AuthUser) {
    return this.prisma.budget.findMany({
      where: { companyId: user.companyId, year: q.year, status: q.status },
      orderBy: [{ year: 'desc' }, { name: 'asc' }],
      include: { _count: { select: { lines: true } } },
    });
  }

  private async findOwned(id: string, user: AuthUser) {
    const b = await this.prisma.budget.findFirst({
      where: { id, companyId: user.companyId },
    });
    if (!b) throw new NotFoundException('Presupuesto no encontrado');
    return b;
  }

  async get(id: string, user: AuthUser) {
    await this.findOwned(id, user);
    const budget = await this.prisma.budget.findFirstOrThrow({
      where: { id, companyId: user.companyId },
      include: {
        lines: {
          orderBy: [{ month: 'asc' }],
          include: { account: { select: { code: true, name: true, type: true } } },
        },
      },
    });
    const total = budget.lines.reduce((s, l) => s.plus(l.plannedAmount), ZERO);
    return { ...budget, totalPlanned: total };
  }

  /** Bloquea la fila y exige DRAFT. Debe llamarse dentro de una transacción. */
  private async lockDraft(
    tx: Prisma.TransactionClient,
    id: string,
    user: AuthUser,
  ) {
    const rows = await tx.$queryRaw<{ status: BudgetStatus }[]>(
      Prisma.sql`SELECT "status" FROM "Budget" WHERE "id" = ${id} AND "companyId" = ${user.companyId} FOR UPDATE`,
    );
    if (rows.length === 0) throw new NotFoundException('Presupuesto no encontrado');
    if (rows[0].status !== BudgetStatus.DRAFT) {
      throw new ConflictException(
        'Solo se puede modificar un presupuesto en borrador (DRAFT)',
      );
    }
  }

  async update(id: string, dto: UpdateBudgetDto, user: AuthUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.lockDraft(tx, id, user);
        const b = await tx.budget.update({
          where: { id, companyId: user.companyId },
          data: { name: dto.name?.trim(), notes: dto.notes },
        });
        await writeAudit(tx, user, 'Budget', id, AuditAction.UPDATE, {
          ...dto,
        });
        return b;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(
          'Ya existe un presupuesto con ese nombre para ese año',
        );
      }
      throw e;
    }
  }

  async remove(id: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, id, user);
      await tx.budgetLine.deleteMany({ where: { budgetId: id } });
      await tx.budget.delete({ where: { id, companyId: user.companyId } });
      await writeAudit(tx, user, 'Budget', id, AuditAction.DELETE);
    });
    return { deleted: true };
  }

  // ---------------------------------------------------------------
  // Líneas (cuenta x mes)
  // ---------------------------------------------------------------
  async setLines(id: string, dto: SetBudgetLinesDto, user: AuthUser) {
    const seen = new Set<string>();
    for (const l of dto.lines) {
      const k = `${l.accountId}|${l.month}`;
      if (seen.has(k)) {
        throw new BadRequestException(
          `Línea duplicada (cuenta ${l.accountId}, mes ${l.month})`,
        );
      }
      seen.add(k);
    }

    const accountIds = [...new Set(dto.lines.map((l) => l.accountId))];
    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, id: { in: accountIds } },
      select: { id: true, code: true, type: true, isPostable: true },
    });
    if (accounts.length !== accountIds.length) {
      throw new BadRequestException(
        'Alguna cuenta no existe o no pertenece a la empresa',
      );
    }
    for (const a of accounts) {
      if (a.type !== AccountType.INCOME && a.type !== AccountType.EXPENSE) {
        throw new BadRequestException(
          `La cuenta ${a.code} no es de ingreso ni de gasto; solo se presupuestan esas`,
        );
      }
      if (!a.isPostable) {
        throw new BadRequestException(`La cuenta ${a.code} es agrupadora; presupuesta sus cuentas hijas`);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await this.lockDraft(tx, id, user);
      if (dto.replace) {
        await tx.budgetLine.deleteMany({ where: { budgetId: id } });
      }
      for (const l of dto.lines) {
        await tx.budgetLine.upsert({
          where: {
            budgetId_accountId_month: {
              budgetId: id,
              accountId: l.accountId,
              month: l.month,
            },
          },
          create: {
            budgetId: id,
            accountId: l.accountId,
            month: l.month,
            plannedAmount: new Prisma.Decimal(l.plannedAmount),
          },
          update: { plannedAmount: new Prisma.Decimal(l.plannedAmount) },
        });
      }
      await writeAudit(tx, user, 'Budget', id, AuditAction.UPDATE, {
        linesSet: dto.lines.length,
        replace: !!dto.replace,
      });
    });
    return this.get(id, user);
  }

  // ---------------------------------------------------------------
  // Estados: aprobar / reabrir / archivar
  // ---------------------------------------------------------------
  async approve(id: string, user: AuthUser) {
    await this.findOwned(id, user);
    const count = await this.prisma.budgetLine.count({ where: { budgetId: id } });
    if (count === 0) {
      throw new BadRequestException('No se puede aprobar un presupuesto sin líneas');
    }
    return this.transition(id, user, BudgetStatus.DRAFT, BudgetStatus.APPROVED, AuditAction.APPROVE);
  }

  reopen(id: string, user: AuthUser) {
    return this.transition(id, user, BudgetStatus.APPROVED, BudgetStatus.DRAFT, AuditAction.UPDATE);
  }

  archive(id: string, user: AuthUser) {
    return this.transition(id, user, BudgetStatus.APPROVED, BudgetStatus.ARCHIVED, AuditAction.CLOSE);
  }

  private async transition(
    id: string,
    user: AuthUser,
    from: BudgetStatus,
    to: BudgetStatus,
    action: AuditAction,
  ) {
    await this.findOwned(id, user);
    return this.prisma.$transaction(async (tx) => {
      // La condición de estado va en el WHERE: dos requests simultáneos no pasan ambos
      const r = await tx.budget.updateMany({
        where: { id, companyId: user.companyId, status: from },
        data: { status: to },
      });
      if (r.count === 0) {
        throw new ConflictException(
          `El presupuesto no está en estado ${from}; no se puede pasar a ${to}`,
        );
      }
      await writeAudit(tx, user, 'Budget', id, action, { from, to });
      return tx.budget.findUniqueOrThrow({ where: { id } });
    });
  }

  // ---------------------------------------------------------------
  // PRESUPUESTO VS REAL
  // variance = real - presupuesto.
  // Favorable: ingresos con variance >= 0, gastos con variance <= 0.
  // ---------------------------------------------------------------
  async vsActual(id: string, q: BudgetVsActualQuery, user: AuthUser) {
    const budget = await this.findOwned(id, user);
    const fromMonth = q.fromMonth ?? 1;
    const toMonth = q.toMonth ?? 12;
    if (fromMonth > toMonth) {
      throw new BadRequestException('fromMonth no puede ser mayor que toMonth');
    }

    const yearStart = new Date(Date.UTC(budget.year, fromMonth - 1, 1));
    const yearEnd = new Date(Date.UTC(budget.year, toMonth, 1)); // exclusivo

    const [planned, actualRows] = await Promise.all([
      this.prisma.budgetLine.findMany({
        where: { budgetId: id, month: { gte: fromMonth, lte: toMonth } },
      }),
      this.prisma.$queryRaw<ActualRow[]>(Prisma.sql`
        SELECT l."accountId" AS "accountId",
               EXTRACT(MONTH FROM e."date")::int AS "month",
               SUM(l."debit" - l."credit") AS "net"
        FROM "JournalEntryLine" l
        JOIN "JournalEntry" e ON e."id" = l."journalEntryId"
        JOIN "Account" a ON a."id" = l."accountId"
        WHERE e."companyId" = ${user.companyId}
          AND e."status" = 'POSTED'
          AND e."type" <> 'CLOSING'
          AND e."date" >= ${yearStart} AND e."date" < ${yearEnd}
          AND a."type" IN ('INCOME', 'EXPENSE')
        GROUP BY l."accountId", EXTRACT(MONTH FROM e."date")`),
    ]);

    const accountIds = [
      ...new Set([...planned.map((p) => p.accountId), ...actualRows.map((a) => a.accountId)]),
    ];
    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, id: { in: accountIds } },
      select: { id: true, code: true, name: true, type: true },
    });
    const accMap = new Map(accounts.map((a) => [a.id, a]));

    type Cell = { planned: Prisma.Decimal; actual: Prisma.Decimal };
    const grid = new Map<string, Map<number, Cell>>();
    const cell = (accountId: string, month: number) => {
      if (!grid.has(accountId)) grid.set(accountId, new Map());
      const m = grid.get(accountId)!;
      if (!m.has(month)) m.set(month, { planned: ZERO, actual: ZERO });
      return m.get(month)!;
    };
    for (const p of planned) cell(p.accountId, p.month).planned = dec(p.plannedAmount);
    for (const r of actualRows) {
      const a = accMap.get(r.accountId);
      if (!a) continue;
      const net = dec(r.net);
      // Ingreso: crédito - débito; gasto: débito - crédito
      cell(r.accountId, r.month).actual = a.type === AccountType.INCOME ? net.neg() : net;
    }

    const variance = (type: AccountType, planned: Prisma.Decimal, actual: Prisma.Decimal) => {
      const v = actual.minus(planned);
      const favorable = type === AccountType.INCOME ? v.gte(0) : v.lte(0);
      const pct = planned.isZero() ? null : v.div(planned).times(100).toDecimalPlaces(2).toString();
      return { variance: clean(v), variancePct: pct, favorable };
    };

    const rows = [...grid.entries()]
      .map(([accountId, months]) => {
        const a = accMap.get(accountId)!;
        let tp = ZERO;
        let ta = ZERO;
        const detail = [...months.entries()]
          .sort(([x], [y]) => x - y)
          .map(([month, c]) => {
            tp = tp.plus(c.planned);
            ta = ta.plus(c.actual);
            return {
              month,
              planned: clean(c.planned),
              actual: clean(c.actual),
              ...variance(a.type, c.planned, c.actual),
            };
          });
        return {
          accountId,
          code: a.code,
          name: a.name,
          type: a.type,
          budgeted: planned.some((p) => p.accountId === accountId),
          planned: clean(tp),
          actual: clean(ta),
          ...variance(a.type, tp, ta),
          months: detail,
        };
      })
      .sort((x, y) => x.code.localeCompare(y.code));

    const sum = (type: AccountType, key: 'planned' | 'actual') =>
      rows.filter((r) => r.type === type).reduce((s, r) => s.plus(r[key]), ZERO);
    const incP = sum(AccountType.INCOME, 'planned');
    const incA = sum(AccountType.INCOME, 'actual');
    const expP = sum(AccountType.EXPENSE, 'planned');
    const expA = sum(AccountType.EXPENSE, 'actual');
    const netP = incP.minus(expP);
    const netA = incA.minus(expA);

    return {
      budget: { id: budget.id, name: budget.name, year: budget.year, status: budget.status },
      fromMonth,
      toMonth,
      rows,
      totals: {
        income: { planned: clean(incP), actual: clean(incA), variance: clean(incA.minus(incP)) },
        expense: { planned: clean(expP), actual: clean(expA), variance: clean(expA.minus(expP)) },
        netResult: { planned: clean(netP), actual: clean(netA), variance: clean(netA.minus(netP)) },
      },
    };
  }
}
