import { Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AccountType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { ReportsService } from '../reports.service.js';
import { BalanceSheetQuery } from '../dto/reports-queries.dto.js';
import { IncomeStatementGenerator } from './income-statement.generator.js';
import { ZERO } from '../accounting-nature.utils.js';

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
  netIncomeOfPeriod: Prisma.Decimal; // "Resultado del ejercicio", se suma a Patrimonio
  totalAssets: Prisma.Decimal;
  totalLiabilities: Prisma.Decimal;
  totalEquity: Prisma.Decimal; // incluye netIncomeOfPeriod
  balanced: boolean; // Activo === Pasivo + Patrimonio
}

/**
 * Balance General a una fecha de corte (asOf). Activo/Pasivo/Patrimonio son
 * cuentas "reales": su saldo es acumulado desde siempre, por eso esto SÍ
 * reutiliza generalLedgerSummary() con from=undefined (=> arrastra todo
 * hasta `to`), a diferencia del Estado de Resultados.
 *
 * El sistema no tiene todavía un asiento de cierre formal que mueva el
 * resultado del ejercicio a una cuenta de Patrimonio (ej. "Resultados
 * Acumulados"), así que el Balance no cuadraría sin ese dato — por eso se
 * calcula aparte con IncomeStatementGenerator y se suma a Patrimonio para
 * la presentación. El día que exista un asiento de cierre real, este ajuste
 * sobra (y hay que quitarlo para no contar el resultado dos veces).
 */
@Injectable()
export class BalanceSheetGenerator {
  constructor(
    private readonly reports: ReportsService,
    private readonly incomeStatement: IncomeStatementGenerator,
  ) {}

  async generate(q: BalanceSheetQuery, user: AuthUser): Promise<BalanceSheetResult> {
    const asOfDate = new Date(q.asOf);
    const periodStart = q.periodStart ?? `${asOfDate.getUTCFullYear()}-01-01`;

    const [summary, incomeStatement] = await Promise.all([
      this.reports.generalLedgerSummary({ to: q.asOf }, user),
      this.incomeStatement.generate({ from: periodStart, to: q.asOf }, user),
    ]);

    const toLine = (l: (typeof summary.lines)[number]): BalanceSheetLine => ({
      accountId: l.accountId,
      code: l.code,
      name: l.name,
      amount: l.closingBalance,
    });

    const assets = summary.lines.filter((l) => l.type === AccountType.ASSET).map(toLine);
    const liabilities = summary.lines.filter((l) => l.type === AccountType.LIABILITY).map(toLine);
    const equity = summary.lines.filter((l) => l.type === AccountType.EQUITY).map(toLine);

    const sortByCode = (l: BalanceSheetLine[]) => l.sort((x, y) => x.code.localeCompare(y.code));
    sortByCode(assets);
    sortByCode(liabilities);
    sortByCode(equity);

    const totalAssets = assets.reduce((s, l) => s.plus(l.amount), ZERO);
    const totalLiabilities = liabilities.reduce((s, l) => s.plus(l.amount), ZERO);
    const totalEquity = equity
      .reduce((s, l) => s.plus(l.amount), ZERO)
      .plus(incomeStatement.netIncome);

    return {
      asOf: q.asOf,
      periodStart,
      assets,
      liabilities,
      equity,
      netIncomeOfPeriod: incomeStatement.netIncome,
      totalAssets,
      totalLiabilities,
      totalEquity,
      balanced: totalAssets.equals(totalLiabilities.plus(totalEquity)),
    };
  }
}