import { Body, Controller, Get, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { UserRole } from '../generated/prisma/enums.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { RolesGuard } from './guards/roles.guard.js';
import { Roles } from './decorators/roles.decorator.js';
import { CurrentUser } from './decorators/current-user.decorator.js';
import type { AuthUser } from './types/auth-user.js';
import { TwoFactorService } from './two-factor/two-factor.service.js';
import { EnrollStartDto, LoginTwoFactorDto } from './two-factor/dto.js';
import { ipOf, metaOf } from './two-factor/request-meta.js';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService, private readonly twoFactor: TwoFactorService) {}

  @Post('login')
  @Header('Cache-Control', 'no-store')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.authService.login(dto, req.ip ?? 'unknown');
  }

  // Segundo paso con el desafío del login (ANEXO-S0 3.7 E2). Sin JWT: el desafío no sirve como sesión.
  @Post('login/2fa')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  loginTwoFactor(@Body() dto: LoginTwoFactorDto, @Req() req: Request) {
    return this.authService.loginSecondStep(dto.challengeToken, dto.code, ipOf(req), metaOf(req));
  }

  // Inscripción obligatoria en el login (E3): QR del secreto pendiente
  @Post('login/2fa/enroll')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  enrollStart(@Body() dto: EnrollStartDto, @Req() req: Request) {
    return this.twoFactor.enrollStart(dto.challengeToken, ipOf(req));
  }

  // Solo ADMIN. El usuario nuevo se crea en la empresa del admin (sale del JWT).
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.ADMIN)
  @Post('register')
  register(@Body() dto: RegisterDto, @CurrentUser() admin: AuthUser, @Req() req: Request) {
    return this.authService.register(dto, admin, ipOf(req), metaOf(req));
  }

  @UseGuards(JwtAuthGuard)
  @Get('me')
  getProfile(@CurrentUser() user: AuthUser) {
    return user;
  }
}
