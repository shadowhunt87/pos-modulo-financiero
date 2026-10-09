import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller.js';
import { ReportsService } from './reports.service.js';
import { IncomeStatementGenerator } from './generators/income-statement.generator.js';
import { BalanceSheetGenerator } from './generators/balance-sheet.generator.js';
import { CashFlowGenerator } from './generators/cash-flow.generator.js';
import { LedgerDetailGenerator } from './generators/ledger-detail.generator.js';
import { SubledgerGenerator } from './generators/subledger.generator.js';

// PrismaModule es @Global, no hace falta importarlo aquí.
@Module({
  controllers: [ReportsController],
  providers: [ReportsService, IncomeStatementGenerator, BalanceSheetGenerator, CashFlowGenerator, LedgerDetailGenerator, SubledgerGenerator],
  exports: [ReportsService, IncomeStatementGenerator, BalanceSheetGenerator, CashFlowGenerator, LedgerDetailGenerator, SubledgerGenerator],
})
export class ReportsModule {}