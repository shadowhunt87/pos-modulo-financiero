import { Module } from '@nestjs/common';
import { AccountingModule } from '../modules/accounting/accounting.module.js';
import { DgiiModule } from '../dgii/dgii.module.js';
import { ChartOfAccountsModule } from '../chart-of-accounts/chart-of-accounts.module.js';
import { MastersModule } from '../masters/masters.module.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';
import { InvoicingModule } from '../invoicing/invoicing.module.js';
import { ReceivablesPayablesModule } from '../receivables-payables/receivables-payables.module.js';
import { ChartTemplateService } from './chart-template.service.js';
import { SampleDataService } from './sample-data.service.js';
import { GuidanceController } from './guidance.controller.js';
import { GuidanceService } from './guidance.service.js';

// AccountingModule y DgiiModule exportan sus servicios: se inyectan sin modificarlos
@Module({
  imports: [AccountingModule, DgiiModule, ChartOfAccountsModule, MastersModule, FiscalModule, InvoicingModule, ReceivablesPayablesModule],
  controllers: [GuidanceController],
  providers: [GuidanceService, ChartTemplateService, SampleDataService],
})
export class GuidanceModule {}
