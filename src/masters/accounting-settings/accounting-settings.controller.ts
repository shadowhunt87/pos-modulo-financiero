import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { AccountingSettingsService } from './accounting-settings.service.js';
import { UpdateAccountingSettingsDto } from '../dto/accounting-settings.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('settings/accounting')
export class AccountingSettingsController {
  constructor(private readonly settings: AccountingSettingsService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.settings.get(user);
  }

  @Roles(UserRole.ADMIN)
  @Put()
  update(@Body() dto: UpdateAccountingSettingsDto, @CurrentUser() user: AuthUser) {
    return this.settings.update(dto, user);
  }
}
