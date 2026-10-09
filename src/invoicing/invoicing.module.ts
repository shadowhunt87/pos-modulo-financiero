import { Module } from '@nestjs/common';
import { MastersModule } from '../masters/masters.module.js';
import { PostingModule } from '../posting/posting.module.js';
import { InvoicingController } from './invoicing.controller.js';
import { InvoicingService } from './invoicing.service.js';

@Module({
  imports: [MastersModule, PostingModule],
  controllers: [InvoicingController],
  providers: [InvoicingService],
  exports: [InvoicingService], // receivables-payables necesita consultar y actualizar saldos
})
export class InvoicingModule {}