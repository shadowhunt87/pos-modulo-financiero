import { Module } from '@nestjs/common';
import { DgiiController } from './dgii.controller.js';
import { DgiiService } from './dgii.service.js';
import { FiscalModule } from '../fiscal/fiscal.module.js';

// PrismaModule es @Global
@Module({
  imports: [FiscalModule],
  controllers: [DgiiController],
  providers: [DgiiService],
  exports: [DgiiService],
})
export class DgiiModule {}