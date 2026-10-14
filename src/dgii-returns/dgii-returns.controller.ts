import { Body, Controller, Get, Param, Post, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { contentDisposition } from '../attachments/file-type.js';
import { renderPdf } from '../exports/pdf.renderer.js';
import { renderXlsx } from '../exports/xlsx.renderer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DgiiReviewService } from './review.service.js';
import { DgiiFormsService } from './forms.service.js';
import { ExportPeriodQuery, PeriodQuery } from './dto/dgii-returns.dto.js';

class FileFormDto {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period: mes con formato AAAA-MM' }) period!: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}
class FormParam { @IsIn(['it1', 'ir17', '609']) form!: 'it1' | 'ir17' | '609'; }
const FORM = { it1: 'IT-1', ir17: 'IR-17', '609': '609' } as const;

// Declaraciones asistidas y revisión del mes (PLAN-v0.3 §9): lecturas para todos; marcar presentada ADMIN y ACCOUNTANT
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dgii-returns')
export class DgiiReturnsController {
  constructor(private readonly review: DgiiReviewService, private readonly forms: DgiiFormsService, private readonly prisma: PrismaService) {}

  @Get('review')
  monthReview(@Query() q: PeriodQuery, @CurrentUser() user: AuthUser) {
    return this.review.review(q.period, user);
  }

  @Get('609')
  report609(@Query() q: PeriodQuery, @CurrentUser() user: AuthUser) {
    return this.forms.report609(q.period, user);
  }

  @Get('609/txt')
  async txt609(@Query() q: PeriodQuery, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const f = await this.forms.txt609(q.period, user);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.setHeader('Content-Disposition', contentDisposition(f.fileName));
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(f.content);
  }

  @Get('it1')
  it1(@Query() q: PeriodQuery, @CurrentUser() user: AuthUser) {
    return this.forms.it1(q.period, user);
  }

  @Get('ir17')
  ir17(@Query() q: PeriodQuery, @CurrentUser() user: AuthUser) {
    return this.forms.ir17(q.period, user);
  }

  /** Hoja del IT-1 o IR-17 en PDF o Excel. */
  @Get(':form/export')
  async export(@Param() p: FormParam, @Query() q: ExportPeriodQuery, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const sheet = p.form === 'it1' ? await this.forms.it1(q.period, user) : await this.forms.ir17(q.period, user);
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true, taxId: true } });
    const doc = this.forms.sheetDoc(sheet, company);
    const format = q.format ?? 'pdf';
    const data = format === 'xlsx' ? await renderXlsx(doc) : await renderPdf(doc);
    res.setHeader('Content-Type', format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Length', data.length);
    res.setHeader('Content-Disposition', contentDisposition(`${doc.fileBase}.${format}`));
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(data);
  }

  /** «Ya lo presenté» guardando la foto del mes (el saldo a favor pasa al mes siguiente). */
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post(':form/file')
  file(@Param() p: FormParam, @Body() dto: FileFormDto, @CurrentUser() user: AuthUser) {
    return this.forms.file(FORM[p.form], dto.period, dto.reference, user);
  }
}
