import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { ChartTemplateService } from './chart-template.service.js';
import { SampleDataService } from './sample-data.service.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { GuidanceService } from './guidance.service.js';
import { PeriodCloseQuery } from './dto/guidance.dto.js';

// Lecturas para todos los roles; las escrituras (plantilla y datos de ejemplo) solo ADMIN.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('guidance')
export class GuidanceController {
  constructor(
    private readonly guidance: GuidanceService,
    private readonly template: ChartTemplateService,
    private readonly samples: SampleDataService,
  ) {}

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

  /** E1b: «Preparar mi contabilidad» (catálogo RD, cuentas automáticas, impuestos enlazados, diarios). */
  @Roles(UserRole.ADMIN)
  @Post('chart-template')
  chartTemplate(@CurrentUser() user: AuthUser) {
    return this.template.apply(user);
  }

  @Get('sample-data')
  sampleStatus(@CurrentUser() user: AuthUser) {
    return this.samples.status(user);
  }

  /** E1c: datos de ejemplo borrables */
  @Roles(UserRole.ADMIN)
  @Post('sample-data')
  loadSamples(@CurrentUser() user: AuthUser) {
    return this.samples.load(user);
  }

  @Roles(UserRole.ADMIN)
  @Delete('sample-data')
  removeSamples(@CurrentUser() user: AuthUser) {
    return this.samples.remove(user);
  }
}
