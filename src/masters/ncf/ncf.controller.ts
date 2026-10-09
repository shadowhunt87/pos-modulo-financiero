import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { NcfService } from './ncf.service.js';
import { CreateNcfSequenceDto, RenewNcfSequenceDto, UpdateNcfSequenceDto } from '../dto/ncf.dto.js';

const { ADMIN } = UserRole;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ncf')
export class NcfController {
  constructor(private readonly ncf: NcfService) {}

  @Get('types')
  types() {
    return this.ncf.catalog();
  }

  @Roles(ADMIN)
  @Post('sequences')
  create(@Body() dto: CreateNcfSequenceDto, @CurrentUser() user: AuthUser) {
    return this.ncf.createSequence(dto, user);
  }

  @Get('sequences')
  list(@CurrentUser() user: AuthUser) {
    return this.ncf.listSequences(user);
  }

  @Roles(ADMIN)
  @Patch('sequences/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateNcfSequenceDto, @CurrentUser() user: AuthUser) {
    return this.ncf.updateSequence(id, dto, user);
  }

  @Roles(ADMIN)
  @Post('sequences/:id/renew')
  renew(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RenewNcfSequenceDto, @CurrentUser() user: AuthUser) {
    return this.ncf.renewSequence(id, dto, user);
  }
}
