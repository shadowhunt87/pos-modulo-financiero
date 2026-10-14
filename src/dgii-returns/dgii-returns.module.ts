import { Module } from '@nestjs/common';
import { DgiiModule } from '../dgii/dgii.module.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';
import { DgiiReturnsController } from './dgii-returns.controller.js';
import { DgiiReviewService } from './review.service.js';

// PrismaModule es @Global. DgiiModule exporta los 606/607/608; FiscalModule, los parámetros con vigencia
@Module({
  imports: [DgiiModule, FiscalModule],
  controllers: [DgiiReturnsController],
  providers: [DgiiReviewService],
  exports: [DgiiReviewService],
})
export class DgiiReturnsModule {}
