import { Controller, Get, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { API_VERSION, CONTRACT_VERSION } from './version.js';

// Para los sistemas que se integran (INTEGRACION-TALLER F3): comprueban la versión antes de llamar
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('meta')
export class MetaController {
  @Get('version')
  version() {
    return { name: 'finanzas', apiVersion: API_VERSION, contract: CONTRACT_VERSION, serverTime: new Date().toISOString() };
  }
}
