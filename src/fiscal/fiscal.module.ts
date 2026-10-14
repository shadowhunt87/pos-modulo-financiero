import { Module } from '@nestjs/common';
import { FiscalController } from './fiscal.controller.js';
import { FiscalParametersService } from './fiscal-parameters.service.js';
import { FiscalProfileService } from './fiscal-profile.service.js';
import { TaxLinksService } from './tax-links.service.js';
import { FiscalAlertsService } from './fiscal-alerts.service.js';
import { FiscalCalendarService } from './fiscal-calendar.service.js';

// PrismaModule es @Global. Exporta valueAt (facturación, DGII) y los avisos (calendario fiscal los amplía).
@Module({
  controllers: [FiscalController],
  providers: [FiscalParametersService, FiscalProfileService, TaxLinksService, FiscalAlertsService, FiscalCalendarService],
  exports: [FiscalParametersService, FiscalProfileService, FiscalAlertsService, FiscalCalendarService],
})
export class FiscalModule {}
