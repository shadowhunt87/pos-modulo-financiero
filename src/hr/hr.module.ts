import { Module } from '@nestjs/common';
import { MastersModule } from '../masters/masters.module.js';
import { PostingModule } from '../posting/posting.module.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';
import { HrController } from './hr.controller.js';
import { EmployeesService } from './employees.service.js';
import { PayrollSettingsService } from './payroll-settings.service.js';
import { PayrollService } from './payroll.service.js';

@Module({
  imports: [MastersModule, PostingModule, FiscalModule],
  controllers: [HrController],
  providers: [EmployeesService, PayrollSettingsService, PayrollService],
})
export class HrModule {}
