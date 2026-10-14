import { Body, Controller, Get, Post, Req, Res, UseGuards } from '@nestjs/common';
import type { Request, Response } from 'express';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { AttemptLimiter, TooManyAttemptsException } from '../auth/attempt-limiter.js';
import { TwoFactorService } from '../auth/two-factor/two-factor.service.js';
import { ipOf, metaOf } from '../auth/two-factor/request-meta.js';
import { contentDisposition } from '../attachments/file-type.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DataExportService } from './data-export.service.js';
import { DataExportDto } from './dto.js';

const PER_HOUR = 3;

// Exportación completa (ANEXO-S0 §4.6): solo ADMIN, con confirmación reforzada, 3 por hora, una a la vez en el servidor
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('data-export')
export class DataExportController {
  constructor(
    private readonly exporter: DataExportService,
    private readonly twoFactor: TwoFactorService,
    private readonly limiter: AttemptLimiter,
    private readonly prisma: PrismaService,
  ) {}

  @Roles(UserRole.ADMIN)
  @Get('summary')
  summary(@CurrentUser() user: AuthUser) {
    return this.exporter.summary(user.companyId);
  }

  @Roles(UserRole.ADMIN)
  @Post()
  async export(@Body() dto: DataExportDto, @CurrentUser() user: AuthUser, @Req() req: Request, @Res() res: Response) {
    if (!this.exporter.tryAcquire()) throw new TooManyAttemptsException(60, 'Ya hay una exportación en curso. Espera unos minutos y vuelve a intentarlo.');
    try {
      await this.twoFactor.confirmActor(user, dto.confirmPassword, dto.confirmCode, ipOf(req), metaOf(req));
      const wait = this.limiter.consume([{ key: `export:company:${user.companyId}`, limit: PER_HOUR, windowMs: 60 * 60_000 }]);
      if (wait > 0) throw new TooManyAttemptsException(wait, `Ya exportaste ${PER_HOUR} veces en la última hora. Intenta de nuevo en ${Math.ceil(wait / 60)} minuto(s).`);
      const company = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { taxId: true } });
      const ctx = { companyId: user.companyId, actor: user, via: 'API' as const, purpose: dto.purpose ?? 'ON_DEMAND', meta: metaOf(req) };
      const exportId = await this.exporter.start(ctx);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', contentDisposition(this.exporter.fileName(company.taxId)));
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('X-Accel-Buffering', 'no'); // nginx/NPM: no guardar la respuesta en disco (§4.5, M1)
      res.status(200);
      await this.exporter.stream(res, ctx, exportId).catch(() => undefined); // la bitácora ya anotó el fallo
    } finally {
      this.exporter.release();
    }
  }
}
