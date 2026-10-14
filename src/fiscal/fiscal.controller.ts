import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Put, Query, Res, UseGuards } from '@nestjs/common';
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
import { FiscalParametersService } from './fiscal-parameters.service.js';
import { FiscalProfileService } from './fiscal-profile.service.js';
import { TaxLinksService } from './tax-links.service.js';
import { FiscalAlertsService } from './fiscal-alerts.service.js';
import { CalendarQuery, ContingencyDto, DateQuery, ExportParametersQuery, FilingDto, LinkTaxDto, UpdateFiscalProfileDto } from './dto/fiscal.dto.js';
import { FiscalCalendarService } from './fiscal-calendar.service.js';
import { ymd } from './fiscal-dates.js';

const { ADMIN, ACCOUNTANT } = UserRole;
const MIME = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' } as const;
const STATUS = { OFICIAL: 'Oficial', POR_VALIDAR: 'Por validar' } as const;

// Valores fiscales: lectura para todos los roles. NO hay rutas para cambiarlos (solo el cargador, R9).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('fiscal')
export class FiscalController {
  constructor(
    private readonly params: FiscalParametersService,
    private readonly profile: FiscalProfileService,
    private readonly links: TaxLinksService,
    private readonly alertsSvc: FiscalAlertsService,
    private readonly prisma: PrismaService,
    private readonly cal: FiscalCalendarService,
  ) {}

  @Get('parameters')
  parameters(@Query() q: DateQuery) {
    return this.params.list(q.date ? new Date(q.date) : new Date());
  }

  /** Para la contadora: todos los valores vigentes con su fuente y estado, en Excel o PDF. */
  @Get('parameters/export')
  async exportParameters(@Query() q: ExportParametersQuery, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const date = q.date ? new Date(q.date) : new Date();
    const rows = await this.params.list(date);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true, taxId: true } });
    const show = (r: (typeof rows)[number]) => r.value?.toString() ?? (r.valueDate ? ymd(r.valueDate) : r.kind === 'TABLE' ? '(tabla)' : r.kind === 'NONE' ? 'No aplica' : '');
    const doc = {
      title: 'Valores fiscales', subtitle: `Vigentes al ${ymd(date)}`, fileBase: `valores-fiscales_${ymd(date)}`, company,
      sections: [{
        title: 'Valores fiscales con su fuente',
        columns: [{ header: 'Clave', w: 2.4 }, { header: 'Valor', w: 1 }, { header: 'Base', w: 0.8 }, { header: 'Desde', w: 1 },
          { header: 'Estado', w: 1 }, { header: 'Fuente', w: 4 }, { header: 'Notas', w: 4, xlsxOnly: true }],
        rows: rows.map((r) => ({ cells: [r.key, show(r), r.base ?? '', ymd(r.validFrom), STATUS[r.status], r.source, r.notes ?? ''] })),
        notes: ['«Por validar»: falta la validación con nombre de la contadora. Para corregir un valor se carga una revisión nueva; nada se edita.'],
      }],
    };
    const format = q.format;
    const data = format === 'xlsx' ? await renderXlsx(doc) : await renderPdf(doc);
    res.setHeader('Content-Type', MIME[format]);
    res.setHeader('Content-Length', data.length);
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileBase}.${format}"`);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(data);
  }

  @Get('parameters/:key')
  history(@Param('key') key: string) {
    return this.params.history(key);
  }

  @Get('tax-rates/effective')
  effective(@Query() q: DateQuery, @CurrentUser() user: AuthUser) {
    return this.links.effective(q.date ? new Date(q.date) : new Date(), user);
  }

  @Get('tax-links/suggestions')
  suggestions(@CurrentUser() user: AuthUser) {
    return this.links.suggestions(user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Put('tax-links/:taxRateId')
  link(@Param('taxRateId', ParseUUIDPipe) id: string, @Body() dto: LinkTaxDto, @CurrentUser() user: AuthUser) {
    return this.links.link(id, dto.parameterKey, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Delete('tax-links/:taxRateId')
  unlink(@Param('taxRateId', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.links.unlink(id, user);
  }

  @Get('profile')
  getProfile(@CurrentUser() user: AuthUser) {
    return this.profile.get(user);
  }

  @Roles(ADMIN)
  @Put('profile')
  updateProfile(@Body() dto: UpdateFiscalProfileDto, @CurrentUser() user: AuthUser) {
    return this.profile.update(dto, user);
  }

  @Get('alerts')
  alerts(@CurrentUser() user: AuthUser) {
    return this.alertsSvc.list(user);
  }

  // ---- calendario fiscal (N5)
  @Get('calendar')
  calendar(@Query() q: CalendarQuery, @CurrentUser() user: AuthUser) {
    const from = q.from ? new Date(q.from) : new Date(Date.now() - 31 * 86_400_000);
    const to = q.to ? new Date(q.to) : new Date(Date.now() + 92 * 86_400_000);
    return this.cal.calendar(user, from, to);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Post('filings')
  file(@Body() dto: FilingDto, @CurrentUser() user: AuthUser) {
    return this.cal.file(user, dto);
  }

  @Roles(ADMIN)
  @Delete('filings/:id')
  unfile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.cal.unfile(user, id);
  }

  @Get('b-contingency')
  contingency(@CurrentUser() user: AuthUser) {
    return this.cal.contingency(user);
  }

  @Roles(ADMIN)
  @Post('b-contingency')
  startContingency(@Body() dto: ContingencyDto, @CurrentUser() user: AuthUser) {
    return this.cal.startContingency(user, dto.reason, dto.days);
  }

  @Roles(ADMIN)
  @Delete('b-contingency')
  endContingency(@CurrentUser() user: AuthUser) {
    return this.cal.endContingency(user);
  }
}
