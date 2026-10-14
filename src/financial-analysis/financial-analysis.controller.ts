import { Body, Controller, Delete, Get, Param, Put, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { renderPdf } from '../exports/pdf.renderer.js';
import { renderXlsx } from '../exports/xlsx.renderer.js';
import type { ExportFormat } from '../exports/dto/exports.dto.js';
import type { Section } from '../exports/table-doc.js';
import { FinancialAnalysisService } from './financial-analysis.service.js';
import { compareSection, healthSection } from './financial-analysis.builders.js';
import {
  CompareQuery, ExportCompareQuery, ExportHealthQuery, HealthQuery, TrendQuery, UpdateThresholdsDto,
} from './dto/financial-analysis.dto.js';

const { ADMIN, ACCOUNTANT } = UserRole;
const MIME: Record<ExportFormat, string> = {
  pdf: 'application/pdf',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

// Lecturas para todos los roles (como /reports); cambiar límites: ADMIN y ACCOUNTANT
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('financial-analysis')
export class FinancialAnalysisController {
  constructor(
    private readonly analysis: FinancialAnalysisService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('health')
  health(@Query() q: HealthQuery, @CurrentUser() user: AuthUser) {
    return this.analysis.health(q, user);
  }

  @Get('trend')
  trend(@Query() q: TrendQuery, @CurrentUser() user: AuthUser) {
    return this.analysis.trend(q, user);
  }

  @Get('compare')
  compare(@Query() q: CompareQuery, @CurrentUser() user: AuthUser) {
    return this.analysis.compare(q, user);
  }

  @Get('kpis')
  kpis(@CurrentUser() user: AuthUser) {
    return this.analysis.kpis(user);
  }

  @Get('thresholds')
  thresholds(@CurrentUser() user: AuthUser) {
    return this.analysis.thresholds(user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Put('thresholds')
  updateThresholds(@Body() dto: UpdateThresholdsDto, @CurrentUser() user: AuthUser) {
    return this.analysis.updateThresholds(dto, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Delete('thresholds/:ratioKey')
  resetThreshold(@Param('ratioKey') ratioKey: string, @CurrentUser() user: AuthUser) {
    return this.analysis.resetThreshold(ratioKey, user);
  }

  @Get('export/health')
  async exportHealth(@Query() q: ExportHealthQuery, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const h = await this.analysis.health(q, user);
    return this.send(res, user, q.format, 'Semáforo financiero', `semaforo-financiero_${q.from}_${q.to}`, `Del ${q.from} al ${q.to}`, [healthSection(h)]);
  }

  @Get('export/compare')
  async exportCompare(@Query() q: ExportCompareQuery, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const c = await this.analysis.compare(q, user);
    return this.send(res, user, q.format, 'Comparación de períodos', `comparacion_${q.from}_${q.to}`, `Del ${q.from} al ${q.to}`, [compareSection(c)]);
  }

  /** Mismas cabeceras que ExportsController.send. */
  private async send(res: Response, user: AuthUser, format: ExportFormat, title: string, fileBase: string, subtitle: string, sections: Section[]) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true, taxId: true } });
    const doc = { title, subtitle, fileBase, sections, company };
    const data = format === 'xlsx' ? await renderXlsx(doc) : await renderPdf(doc);
    res.setHeader('Content-Type', MIME[format]);
    res.setHeader('Content-Length', data.length);
    res.setHeader('Content-Disposition', `attachment; filename="${`${fileBase}.${format}`.replace(/[^A-Za-z0-9._-]/g, '_')}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(data);
  }
}
