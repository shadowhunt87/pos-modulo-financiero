import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AccountType, JournalEntryStatus, JournalEntryType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { IncomeStatementQuery } from '../dto/reports-queries.dto.js';
import { ZERO, dec, startOfDay, endOfDay, byNature } from '../accounting-nature.utils.js';

export interface IncomeStatementLine {
  accountId: string;
  code: string;
  name: string;
  amount: Prisma.Decimal;
}

export interface IncomeStatementResult {
  from: string;
  to: string;
  income: IncomeStatementLine[];
  expenses: IncomeStatementLine[];
  totalIncome: Prisma.Decimal;
  totalExpenses: Prisma.Decimal;
  netIncome: Prisma.Decimal;
}

/**
 * Estado de Resultados. A diferencia del Balance General, las cuentas de
 * Ingreso y Gasto son "nominales": no se habla de saldo inicial, solo del
 * movimiento DENTRO del período — por eso esto NO reutiliza
 * generalLedgerSummary() (que sí arrastra saldo inicial, correcto para
 * Activo/Pasivo/Patrimonio pero incorrecto aquí). Los asientos de cierre de
 * año (type CLOSING) se excluyen: llevan Ingreso/Gasto a cero y, si se
 * contaran, el estado de un año ya cerrado saldría vacío.
 */
@Injectable()
export class IncomeStatementGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(q: IncomeStatementQuery, user: AuthUser): Promise<IncomeStatementResult> {
    if (!q.from || !q.to) {
      throw new BadRequestException(
        'El Estado de Resultados requiere from y to (es un período, no una fecha de corte)',
      );
    }
    const from = startOfDay(q.from);
    const to = endOfDay(q.to);
    if (from > to) {
      throw new BadRequestException('from no puede ser posterior a to');
    }

    const rows = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        journalEntry: {
          companyId: user.companyId,
          status: JournalEntryStatus.POSTED,
          type: { not: JournalEntryType.CLOSING }, // el cierre anula el resultado; el reporte debe mostrarlo
          date: { gte: from, lte: to },
        },
        account: { type: { in: [AccountType.INCOME, AccountType.EXPENSE] } },
      },
      _sum: { debit: true, credit: true },
    });

    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, id: { in: rows.map((r) => r.accountId) } },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));

    const income: IncomeStatementLine[] = [];
    const expenses: IncomeStatementLine[] = [];

    for (const r of rows) {
      const a = byId.get(r.accountId)!;
      const movement = dec(r._sum.debit).minus(dec(r._sum.credit));
      const amount = byNature(a.type, movement); // positivo = lado normal de la cuenta
      const line: IncomeStatementLine = { accountId: a.id, code: a.code, name: a.name, amount };
      (a.type === AccountType.INCOME ? income : expenses).push(line);
    }

    const sortByCode = (l: IncomeStatementLine[]) => l.sort((x, y) => x.code.localeCompare(y.code));
    sortByCode(income);
    sortByCode(expenses);

    const totalIncome = income.reduce((s, l) => s.plus(l.amount), ZERO);
    const totalExpenses = expenses.reduce((s, l) => s.plus(l.amount), ZERO);

    return {
      from: q.from,
      to: q.to,
      income,
      expenses,
      totalIncome,
      totalExpenses,
      netIncome: totalIncome.minus(totalExpenses),
    };
  }
}