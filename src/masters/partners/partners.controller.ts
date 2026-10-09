import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PartnersService } from './partners.service.js';
import { CreatePartnerDto, ListPartnersQuery, UpdatePartnerDto } from '../dto/partner.dto.js';

const { ADMIN, ACCOUNTANT } = UserRole;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('partners')
export class PartnersController {
  constructor(private readonly partners: PartnersService) {}

  @Roles(ADMIN, ACCOUNTANT)
  @Post()
  create(@Body() dto: CreatePartnerDto, @CurrentUser() user: AuthUser) {
    return this.partners.create(dto, user);
  }

  @Get()
  list(@Query() q: ListPartnersQuery, @CurrentUser() user: AuthUser) {
    return this.partners.list(q, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.partners.get(id, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePartnerDto, @CurrentUser() user: AuthUser) {
    return this.partners.update(id, dto, user);
  }
}
