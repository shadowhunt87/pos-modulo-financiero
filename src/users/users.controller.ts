import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ipOf, metaOf } from '../auth/two-factor/request-meta.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import {
  ChangePasswordDto, ListUsersQuery, ResetPasswordDto, ResetTwoFactorDto, SecurityEventsQuery, UpdateProfileDto, UpdateUserDto,
} from './dto/users.dto.js';
import { UsersService } from './users.service.js';

// Crear usuarios sigue siendo POST /auth/register (ADMIN).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // ---- Cuenta propia (cualquier rol). Van antes que ':id' ----
  @Patch('me')
  updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() me: AuthUser) {
    return this.users.updateProfile(dto, me);
  }

  @Post('me/change-password')
  changePassword(@Body() dto: ChangePasswordDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    return this.users.changePassword(dto, me, ipOf(req), metaOf(req));
  }

  // ---- Administración (ADMIN) ----
  @Roles(UserRole.ADMIN)
  @Get()
  list(@Query() q: ListUsersQuery, @CurrentUser() user: AuthUser) {
    return this.users.list(q, user);
  }

  // Antes que ':id' (ParseUUIDPipe rechazaría el texto)
  @Roles(UserRole.ADMIN)
  @Get('security-events')
  securityEvents(@Query() q: SecurityEventsQuery, @CurrentUser() user: AuthUser) {
    return this.users.securityEvents(q, user);
  }

  @Roles(UserRole.ADMIN)
  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.users.get(id, user);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.users.update(id, dto, user, ipOf(req), metaOf(req));
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/reset-password')
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.users.resetPassword(id, dto, user, ipOf(req), metaOf(req));
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/reset-two-factor')
  resetTwoFactor(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetTwoFactorDto, @CurrentUser() user: AuthUser, @Req() req: Request) {
    return this.users.resetTwoFactor(id, dto, user, ipOf(req), metaOf(req));
  }
}
