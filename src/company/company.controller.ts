import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CompanyService } from './company.service.js';
import { UpdateCompanyDto } from './dto/company.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('company')
export class CompanyController {
  constructor(private readonly company: CompanyService) {}

  @Get()
  get(@CurrentUser() user: AuthUser) {
    return this.company.get(user);
  }

  @Roles(UserRole.ADMIN)
  @Patch()
  update(@Body() dto: UpdateCompanyDto, @CurrentUser() user: AuthUser) {
    return this.company.update(dto, user);
  }
}
