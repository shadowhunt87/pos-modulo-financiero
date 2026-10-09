import { Module } from '@nestjs/common';
import { AccountingController } from './accounting.controller.js';
import { AccountingService } from './accounting.service.js';

// PrismaModule es @Global, no hace falta importarlo aquí.
@Module({
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService], // facturación y tesorería van a crear asientos con este service
})
export class AccountingModule {}
