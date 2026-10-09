import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { ReceivablesPayablesService } from './receivables-payables.service.js';
import { AgingQuery, ApplyCreditDto, StatementQuery } from './dto/receivables.dto.js';

const { ADMIN, ACCOUNTANT } = UserRole;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('receivables-payables')
export class ReceivablesPayablesController {
  constructor(private readonly rp: ReceivablesPayablesService) {}

  @Get('statements/:partnerId')
  statement(@Param('partnerId', ParseUUIDPipe) partnerId: string, @Query() q: StatementQuery, @CurrentUser() user: AuthUser) {
    return this.rp.statement(partnerId, q, user);
  }

  @Get('aging')
  aging(@Query() q: AgingQuery, @CurrentUser() user: AuthUser) {
    return this.rp.aging(q, user);
  }

  @Roles(ADMIN)
  @Post('mark-overdue')
  markOverdue(@CurrentUser() user: AuthUser) {
    return this.rp.markOverdue(user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Post('apply-credit')
  applyCredit(@Body() dto: ApplyCreditDto, @CurrentUser() user: AuthUser) {
    return this.rp.applyCredit(dto, user);
  }
}