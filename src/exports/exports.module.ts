import { Module } from '@nestjs/common';
import { AccountingModule } from '../modules/accounting/accounting.module.js';
import { DgiiModule } from '../dgii/dgii.module.js';
import { ReportsModule } from '../reports/reports.module.js';
import { ExportsController } from './exports.controller.js';
import { ExportsService } from './exports.service.js';

@Module({
  imports: [ReportsModule, DgiiModule, AccountingModule],
  controllers: [ExportsController],
  providers: [ExportsService],
})
export class ExportsModule {}
