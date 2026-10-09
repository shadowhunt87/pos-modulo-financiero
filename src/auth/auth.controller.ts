import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { Roles } from './decorators/roles.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthUser } from './types/auth-user.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  // Solo ADMIN. El usuario nuevo se crea en la empresa del admin (sale del JWT).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('register')
  register(@Body() dto: RegisterDto, @CurrentUser() admin: AuthUser) {
    return this.authService.register(dto, admin.companyId);
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: AuthUser) {
    return user;
  }
}
