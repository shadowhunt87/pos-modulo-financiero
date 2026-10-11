import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import {
  BalanceSheetQuery,
  DateRangeQuery,
  IncomeStatementQuery,
  JournalBookQuery,
  LedgerDetailQuery,
} from './dto/reports-queries.dto.js';
import { ReportsService } from './reports.service.js';
import { IncomeStatementGenerator } from './generators/income-statement.generator.js';
import { BalanceSheetGenerator } from './generators/balance-sheet.generator.js';
import { CashFlowGenerator } from './generators/cash-flow.generator.js';
import { LedgerDetailGenerator } from './generators/ledger-detail.generator.js';
import { SubledgerGenerator } from './generators/subledger.generator.js';
import { FinancialRatiosGenerator } from './generators/financial-ratios.generator.js';
import { CashFlowQuery, DocumentLedgerQuery, SubledgerQuery } from './dto/books-queries.dto.js';

// Solo lectura: cualquier rol de la empresa puede consultar los reportes.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('reports')
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly incomeStatement: IncomeStatementGenerator,
    private readonly balanceSheet: BalanceSheetGenerator,
    private readonly cashFlow: CashFlowGenerator,
    private readonly ledgerDetail: LedgerDetailGenerator,
    private readonly subledger: SubledgerGenerator,
    private readonly financialRatios: FinancialRatiosGenerator,
  ) {}

  @Get('journal-book')
  journalBook(@Query() query: JournalBookQuery, @CurrentUser() user: AuthUser) {
    return this.reports.journalBook(query, user);
  }

  @Get('general-ledger')
  generalLedgerSummary(
    @Query() query: DateRangeQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.generalLedgerSummary(query, user);
  }

  @Get('general-ledger/:accountId')
  generalLedger(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() query: LedgerDetailQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.reports.generalLedger(accountId, query, user);
  }

  @Get('income-statement')
  incomeStatementReport(
    @Query() query: IncomeStatementQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.incomeStatement.generate(query, user);
  }

  // Razones financieras del período [from, to]: liquidez, endeudamiento, rentabilidad y actividad
  @Get('financial-ratios')
  financialRatiosReport(@Query() query: IncomeStatementQuery, @CurrentUser() user: AuthUser) {
    return this.financialRatios.generate(query, user);
  }

  @Get('balance-sheet')
  balanceSheetReport(
    @Query() query: BalanceSheetQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.balanceSheet.generate(query, user);
  }

  @Get('cash-flow')
  cashFlowReport(@Query() query: CashFlowQuery, @CurrentUser() user: AuthUser) {
    return this.cashFlow.generate(query, user);
  }

  // Mayor de una cuenta con documentos origen; ?partnerId= = auxiliar de ese tercero
  @Get('ledger/:accountId/detail')
  ledgerDetailReport(
    @Param('accountId', ParseUUIDPipe) accountId: string,
    @Query() query: DocumentLedgerQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.ledgerDetail.generate(accountId, query, user);
  }

  // Saldo de una cuenta desglosado por tercero
  @Get('subledger')
  subledgerReport(@Query() query: SubledgerQuery, @CurrentUser() user: AuthUser) {
    return this.subledger.generate(query, user);
  }
}