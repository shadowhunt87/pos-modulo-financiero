import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { BankReconciliationService } from './bank-reconciliation.service.js';
import { CreateReconciliationDto, ListReconciliationsQuery, MatchTransactionDto, SuggestionsQuery } from './dto/reconciliation.dto.js';

const { ADMIN, ACCOUNTANT, APPROVER } = UserRole;
const uuid = () => new ParseUUIDPipe();

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class BankReconciliationController {
  constructor(private readonly rec: BankReconciliationService) {}

  // ---- Enlace de movimientos con asientos ----
  @Get('bank-accounts/:id/suggestions')
  suggestions(@Param('id', uuid()) id: string, @Query() q: SuggestionsQuery, @CurrentUser() u: AuthUser) { return this.rec.suggestions(id, q.days, u); }

  @Roles(ADMIN, ACCOUNTANT, APPROVER) @Post('bank-accounts/:id/auto-match')
  autoMatch(@Param('id', uuid()) id: string, @Query() q: SuggestionsQuery, @CurrentUser() u: AuthUser) { return this.rec.autoMatch(id, q.days, u); }

  @Roles(ADMIN, ACCOUNTANT, APPROVER) @Post('bank-transactions/:id/match')
  match(@Param('id', uuid()) id: string, @Body() dto: MatchTransactionDto, @CurrentUser() u: AuthUser) { return this.rec.match(id, dto, u); }

  @Roles(ADMIN, ACCOUNTANT, APPROVER) @Post('bank-transactions/:id/unmatch')
  unmatch(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.rec.unmatch(id, u); }

  // ---- Conciliaciones ----
  @Roles(ADMIN, ACCOUNTANT, APPROVER) @Post('bank-reconciliations')
  create(@Body() dto: CreateReconciliationDto, @CurrentUser() u: AuthUser) { return this.rec.create(dto, u); }

  @Get('bank-reconciliations')
  list(@Query() q: ListReconciliationsQuery, @CurrentUser() u: AuthUser) { return this.rec.list(q, u); }

  @Get('bank-reconciliations/:id')
  get(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.rec.get(id, u); }

  // Quien concilia y quien aprueba: ACCOUNTANT prepara, APPROVER/ADMIN cierran
  @Roles(ADMIN, APPROVER) @Post('bank-reconciliations/:id/complete')
  complete(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.rec.complete(id, u); }

  @Roles(ADMIN) @Post('bank-reconciliations/:id/reopen')
  reopen(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.rec.reopen(id, u); }

  @Roles(ADMIN, ACCOUNTANT) @Delete('bank-reconciliations/:id')
  remove(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.rec.remove(id, u); }
}