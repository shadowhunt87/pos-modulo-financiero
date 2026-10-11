import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { BudgetsService } from './budgets.service.js';
import {
  BudgetVsActualQuery,
  CreateBudgetDto,
  ListBudgetsQuery,
  SetBudgetLinesDto,
  UpdateBudgetDto,
} from './dto/budget.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('budgets')
export class BudgetsController {
  constructor(private readonly budgets: BudgetsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  create(@Body() dto: CreateBudgetDto, @CurrentUser() user: AuthUser) {
    return this.budgets.create(dto, user);
  }

  @Get()
  list(@Query() q: ListBudgetsQuery, @CurrentUser() user: AuthUser) {
    return this.budgets.list(q, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.budgets.get(id, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  update(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateBudgetDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.budgets.update(id, dto, user);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.budgets.remove(id, user);
  }

  @Put(':id/lines')
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  setLines(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetBudgetLinesDto,
    @CurrentUser() user: AuthUser,
  ) {
    return this.budgets.setLines(id, dto, user);
  }

  @Post(':id/approve')
  @Roles(UserRole.ADMIN, UserRole.APPROVER)
  approve(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.budgets.approve(id, user);
  }

  @Post(':id/reopen')
  @Roles(UserRole.ADMIN)
  reopen(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.budgets.reopen(id, user);
  }

  @Post(':id/archive')
  @Roles(UserRole.ADMIN)
  archive(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.budgets.archive(id, user);
  }

  @Get(':id/vs-actual')
  vsActual(
    @Param('id', ParseUUIDPipe) id: string,
    @Query() q: BudgetVsActualQuery,
    @CurrentUser() user: AuthUser,
  ) {
    return this.budgets.vsActual(id, q, user);
  }
}