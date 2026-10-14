import { Module } from '@nestjs/common';
import { FILE_STORAGE, LocalFileStorage } from '../attachments/file-storage.js';
import { InvoicingModule } from '../invoicing/invoicing.module.js';
import { EcfController } from './ecf.controller.js';
import { EcfImportService } from './ecf-import.service.js';
import { EcfConnectionService } from './ecf-connection.service.js';
import { EcfSenderService } from './ecf-sender.service.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';

// El XML se guarda con el mismo almacenamiento que los adjuntos (UPLOADS_DIR), sin tocar AttachmentsModule
@Module({
  imports: [InvoicingModule, FiscalModule],
  controllers: [EcfController],
  providers: [EcfImportService, EcfConnectionService, EcfSenderService, { provide: FILE_STORAGE, useClass: LocalFileStorage }],
  exports: [EcfConnectionService, EcfSenderService],
})
export class EcfModule {}
