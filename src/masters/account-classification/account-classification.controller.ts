import { Body, Controller, Get, Post, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { AccountClassificationService } from './account-classification.service.js';
import { AutoClassifyDto, BulkClassificationDto } from '../dto/account-classification.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('account-classification')
export class AccountClassificationController {
  constructor(private readonly svc: AccountClassificationService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.svc.list(user);
  }

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Put()
  update(@Body() dto: BulkClassificationDto, @CurrentUser() user: AuthUser) {
    return this.svc.bulkUpdate(dto, user);
  }

  // Propone la clasificación por nombre; con { "apply": true } la guarda
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post('auto')
  auto(@Body() dto: AutoClassifyDto, @CurrentUser() user: AuthUser) {
    return this.svc.autoClassify(dto, user);
  }
}