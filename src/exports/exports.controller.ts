import { Controller, Get, NotFoundException, Param, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { ExportBalanceSheetQuery, ExportDgiiQuery, ExportPeriodQuery, ExportRangeQuery, type ExportFormat } from './dto/exports.dto.js';
import { ExportsService } from './exports.service.js';
import type { TableDoc } from './table-doc.js';

// Solo lectura: cualquier rol de la empresa puede exportar lo que ya puede consultar.
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('exports')
export class ExportsController {
  constructor(private readonly exports: ExportsService) {}

  private async send(res: Response, doc: TableDoc, format: ExportFormat) {
    const f = await this.exports.render(doc, format);
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Length', f.data.length);
    res.setHeader('Content-Disposition', `attachment; filename="${f.fileName.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(f.data);
  }

  @Get('trial-balance')
  async trialBalance(@Query() q: ExportRangeQuery, @CurrentUser() u: AuthUser, @Res() res: Response) {
    return this.send(res, await this.exports.trialBalance(q, u), q.format);
  }

  @Get('general-ledger')
  async generalLedger(@Query() q: ExportRangeQuery, @CurrentUser() u: AuthUser, @Res() res: Response) {
    return this.send(res, await this.exports.generalLedger(q, u), q.format);
  }

  @Get('income-statement')
  async incomeStatement(@Query() q: ExportPeriodQuery, @CurrentUser() u: AuthUser, @Res() res: Response) {
    return this.send(res, await this.exports.incomeStatementDoc(q, u), q.format);
  }

  @Get('balance-sheet')
  async balanceSheet(@Query() q: ExportBalanceSheetQuery, @CurrentUser() u: AuthUser, @Res() res: Response) {
    return this.send(res, await this.exports.balanceSheetDoc(q, u), q.format);
  }

  @Get('cash-flow')
  async cashFlow(@Query() q: ExportPeriodQuery, @CurrentUser() u: AuthUser, @Res() res: Response) {
    return this.send(res, await this.exports.cashFlowDoc(q, u), q.format);
  }

  @Get('financial-ratios')
  async ratios(@Query() q: ExportPeriodQuery, @CurrentUser() u: AuthUser, @Res() res: Response) {
    return this.send(res, await this.exports.ratiosDoc(q, u), q.format);
  }

  /** /exports/dgii/606?period=2027-03&format=xlsx (también 607 y 608) */
  @Get('dgii/:form')
  async dgii(@Param('form') form: string, @Query() q: ExportDgiiQuery, @CurrentUser() u: AuthUser, @Res() res: Response) {
    if (form !== '606' && form !== '607' && form !== '608') throw new NotFoundException('Formato no soportado: usa 606, 607 o 608');
    return this.send(res, await this.exports.dgiiDoc(form, q, u), q.format);
  }
}
