import { Module } from '@nestjs/common';
import { MastersModule } from '../../masters/masters.module.js';
import { PostingModule } from '../../posting/posting.module.js';
import { InvoicingModule } from '../../invoicing/invoicing.module.js';
import { ReceivablesPayablesModule } from '../../receivables-payables/receivables-payables.module.js';
import { FiscalModule } from '../../fiscal/fiscal.module.js';
import { InventoryModule } from '../../inventory/inventory.module.js';
import { PosController } from './pos.controller.js';
import { PosConfigService } from './pos-config.service.js';
import { PosSalesService } from './pos-sales.service.js';
import { PosShiftsService } from './pos-shifts.service.js';
import { PosStoreController } from './pos-store.controller.js';
import { PosStoreService } from './pos-store.service.js';

/** Vertical «pos» (docs/PLAN-POS.md): caja y tienda (productos, inventario, compras, clientes y facturas). Usa facturas, cobros, NCF, inventario y asientos del núcleo por sus servicios. */
@Module({
  imports: [MastersModule, PostingModule, InvoicingModule, ReceivablesPayablesModule, FiscalModule, InventoryModule],
  controllers: [PosController, PosStoreController],
  providers: [PosConfigService, PosShiftsService, PosSalesService, PosStoreService],
})
export class PosModule {}
