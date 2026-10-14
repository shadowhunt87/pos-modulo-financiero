import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { ConfigService } from '@nestjs/config';
import { AttachmentsModule } from '../attachments/attachments.module.js';
import { AuditingController } from './auditing.controller.js';
import { AuditingService } from './auditing.service.js';
import { ReviewService } from './review.service.js';

// PrismaModule es @Global. AttachmentsModule exporta FILE_STORAGE (misma carpeta UPLOADS_DIR)
@Module({
  imports: [
    AttachmentsModule,
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({ limits: { fileSize: (config.get<number>('MAX_UPLOAD_MB') ?? 10) * 1024 * 1024, files: 1 } }),
    }),
  ],
  controllers: [AuditingController],
  providers: [AuditingService, ReviewService],
})
export class AuditingModule {}
