import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { AccountingModule } from './modules/accounting/accounting.module.js';
import { ReportsModule } from './reports/reports.module.js';
import { MastersModule } from './masters/masters.module.js';
import { InvoicingModule } from './invoicing/invoicing.module.js';
import { ReceivablesPayablesModule } from './receivables-payables/receivables-payables.module.js';
import { TreasuryModule } from './treasury/treasury.module.js';
import { BudgetsModule } from './budgets/budgets.module.js';
import { FiscalYearModule } from './fiscal-year/fiscal-year.module.js';
import { DgiiModule } from './dgii/dgii.module.js';
import { UsersModule } from './users/users.module.js';
import { CompanyModule } from './company/company.module.js';
import { AttachmentsModule } from './attachments/attachments.module.js';
import { ExportsModule } from './exports/exports.module.js';
import { FeedbackModule } from './feedback/feedback.module.js';
import { ChartOfAccountsModule } from './chart-of-accounts/chart-of-accounts.module.js';
import { EcfModule } from './ecf/ecf.module.js';
import { MetaModule } from './meta/meta.module.js';
import { ServiceKeysModule } from './service-keys/service-keys.module.js';
import { FinancialAnalysisModule } from './financial-analysis/financial-analysis.module.js';
import { GuidanceModule } from './guidance/guidance.module.js';
import { validate } from './config/env.validation.js';

@Module({
  imports: [
    // Carga .env, valida las variables al arrancar y expone ConfigService global
    ConfigModule.forRoot({ isGlobal: true, validate }),
    PrismaModule,
    AuthModule,
    AccountingModule,
    ReportsModule,
    MastersModule,
    InvoicingModule,
    ReceivablesPayablesModule,
    TreasuryModule,
    BudgetsModule,
    FiscalYearModule,
    DgiiModule,
    UsersModule,
    CompanyModule,
    AttachmentsModule,
    ExportsModule,
    FeedbackModule,
    ChartOfAccountsModule,
    EcfModule,
    MetaModule,
    ServiceKeysModule,
    FinancialAnalysisModule,
    GuidanceModule,
  ],
})
export class AppModule {}