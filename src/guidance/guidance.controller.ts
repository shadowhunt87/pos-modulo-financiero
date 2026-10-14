import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { GuidanceService } from './guidance.service.js';
import { PeriodCloseQuery } from './dto/guidance.dto.js';

// Solo lecturas, para todos los roles. Las rutas que escriben (chart-template, sample-data)
// las agregan E1b y E1c en este mismo controlador, con sus @Roles.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('guidance')
export class GuidanceController {
  constructor(private readonly guidance: GuidanceService) {}

  @Get('setup-status')
  setupStatus(@CurrentUser() user: AuthUser) {
    return this.guidance.setupStatus(user);
  }

  @Get('invoice-flow/:id')
  invoiceFlow(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.guidance.invoiceFlow(id, user);
  }

  @Get('period-close')
  periodClose(@Query() q: PeriodCloseQuery, @CurrentUser() user: AuthUser) {
    return this.guidance.periodClose(q, user);
  }
}
