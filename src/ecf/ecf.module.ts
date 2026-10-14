import { Module } from '@nestjs/common';
import { FILE_STORAGE, LocalFileStorage } from '../attachments/file-storage.js';
import { InvoicingModule } from '../invoicing/invoicing.module.js';
import { EcfController } from './ecf.controller.js';
import { EcfImportService } from './ecf-import.service.js';

// El XML se guarda con el mismo almacenamiento que los adjuntos (UPLOADS_DIR), sin tocar AttachmentsModule
@Module({
  imports: [InvoicingModule],
  controllers: [EcfController],
  providers: [EcfImportService, { provide: FILE_STORAGE, useClass: LocalFileStorage }],
})
export class EcfModule {}
