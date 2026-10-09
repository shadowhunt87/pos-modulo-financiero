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
  ],
})
export class AppModule {}