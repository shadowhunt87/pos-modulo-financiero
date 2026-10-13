import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { AccountingService } from './accounting.service.js';
import { CreateAccountDto } from '../dto/create-account.dto.js';
import { UpdateAccountDto } from '../dto/update-account.dto.js';
import { CreateJournalEntryDto, UpdateJournalEntryDto } from '../dto/create-journal-entry.dto.js';
import { VoidJournalEntryDto } from '../dto/void-journal-entry.dto.js';
import { CreateFiscalPeriodDto } from '../dto/create-fiscal-period.dto.js';
import {
  DateRangeQuery,
  ListAccountsQuery,
  ListJournalEntriesQuery,
} from '../dto/accounting-queries.dto.js';

const { ADMIN, ACCOUNTANT, APPROVER } = UserRole;

// Lectura: cualquier usuario autenticado de la empresa.
// Escritura: según @Roles(...) en cada endpoint.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('accounting')
export class AccountingController {
  constructor(private readonly accounting: AccountingService) {}

  // ---- Plan de cuentas ----
  @Roles(ADMIN, ACCOUNTANT)
  @Post('accounts')
  createAccount(@Body() dto: CreateAccountDto, @CurrentUser() user: AuthUser) {
    return this.accounting.createAccount(dto, user);
  }

  @Get('accounts')
  listAccounts(@Query() query: ListAccountsQuery, @CurrentUser() user: AuthUser) {
    return this.accounting.listAccounts(query, user);
  }

  @Get('accounts/:id')
  getAccount(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.accounting.getAccount(id, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Patch('accounts/:id')
  updateAccount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateAccountDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accounting.updateAccount(id, dto, user);
  }

  // ---- Períodos fiscales (solo ADMIN escribe) ----
  @Roles(ADMIN)
  @Post('fiscal-periods')
  createFiscalPeriod(@Body() dto: CreateFiscalPeriodDto, @CurrentUser() user: AuthUser) {
    return this.accounting.createFiscalPeriod(dto, user);
  }

  @Get('fiscal-periods')
  listFiscalPeriods(@CurrentUser() user: AuthUser) {
    return this.accounting.listFiscalPeriods(user);
  }

  @Roles(ADMIN)
  @Post('fiscal-periods/:id/close')
  closeFiscalPeriod(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.accounting.closeFiscalPeriod(id, user);
  }

  @Roles(ADMIN)
  @Post('fiscal-periods/:id/reopen')
  reopenFiscalPeriod(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.accounting.reopenFiscalPeriod(id, user);
  }

  // ---- Asientos ----
  @Roles(ADMIN, ACCOUNTANT)
  @Post('journal-entries')
  createJournalEntry(@Body() dto: CreateJournalEntryDto, @CurrentUser() user: AuthUser) {
    return this.accounting.createJournalEntry(dto, user);
  }

  @Get('journal-entries')
  listJournalEntries(@Query() query: ListJournalEntriesQuery, @CurrentUser() user: AuthUser) {
    return this.accounting.listJournalEntries(query, user);
  }

  @Get('journal-entries/:id')
  getJournalEntry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.accounting.getJournalEntry(id, user);
  }

  // Corregir un borrador o un asiento rechazado (queda otra vez pendiente)
  @Roles(ADMIN, ACCOUNTANT)
  @Patch('journal-entries/:id')
  updateJournalEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateJournalEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accounting.updateJournalEntry(id, dto, user);
  }

  // Aprobar: APPROVER o ADMIN, nunca quien creó el asiento
  @Roles(ADMIN, APPROVER)
  @Post('journal-entries/:id/approve')
  approveJournalEntry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.accounting.approveJournalEntry(id, user);
  }

  @Roles(ADMIN, APPROVER, ACCOUNTANT)
  @Post('journal-entries/:id/reject')
  rejectJournalEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidJournalEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accounting.rejectJournalEntry(id, dto.reason, user);
  }

  @Roles(ADMIN, APPROVER)
  @Post('journal-entries/:id/void')
  voidJournalEntry(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: VoidJournalEntryDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.accounting.voidJournalEntry(id, dto.reason, user, dto.reverseOn);
  }

  // ---- Reportes base ----
  @Get('trial-balance')
  trialBalance(@Query() query: DateRangeQuery, @CurrentUser() user: AuthUser) {
    return this.accounting.trialBalance(query, user);
  }
}
