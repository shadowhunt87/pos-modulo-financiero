import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { TaxRatesService } from './tax-rates.service.js';
import { CreateTaxRateDto, ListTaxRatesQuery, UpdateTaxRateDto } from '../dto/tax-rate.dto.js';

const { ADMIN, ACCOUNTANT } = UserRole;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tax-rates')
export class TaxRatesController {
  constructor(private readonly taxes: TaxRatesService) {}

  @Roles(ADMIN, ACCOUNTANT)
  @Post()
  create(@Body() dto: CreateTaxRateDto, @CurrentUser() user: AuthUser) {
    return this.taxes.create(dto, user);
  }

  @Get()
  list(@Query() q: ListTaxRatesQuery, @CurrentUser() user: AuthUser) {
    return this.taxes.list(q, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.taxes.get(id, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTaxRateDto, @CurrentUser() user: AuthUser) {
    return this.taxes.update(id, dto, user);
  }
}
