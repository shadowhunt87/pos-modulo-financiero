import { Global, Module } from '@nestjs/common';
import { ServiceKeyAuth } from './service-key-auth.js';
import { ServiceKeysController } from './service-keys.controller.js';
import { ServiceKeysService } from './service-keys.service.js';

// Global: JwtAuthGuard (que usan todos los módulos) necesita ServiceKeyAuth
@Global()
@Module({
  controllers: [ServiceKeysController],
  providers: [ServiceKeyAuth, ServiceKeysService],
  exports: [ServiceKeyAuth],
})
export class ServiceKeysModule {}
