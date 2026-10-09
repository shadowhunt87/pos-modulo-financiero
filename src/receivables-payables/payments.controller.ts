import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PaymentsService } from './payments.service.js';
import { AllocatePaymentDto, CreatePaymentDto, ListPaymentsQuery, VoidPaymentDto } from './dto/payment.dto.js';

const { ADMIN, ACCOUNTANT, APPROVER } = UserRole;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Roles(ADMIN, ACCOUNTANT)
  @Post()
  create(@Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.create(dto, user);
  }

  @Get()
  list(@Query() q: ListPaymentsQuery, @CurrentUser() user: AuthUser) {
    return this.payments.list(q, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payments.get(id, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Post(':id/allocate')
  allocate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AllocatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.allocate(id, dto, user);
  }

  @Roles(ADMIN, APPROVER)
  @Post(':id/void')
  void(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidPaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.void(id, dto, user);
  }
}