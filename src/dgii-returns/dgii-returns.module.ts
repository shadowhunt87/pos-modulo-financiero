import { Module } from '@nestjs/common';
import { DgiiModule } from '../dgii/dgii.module.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';
import { DgiiReturnsController } from './dgii-returns.controller.js';
import { DgiiReviewService } from './review.service.js';
import { DgiiFormsService } from './forms.service.js';

// PrismaModule es @Global. DgiiModule exporta los 606/607/608; FiscalModule, los parámetros con vigencia
@Module({
  imports: [DgiiModule, FiscalModule],
  controllers: [DgiiReturnsController],
  providers: [DgiiReviewService, DgiiFormsService],
  exports: [DgiiReviewService, DgiiFormsService],
})
export class DgiiReturnsModule {}
