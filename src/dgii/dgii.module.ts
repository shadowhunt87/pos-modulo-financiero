import { Module } from '@nestjs/common';
import { DgiiController } from './dgii.controller.js';
import { DgiiService } from './dgii.service.js';

// PrismaModule es @Global
@Module({
  controllers: [DgiiController],
  providers: [DgiiService],
  exports: [DgiiService],
})
export class DgiiModule {}