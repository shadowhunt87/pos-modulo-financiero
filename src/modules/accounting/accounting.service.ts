import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  AccountType,
  AuditAction,
  FiscalPeriodStatus,
  JournalEntryStatus,
} from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { CreateAccountDto } from '../dto/create-account.dto.js';
import { UpdateAccountDto } from '../dto/update-account.dto.js';
import { CreateJournalEntryDto } from '../dto/create-journal-entry.dto.js';
import { CreateFiscalPeriodDto } from '../dto/create-fiscal-period.dto.js';
import {
  DateRangeQuery,
  ListAccountsQuery,
  ListJournalEntriesQuery,
} from '../dto/accounting-queries.dto.js';

type Tx = Prisma.TransactionClient;
const Decimal = Prisma.Decimal;
const dec = (n?: number) => new Decimal(String(n ?? 0));

const startOfDay = (s: string) => {
  const d = new Date(s);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};
const endOfDay = (s: string) => {
  const d = new Date(s);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};
const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';

@Injectable()
export class AccountingService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------
  // Auditoría (siempre dentro de la misma transacción que el cambio)
  // ------------------------------------------------------------------
  private audit(
    tx: Tx,
    user: AuthUser,
    entityName: string,
    entityId: string,
    action: AuditAction,
    changes?: Prisma.InputJsonValue,
  ) {
    return tx.auditLog.create({
      data: {
        companyId: user.companyId,
        userId: user.id,
        entityName,
        entityId,
        action,
        changes,
      },
    });
  }

  // ------------------------------------------------------------------
  // Plan de cuentas
  // ------------------------------------------------------------------
  private async getAccountOrFail(tx: Tx, id: string, companyId: string) {
    const account = await tx.account.findFirst({ where: { id, companyId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    return account;
  }

  async createAccount(dto: CreateAccountDto, user: AuthUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.parentId) {
          const parent = await this.getAccountOrFail(tx, dto.parentId, user.companyId);
          if (parent.type !== dto.type) {
            throw new UnprocessableEntityException(
              `La cuenta padre es ${parent.type}; la hija debe ser del mismo tipo`,
            );
          }
        }

        const account = await tx.account.create({
          data: {
            companyId: user.companyId,
            code: dto.code,
            name: dto.name,
            type: dto.type,
            parentId: dto.parentId,
          },
        });
        await this.audit(tx, user, 'Account', account.id, AuditAction.CREATE, {
          code: account.code,
          name: account.name,
          type: account.type,
        });
        return account;
      });
    } catch (e) {
      if (isUniqueViolation(e)) {
        throw new ConflictException(`Ya existe una cuenta con el código ${dto.code}`);
      }
      throw e;
    }
  }

  listAccounts(query: ListAccountsQuery, user: AuthUser) {
    return this.prisma.account.findMany({
      where: { companyId: user.companyId, active: query.active },
      orderBy: { code: 'asc' },
    });
  }

  getAccount(id: string, user: AuthUser) {
    return this.getAccountOrFail(this.prisma, id, user.companyId);
  }

  async updateAccount(id: string, dto: UpdateAccountDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const account = await this.getAccountOrFail(tx, id, user.companyId);
      const data: Prisma.AccountUncheckedUpdateInput = {};

      if (dto.name !== undefined) data.name = dto.name;

      if (dto.parentId !== undefined) {
        if (dto.parentId === null) {
          data.parentId = null;
        } else {
          if (dto.parentId === id) {
            throw new UnprocessableEntityException('Una cuenta no puede ser su propio padre');
          }
          const parent = await this.getAccountOrFail(tx, dto.parentId, user.companyId);
          if (parent.type !== account.type) {
            throw new UnprocessableEntityException(
              `La cuenta padre es ${parent.type}; esta cuenta es ${account.type}`,
            );
          }
          // Anti-ciclos: subir por los ancestros del nuevo padre; si aparece `id`, hay ciclo
          let cursor = parent.parentId;
          while (cursor) {
            if (cursor === id) {
              throw new UnprocessableEntityException('Ese cambio crearía un ciclo en la jerarquía');
            }
            const up = await tx.account.findFirst({
              where: { id: cursor, companyId: user.companyId },
              select: { parentId: true },
            });
            cursor = up?.parentId ?? null;
          }
          data.parentId = dto.parentId;
        }
      }

      if (dto.active !== undefined) {
        if (dto.active === false) {
          const activeChildren = await tx.account.count({
            where: { parentId: id, companyId: user.companyId, active: true },
          });
          if (activeChildren > 0) {
            throw new UnprocessableEntityException(
              'No se puede desactivar una cuenta con subcuentas activas',
            );
          }
        }
        data.active = dto.active;
      }

      const updated = await tx.account.update({ where: { id }, data });
      await this.audit(tx, user, 'Account', id, AuditAction.UPDATE, {
        before: { name: account.name, active: account.active, parentId: account.parentId },
        after: { name: updated.name, active: updated.active, parentId: updated.parentId },
      });
      return updated;
    });
  }

  // ------------------------------------------------------------------
  // Períodos fiscales
  // ------------------------------------------------------------------
  async createFiscalPeriod(dto: CreateFiscalPeriodDto, user: AuthUser) {
    const startDate = startOfDay(dto.startDate);
    const endDate = endOfDay(dto.endDate);
    if (startDate > endDate) {
      throw new BadRequestException('startDate no puede ser posterior a endDate');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const overlap = await tx.fiscalPeriod.findFirst({
          where: {
            companyId: user.companyId,
            startDate: { lte: endDate },
            endDate: { gte: startDate },
          },
        });
        if (overlap) {
          throw new ConflictException(`Se solapa con el período "${overlap.name}"`);
        }

        const period = await tx.fiscalPeriod.create({
          data: { companyId: user.companyId, name: dto.name, startDate, endDate },
        });
        await this.audit(tx, user, 'FiscalPeriod', period.id, AuditAction.CREATE, {
          name: period.name,
        });
        return period;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya existe ese período');
      throw e;
    }
  }

  listFiscalPeriods(user: AuthUser) {
    return this.prisma.fiscalPeriod.findMany({
      where: { companyId: user.companyId },
      orderBy: { startDate: 'asc' },
    });
  }

  private async setPeriodStatus(id: string, status: FiscalPeriodStatus, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const closing = status === FiscalPeriodStatus.CLOSED;
      // updateMany con la condición de estado: si dos admins cierran a la vez, solo uno gana
      const res = await tx.fiscalPeriod.updateMany({
        where: {
          id,
          companyId: user.companyId,
          status: closing ? FiscalPeriodStatus.OPEN : FiscalPeriodStatus.CLOSED,
        },
        data: {
          status,
          closedById: closing ? user.id : null,
          closedAt: closing ? new Date() : null,
        },
      });

      if (res.count === 0) {
        const exists = await tx.fiscalPeriod.findFirst({ where: { id, companyId: user.companyId } });
        if (!exists) throw new NotFoundException('Período no encontrado');
        throw new ConflictException(`El período ya está ${exists.status}`);
      }

      await this.audit(tx, user, 'FiscalPeriod', id, AuditAction.UPDATE, { status });
      return tx.fiscalPeriod.findUniqueOrThrow({ where: { id } });
    });
  }

  closeFiscalPeriod(id: string, user: AuthUser) {
    return this.setPeriodStatus(id, FiscalPeriodStatus.CLOSED, user);
  }

  reopenFiscalPeriod(id: string, user: AuthUser) {
    return this.setPeriodStatus(id, FiscalPeriodStatus.OPEN, user);
  }

  /** Lanza 422 si la fecha cae dentro de un período CLOSED. */
  private async assertPeriodOpen(tx: Tx, companyId: string, date: Date) {
    const closed = await tx.fiscalPeriod.findFirst({
      where: {
        companyId,
        status: FiscalPeriodStatus.CLOSED,
        startDate: { lte: date },
        endDate: { gte: date },
      },
    });
    if (closed) {
      throw new UnprocessableEntityException(
        `El período fiscal "${closed.name}" está cerrado`,
      );
    }
  }

  // ------------------------------------------------------------------
  // Asientos contables
  // ------------------------------------------------------------------
  async createJournalEntry(dto: CreateJournalEntryDto, user: AuthUser) {
    const date = new Date(dto.date);

    // 1. Validación de partida doble (sin tocar la BD)
    const lines = dto.lines.map((l, i) => {
      const debit = dec(l.debit);
      const credit = dec(l.credit);
      if (debit.gt(0) === credit.gt(0)) {
        throw new BadRequestException(
          `Línea ${i + 1}: debe tener débito o crédito (uno solo, mayor a 0)`,
        );
      }
      return {
        accountId: l.accountId,
        costCenterId: l.costCenterId,
        description: l.description,
        debit,
        credit,
      };
    });

    const totalDebit = lines.reduce((s, l) => s.plus(l.debit), dec(0));
    const totalCredit = lines.reduce((s, l) => s.plus(l.credit), dec(0));
    if (!totalDebit.equals(totalCredit)) {
      throw new UnprocessableEntityException(
        `El asiento no cuadra: débitos ${totalDebit.toFixed(4)} ≠ créditos ${totalCredit.toFixed(4)}`,
      );
    }

    // 2. Todo lo demás, atómico
    return this.prisma.$transaction(async (tx) => {
      await this.assertPeriodOpen(tx, user.companyId, date);

      const accountIds = [...new Set(lines.map((l) => l.accountId))];
      const accounts = await tx.account.findMany({
        where: { companyId: user.companyId, id: { in: accountIds } },
      });
      if (accounts.length !== accountIds.length) {
        const found = new Set(accounts.map((a) => a.id));
        const missing = accountIds.filter((id) => !found.has(id));
        throw new BadRequestException(`Cuentas no encontradas en tu empresa: ${missing.join(', ')}`);
      }
      const inactive = accounts.filter((a) => !a.active);
      if (inactive.length) {
        throw new UnprocessableEntityException(
          `Cuentas inactivas: ${inactive.map((a) => a.code).join(', ')}`,
        );
      }
      // No se postea en cuentas "de agrupación" (las que tienen subcuentas)
      const parents = await tx.account.findMany({
        where: { companyId: user.companyId, parentId: { in: accountIds } },
        select: { parentId: true },
        distinct: ['parentId'],
      });
      if (parents.length) {
        const parentIds = new Set(parents.map((p) => p.parentId));
        const codes = accounts.filter((a) => parentIds.has(a.id)).map((a) => a.code);
        throw new UnprocessableEntityException(
          `No se puede postear en cuentas con subcuentas: ${codes.join(', ')}`,
        );
      }

      const costCenterIds = [...new Set(lines.map((l) => l.costCenterId).filter((x): x is string => !!x))];
      if (costCenterIds.length) {
        const ccs = await tx.costCenter.findMany({
          where: { companyId: user.companyId, id: { in: costCenterIds }, active: true },
        });
        if (ccs.length !== costCenterIds.length) {
          throw new BadRequestException('Centro de costo no encontrado o inactivo');
        }
      }

      const entry = await tx.journalEntry.create({
        data: {
          companyId: user.companyId,
          date,
          description: dto.description,
          reference: dto.reference,
          createdById: user.id,
          status: JournalEntryStatus.POSTED,
          lines: { create: lines },
        },
        include: { lines: true },
      });

      await this.audit(tx, user, 'JournalEntry', entry.id, AuditAction.CREATE, {
        date: dto.date,
        total: totalDebit.toString(),
        lines: entry.lines.length,
      });
      return entry;
    });
  }

  async voidJournalEntry(id: string, reason: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.journalEntry.findFirst({
        where: { id, companyId: user.companyId },
      });
      if (!entry) throw new NotFoundException('Asiento no encontrado');
      if (entry.reconciled) {
        throw new UnprocessableEntityException('No se puede anular un asiento conciliado');
      }
      await this.assertPeriodOpen(tx, user.companyId, entry.date);

      // Condición de estado en el WHERE: dos anulaciones simultáneas no pasan ambas
      const res = await tx.journalEntry.updateMany({
        where: { id, companyId: user.companyId, status: { not: JournalEntryStatus.VOIDED } },
        data: { status: JournalEntryStatus.VOIDED },
      });
      if (res.count === 0) throw new ConflictException('El asiento ya está anulado');

      await this.audit(tx, user, 'JournalEntry', id, AuditAction.VOID, {
        reason,
        previousStatus: entry.status,
      });
      return tx.journalEntry.findUniqueOrThrow({ where: { id }, include: { lines: true } });
    });
  }

  private dateFilter(q: DateRangeQuery) {
    if (!q.from && !q.to) return undefined;
    return {
      ...(q.from && { gte: startOfDay(q.from) }),
      ...(q.to && { lte: endOfDay(q.to) }),
    };
  }

  async listJournalEntries(q: ListJournalEntriesQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.JournalEntryWhereInput = {
      companyId: user.companyId,
      status: q.status,
      date: this.dateFilter(q),
    };

    const [data, total] = await this.prisma.$transaction([
      this.prisma.journalEntry.findMany({
        where,
        include: { lines: true },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.journalEntry.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getJournalEntry(id: string, user: AuthUser) {
    const entry = await this.prisma.journalEntry.findFirst({
      where: { id, companyId: user.companyId },
      include: { lines: { include: { account: { select: { code: true, name: true } } } } },
    });
    if (!entry) throw new NotFoundException('Asiento no encontrado');
    return entry;
  }

  // ------------------------------------------------------------------
  // Balance de comprobación (solo asientos POSTED)
  // ------------------------------------------------------------------
  async trialBalance(q: DateRangeQuery, user: AuthUser) {
    const rows = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          companyId: user.companyId,
          status: JournalEntryStatus.POSTED,
          date: this.dateFilter(q),
        },
      },
      _sum: { debit: true, credit: true },
    });

    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, id: { in: rows.map((r) => r.accountId) } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    const lines = rows
      .map((r) => {
        const debit = r._sum.debit ?? dec(0);
        const credit = r._sum.credit ?? dec(0);
        const a = byId.get(r.accountId)!;
        return {
          accountId: a.id,
          code: a.code,
          name: a.name,
          type: a.type as AccountType,
          debit,
          credit,
          balance: debit.minus(credit), // + saldo deudor / - saldo acreedor
        };
      })
      .sort((x, y) => x.code.localeCompare(y.code));

    const totalDebit = lines.reduce((s, l) => s.plus(l.debit), dec(0));
    const totalCredit = lines.reduce((s, l) => s.plus(l.credit), dec(0));

    return {
      from: q.from ?? null,
      to: q.to ?? null,
      lines,
      totalDebit,
      totalCredit,
      balanced: totalDebit.equals(totalCredit),
    };
  }
}
