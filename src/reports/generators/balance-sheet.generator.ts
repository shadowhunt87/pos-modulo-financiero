import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AccountType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ReportsService } from '../reports.service.js';
import { BalanceSheetQuery } from '../dto/reports-queries.dto.js';
import { ZERO, endOfDay, startOfDay } from '../accounting-nature.utils.js';

export interface BalanceSheetLine {
  accountId: string;
  code: string;
  name: string;
  amount: Prisma.Decimal;
}

export interface BalanceSheetResult {
  asOf: string;
  periodStart: string;
  assets: BalanceSheetLine[];
  liabilities: BalanceSheetLine[];
  equity: BalanceSheetLine[];
  netIncomeOfPeriod: Prisma.Decimal; // resultado del ejercicio en curso (aún sin cerrar)
  netIncomePriorPeriods: Prisma.Decimal; // resultados de años anteriores que aún no se han cerrado
  totalAssets: Prisma.Decimal;
  totalLiabilities: Prisma.Decimal;
  totalEquity: Prisma.Decimal; // incluye los dos resultados anteriores
  balanced: boolean; // Activo === Pasivo + Patrimonio
}

const clean = (d: Prisma.Decimal) => (d.isZero() ? ZERO : d);

/**
 * Balance General a una fecha de corte (asOf). Activo/Pasivo/Patrimonio son
 * cuentas "reales": su saldo es acumulado desde siempre.
 *
 * Los ingresos y gastos que todavía no han sido trasladados a Utilidades acumuladas
 * por un asiento de cierre se suman al Patrimonio, para que el balance cuadre en cualquier
 * fecha. Se calcula con los saldos acumulados de las cuentas de Ingreso/Gasto (los asientos
 * de cierre ya están incluidos), así que cuando un año se cierra su resultado pasa solo de
 * "resultado sin cerrar" a la cuenta de Utilidades acumuladas, sin contarse dos veces.
 *  - netIncomeOfPeriod: movimiento de Ingreso/Gasto desde periodStart hasta asOf.
 *  - netIncomePriorPeriods: lo que quede sin cerrar de antes de periodStart.
 * periodStart por defecto = inicio del año fiscal que contiene asOf (o 1 de enero).
 */
@Injectable()
export class BalanceSheetGenerator {
  constructor(
    private readonly reports: ReportsService,
    private readonly prisma: PrismaService,
  ) {}

  private async defaultPeriodStart(asOf: string, user: AuthUser) {
    const year = await this.prisma.fiscalYear.findFirst({
      where: {
        companyId: user.companyId,
        startDate: { lte: endOfDay(asOf) },
        endDate: { gte: startOfDay(asOf) },
      },
    });
    if (year) return year.startDate.toISOString().slice(0, 10);
    return `${new Date(asOf).getUTCFullYear()}-01-01`;
  }

  async generate(q: BalanceSheetQuery, user: AuthUser): Promise<BalanceSheetResult> {
    const periodStart = q.periodStart ?? (await this.defaultPeriodStart(q.asOf, user));

    const [summary, period] = await Promise.all([
      this.reports.generalLedgerSummary({ to: q.asOf }, user),
      this.reports.generalLedgerSummary({ from: periodStart, to: q.asOf }, user),
    ]);

    const toLine = (l: (typeof summary.lines)[number]): BalanceSheetLine => ({
      accountId: l.accountId,
      code: l.code,
      name: l.name,
      amount: l.closingBalance,
    });
    const ofType = (t: AccountType) => summary.lines.filter((l) => l.type === t);

    const assets = ofType(AccountType.ASSET).map(toLine);
    const liabilities = ofType(AccountType.LIABILITY).map(toLine);
    const equity = ofType(AccountType.EQUITY).map(toLine);
    const sortByCode = (l: BalanceSheetLine[]) => l.sort((x, y) => x.code.localeCompare(y.code));
    sortByCode(assets);
    sortByCode(liabilities);
    sortByCode(equity);

    // Resultado acumulado sin cerrar: Ingresos - Gastos (saldos por naturaleza)
    const sumBalance = (t: AccountType) => ofType(t).reduce((s, l) => s.plus(l.closingBalance), ZERO);
    const unclosed = sumBalance(AccountType.INCOME).minus(sumBalance(AccountType.EXPENSE));

    // Movimiento del período en curso
    const income = period.lines
      .filter((l) => l.type === AccountType.INCOME)
      .reduce((s, l) => s.plus(l.credit).minus(l.debit), ZERO);
    const expense = period.lines
      .filter((l) => l.type === AccountType.EXPENSE)
      .reduce((s, l) => s.plus(l.debit).minus(l.credit), ZERO);
    const netIncomeOfPeriod = income.minus(expense);
    const netIncomePriorPeriods = unclosed.minus(netIncomeOfPeriod);

    const totalAssets = assets.reduce((s, l) => s.plus(l.amount), ZERO);
    const totalLiabilities = liabilities.reduce((s, l) => s.plus(l.amount), ZERO);
    const totalEquity = equity.reduce((s, l) => s.plus(l.amount), ZERO).plus(unclosed);

    return {
      asOf: q.asOf,
      periodStart,
      assets,
      liabilities,
      equity,
      netIncomeOfPeriod: clean(netIncomeOfPeriod),
      netIncomePriorPeriods: clean(netIncomePriorPeriods),
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: totalAssets.equals(totalLiabilities.plus(totalEquity)),
    };
  }
}