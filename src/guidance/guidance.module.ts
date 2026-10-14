import { Module } from '@nestjs/common';
import { AccountingModule } from '../modules/accounting/accounting.module.js';
import { DgiiModule } from '../dgii/dgii.module.js';
import { GuidanceController } from './guidance.controller.js';
import { GuidanceService } from './guidance.service.js';

// AccountingModule y DgiiModule exportan sus servicios: se inyectan sin modificarlos
@Module({
  imports: [AccountingModule, DgiiModule],
  controllers: [GuidanceController],
  providers: [GuidanceService],
})
export class GuidanceModule {}
