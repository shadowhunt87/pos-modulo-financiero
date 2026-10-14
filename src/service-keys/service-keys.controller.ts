import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { ServiceKeysService } from './service-keys.service.js';
import { CreateServiceKeyDto } from './dto/service-keys.dto.js';

// Todo solo ADMIN, también la lista (como /users): son credenciales de la empresa
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('service-keys')
export class ServiceKeysController {
  constructor(private readonly keys: ServiceKeysService) {}

  @Roles(UserRole.ADMIN)
  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.keys.list(user);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  create(@Body() dto: CreateServiceKeyDto, @CurrentUser() user: AuthUser) {
    return this.keys.create(dto, user);
  }

  @Roles(UserRole.ADMIN)
  @Post(':id/revoke')
  revoke(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.keys.revoke(id, user);
  }
}
