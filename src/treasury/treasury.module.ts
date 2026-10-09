import { Module } from '@nestjs/common';
import { PostingModule } from '../posting/posting.module.js';
import { BankReconciliationController } from './bank-reconciliation.controller.js';
import { BankReconciliationService } from './bank-reconciliation.service.js';
import { TreasuryController } from './treasury.controller.js';
import { TreasuryService } from './treasury.service.js';

@Module({
  imports: [PostingModule],
  controllers: [TreasuryController, BankReconciliationController],
  providers: [TreasuryService, BankReconciliationService],
  exports: [TreasuryService, BankReconciliationService],
})
export class TreasuryModule {}