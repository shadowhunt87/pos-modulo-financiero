import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MulterModule } from '@nestjs/platform-express';
import { AttachmentsController } from './attachments.controller.js';
import { AttachmentsService } from './attachments.service.js';
import { FILE_STORAGE, LocalFileStorage } from './file-storage.js';

// PrismaModule es @Global
@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        limits: { fileSize: (config.get<number>('MAX_UPLOAD_MB') ?? 10) * 1024 * 1024, files: 1 },
      }),
    }),
  ],
  controllers: [AttachmentsController],
  providers: [AttachmentsService, { provide: FILE_STORAGE, useClass: LocalFileStorage }],
  exports: [AttachmentsService],
})
export class AttachmentsModule {}
