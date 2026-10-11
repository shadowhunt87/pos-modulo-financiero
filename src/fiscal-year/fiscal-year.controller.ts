import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { FiscalYearService } from './fiscal-year.service.js';
import { CreateFiscalYearDto, OpeningBalanceDto, ReopenFiscalYearDto } from './dto/fiscal-year.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class FiscalYearController {
  constructor(private readonly years: FiscalYearService) {}

  @Roles(UserRole.ADMIN)
  @Post('fiscal-years')
  create(@Body() dto: CreateFiscalYearDto, @CurrentUser() user: AuthUser) {
    return this.years.create(dto, user);
  }

  @Get('fiscal-years')
  list(@CurrentUser() user: AuthUser) {
    return this.years.list(user);
  }

  @Get('fiscal-years/:id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.years.get(id, user);
  }

  @Get('fiscal-years/:id/closing-preview')
  preview(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.years.closingPreview(id, user);
  }

  @Roles(UserRole.ADMIN)
  @Post('fiscal-years/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.years.close(id, user);
  }

  @Roles(UserRole.ADMIN)
  @Post('fiscal-years/:id/reopen')
  reopen(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: ReopenFiscalYearDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.years.reopen(id, dto, user);
  }

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post('opening-balances')
  createOpening(@Body() dto: OpeningBalanceDto, @CurrentUser() user: AuthUser) {
    return this.years.createOpeningBalances(dto, user);
  }

  @Get('opening-balances')
  getOpening(@CurrentUser() user: AuthUser) {
    return this.years.getOpeningBalances(user);
  }
}