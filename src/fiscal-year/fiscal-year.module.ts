import { Module } from '@nestjs/common';
import { MastersModule } from '../masters/masters.module.js';
import { PostingModule } from '../posting/posting.module.js';
import { FiscalYearController } from './fiscal-year.controller.js';
import { FiscalYearService } from './fiscal-year.service.js';

// PrismaModule es @Global
@Module({
  imports: [MastersModule, PostingModule],
  controllers: [FiscalYearController],
  providers: [FiscalYearService],
  exports: [FiscalYearService],
})
export class FiscalYearModule {}