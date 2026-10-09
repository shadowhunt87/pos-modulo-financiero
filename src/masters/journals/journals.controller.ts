import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { JournalsService } from './journals.service.js';
import { CreateJournalDto, UpdateJournalDto } from '../dto/journal.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('journals')
export class JournalsController {
  constructor(private readonly journals: JournalsService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.journals.list(user);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateJournalDto, @CurrentUser() user: AuthUser) {
    return this.journals.create(dto, user);
  }

  // Declarado antes de :id para que "defaults" no se interprete como id
  @Roles(UserRole.ADMIN)
  @Post('defaults')
  defaults(@CurrentUser() user: AuthUser) {
    return this.journals.createDefaults(user);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateJournalDto, @CurrentUser() user: AuthUser) {
    return this.journals.update(id, dto, user);
  }
}
