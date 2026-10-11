import { Controller, Get, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { DgiiPeriodQuery } from './dto/dgii.dto.js';
import { DgiiService } from './dgii.service.js';

// Solo lectura: cualquier rol de la empresa puede consultar y descargar.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dgii')
export class DgiiController {
  constructor(private readonly dgii: DgiiService) {}

  @Get('606')
  r606(@Query() q: DgiiPeriodQuery, @CurrentUser() user: AuthUser) {
    return this.dgii.report606(q.period, user);
  }

  @Get('607')
  r607(@Query() q: DgiiPeriodQuery, @CurrentUser() user: AuthUser) {
    return this.dgii.report607(q.period, user);
  }

  @Get('608')
  r608(@Query() q: DgiiPeriodQuery, @CurrentUser() user: AuthUser) {
    return this.dgii.report608(q.period, user);
  }

  /** Archivo listo para subir a la Oficina Virtual: /dgii/606/txt?period=2027-03 */
  @Get(':format/txt')
  async txt(
    @Param('format') format: string,
    @Query() q: DgiiPeriodQuery,
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    if (format !== '606' && format !== '607' && format !== '608') {
      res.status(404);
      return { message: 'Formato no soportado: usa 606, 607 o 608' };
    }
    const file = await this.dgii.txt(format, q.period, user);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    return file.content;
  }
}