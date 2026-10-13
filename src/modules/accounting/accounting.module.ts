import { Module } from '@nestjs/common';
import { MastersModule } from '../../masters/masters.module.js';
import { PostingModule } from '../../posting/posting.module.js';
import { AccountingController } from './accounting.controller.js';
import { AccountingService } from './accounting.service.js';

// PrismaModule es @Global, no hace falta importarlo aquí.
@Module({
  imports: [MastersModule, PostingModule],
  controllers: [AccountingController],
  providers: [AccountingService],
  exports: [AccountingService], // facturación y tesorería van a crear asientos con este service
})
export class AccountingModule {}
