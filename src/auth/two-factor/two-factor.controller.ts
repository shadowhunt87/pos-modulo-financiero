import { Body, Controller, Get, Header, HttpCode, Post, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { CurrentUser } from '../decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../guards/jwt-auth.guard.js';
import { RolesGuard } from '../guards/roles.guard.js';
import type { AuthUser } from '../types/auth-user.js';
import { AuthService } from '../auth.service.js';
import { TwoFactorService } from './two-factor.service.js';
import { ConfirmTwoFactorDto, EnableTwoFactorDto, SetupTwoFactorDto } from './dto.js';
import { ipOf, metaOf } from './request-meta.js';

// Cuenta propia (cualquier rol): ANEXO-S0 §3.7 E4-E8. Las respuestas con secreto, QR o códigos no se guardan en caché.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users/me/two-factor')
export class TwoFactorController {
  constructor(private readonly twoFactor: TwoFactorService, private readonly auth: AuthService) {}

  @Get()
  status(@CurrentUser() me: AuthUser) {
    return this.twoFactor.status(me);
  }

  @Post('setup')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  setup(@Body() dto: SetupTwoFactorDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    return this.twoFactor.setup(me, dto.password, dto.code, ipOf(req), metaOf(req));
  }

  @Post('enable')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async enable(@Body() dto: EnableTwoFactorDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    const recoveryCodes = await this.twoFactor.enable(me, dto.code, ipOf(req), metaOf(req));
    return { access_token: (await this.auth.issueTokenFor(me.id)).access_token, recoveryCodes };
  }

  @Post('disable')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async disable(@Body() dto: ConfirmTwoFactorDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    await this.twoFactor.disable(me, dto.password, dto.code, ipOf(req), metaOf(req));
    return { access_token: (await this.auth.issueTokenFor(me.id)).access_token };
  }

  @Post('recovery-codes')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  async regenerate(@Body() dto: ConfirmTwoFactorDto, @CurrentUser() me: AuthUser, @Req() req: Request) {
    return { recoveryCodes: await this.twoFactor.regenerate(me, dto.password, dto.code, ipOf(req), metaOf(req)) };
  }
}
