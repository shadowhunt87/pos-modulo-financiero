import { Module } from '@nestjs/common';
import { MastersModule } from '../masters/masters.module.js';
import { PostingModule } from '../posting/posting.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';
import { ReceivablesPayablesController } from './receivables-payables.controller.js';
import { ReceivablesPayablesService } from './receivables-payables.service.js';

@Module({
  imports: [MastersModule, PostingModule],
  controllers: [PaymentsController, ReceivablesPayablesController],
  providers: [PaymentsService, ReceivablesPayablesService],
  exports: [PaymentsService, ReceivablesPayablesService], // tesorería usará los pagos para conciliar
})
export class ReceivablesPayablesModule {}