import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { DataExportController } from './data-export.controller.js';
import { DataExportService } from './data-export.service.js';

// PrismaModule es @Global. AuthModule: confirmación reforzada y límite; AttachmentsModule: FILE_STORAGE
@Module({
  imports: [AuthModule, AttachmentsModule],
  controllers: [DataExportController],
  providers: [DataExportService],
  exports: [DataExportService],
})
export class DataExportModule {}
