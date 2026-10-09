import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { TreasuryService } from './treasury.service.js';
import {
  AddTransactionDto, CategorizeDto, CreateBankAccountDto, CreateBankRuleDto, CreateCashRegisterDto, ImportStatementDto,
  ListBankRulesQuery, ListTransactionsQuery, TransferDto, UpdateBankAccountDto, UpdateBankRuleDto, UpdateCashRegisterDto,
} from './dto/treasury.dto.js';

const { ADMIN, ACCOUNTANT } = UserRole;
const uuid = () => new ParseUUIDPipe();

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller()
export class TreasuryController {
  constructor(private readonly treasury: TreasuryService) {}

  // ---- Cuentas bancarias ----
  @Roles(ADMIN) @Post('bank-accounts')
  createBank(@Body() dto: CreateBankAccountDto, @CurrentUser() u: AuthUser) { return this.treasury.createBankAccount(dto, u); }

  @Get('bank-accounts')
  listBanks(@CurrentUser() u: AuthUser) { return this.treasury.listBankAccounts(u); }

  @Get('bank-accounts/:id')
  getBank(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.treasury.getBankAccount(id, u); }

  @Roles(ADMIN) @Patch('bank-accounts/:id')
  updateBank(@Param('id', uuid()) id: string, @Body() dto: UpdateBankAccountDto, @CurrentUser() u: AuthUser) { return this.treasury.updateBankAccount(id, dto, u); }

  // ---- Movimientos ----
  @Roles(ADMIN, ACCOUNTANT) @Post('bank-accounts/:id/transactions')
  addTx(@Param('id', uuid()) id: string, @Body() dto: AddTransactionDto, @CurrentUser() u: AuthUser) { return this.treasury.addTransaction(id, dto, u); }

  @Get('bank-accounts/:id/transactions')
  listTx(@Param('id', uuid()) id: string, @Query() q: ListTransactionsQuery, @CurrentUser() u: AuthUser) { return this.treasury.listTransactions(id, q, u); }

  @Roles(ADMIN, ACCOUNTANT) @Post('bank-accounts/:id/import')
  importStatement(@Param('id', uuid()) id: string, @Body() dto: ImportStatementDto, @CurrentUser() u: AuthUser) { return this.treasury.importStatement(id, dto, u); }

  @Roles(ADMIN, ACCOUNTANT) @Post('bank-accounts/:id/apply-rules')
  applyRules(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.treasury.applyRules(id, u); }

  @Roles(ADMIN, ACCOUNTANT) @Post('bank-transactions/:id/categorize')
  categorize(@Param('id', uuid()) id: string, @Body() dto: CategorizeDto, @CurrentUser() u: AuthUser) { return this.treasury.categorize(id, dto, u); }

  @Roles(ADMIN, ACCOUNTANT) @Post('bank-transactions/:id/ignore')
  ignore(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.treasury.ignoreTransaction(id, true, u); }

  @Roles(ADMIN, ACCOUNTANT) @Post('bank-transactions/:id/restore')
  restore(@Param('id', uuid()) id: string, @CurrentUser() u: AuthUser) { return this.treasury.ignoreTransaction(id, false, u); }

  // ---- Reglas ----
  @Roles(ADMIN) @Post('bank-rules')
  createRule(@Body() dto: CreateBankRuleDto, @CurrentUser() u: AuthUser) { return this.treasury.createRule(dto, u); }

  @Get('bank-rules')
  listRules(@Query() q: ListBankRulesQuery, @CurrentUser() u: AuthUser) { return this.treasury.listRules(q, u); }

  @Roles(ADMIN) @Patch('bank-rules/:id')
  updateRule(@Param('id', uuid()) id: string, @Body() dto: UpdateBankRuleDto, @CurrentUser() u: AuthUser) { return this.treasury.updateRule(id, dto, u); }

  // ---- Cajas ----
  @Roles(ADMIN) @Post('cash-registers')
  createCash(@Body() dto: CreateCashRegisterDto, @CurrentUser() u: AuthUser) { return this.treasury.createCashRegister(dto, u); }

  @Get('cash-registers')
  listCash(@CurrentUser() u: AuthUser) { return this.treasury.listCashRegisters(u); }

  @Roles(ADMIN) @Patch('cash-registers/:id')
  updateCash(@Param('id', uuid()) id: string, @Body() dto: UpdateCashRegisterDto, @CurrentUser() u: AuthUser) { return this.treasury.updateCashRegister(id, dto, u); }

  // ---- Transferencias ----
  @Roles(ADMIN, ACCOUNTANT) @Post('treasury/transfers')
  transfer(@Body() dto: TransferDto, @CurrentUser() u: AuthUser) { return this.treasury.transfer(dto, u); }
}