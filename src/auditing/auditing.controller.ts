import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, Res, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { contentDisposition, type UploadedFileLike } from '../attachments/file-type.js';
import { renderPdf } from '../exports/pdf.renderer.js';
import { renderXlsx } from '../exports/xlsx.renderer.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AuditingService } from './auditing.service.js';
import { ReviewService } from './review.service.js';
import { buildAuditReport } from './auditing-report.builder.js';
import {
  AddWorkpaperDto, CloseFindingDto, CreateEngagementDto, CreateFindingDto, EngagementStatusDto, FilesQuery, FindingResponseDto, HistoryQuery,
  ItemsQuery, MarkDto, ProcedureDto, ReportQuery, SignOffDto, UpdateEngagementDto, UpdateFindingDto, UpdateWorkpaperDto, UploadAuditFileDto,
} from './dto/auditing.dto.js';

const { ADMIN, AUDITOR } = UserRole;

// Módulo de la auditora (PLAN-v0.2 §5.3). Lecturas ADMIN y AUDITOR (los demás 403); escrituras solo AUDITOR,
// salvo crear o borrar un encargo vacío (ADMIN también) y la respuesta de la gerencia (solo ADMIN).
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('auditing')
export class AuditingController {
  constructor(private readonly svc: AuditingService, private readonly review: ReviewService, private readonly prisma: PrismaService) {}

  @Roles(ADMIN, AUDITOR) @Get('account-notices')
  notices(@CurrentUser() u: AuthUser) { return this.svc.accountNotices(u); }

  @Roles(ADMIN, AUDITOR) @Get('engagements')
  list(@CurrentUser() u: AuthUser) { return this.svc.listEngagements(u); }

  @Roles(ADMIN, AUDITOR) @Post('engagements')
  create(@Body() dto: CreateEngagementDto, @CurrentUser() u: AuthUser) { return this.svc.createEngagement(dto, u); }

  @Roles(ADMIN, AUDITOR) @Get('engagements/:id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.getEngagement(id, u); }

  @Roles(AUDITOR) @Patch('engagements/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEngagementDto, @CurrentUser() u: AuthUser) { return this.svc.updateEngagement(id, dto, u); }

  @Roles(AUDITOR) @Post('engagements/:id/status')
  status(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EngagementStatusDto, @CurrentUser() u: AuthUser) { return this.svc.changeStatus(id, dto, u); }

  @Roles(ADMIN, AUDITOR) @Delete('engagements/:id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteEngagement(id, u); }

  @Roles(AUDITOR) @Get('engagements/:id/workpapers')
  workpapers(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.listWorkpapers(id, u); }

  @Roles(AUDITOR) @Post('engagements/:id/workpapers')
  addWorkpaper(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddWorkpaperDto, @CurrentUser() u: AuthUser) { return this.svc.addWorkpaper(id, dto, u); }

  @Roles(AUDITOR) @Patch('workpapers/:id')
  updateWorkpaper(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateWorkpaperDto, @CurrentUser() u: AuthUser) { return this.svc.updateWorkpaper(id, dto, u); }

  @Roles(AUDITOR) @Post('workpapers/:id/sign-off')
  signOff(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SignOffDto, @CurrentUser() u: AuthUser) { return this.svc.signOff(id, dto, u); }

  @Roles(AUDITOR) @Post('workpapers/:id/procedures')
  addProcedure(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProcedureDto, @CurrentUser() u: AuthUser) { return this.svc.addProcedure(id, dto, u); }

  @Roles(AUDITOR) @Patch('procedures/:id')
  updateProcedure(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ProcedureDto, @CurrentUser() u: AuthUser) { return this.svc.updateProcedure(id, dto, u); }

  @Roles(AUDITOR) @Delete('procedures/:id')
  deleteProcedure(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteProcedure(id, u); }

  // ---- partidas, marcas e historial
  @Roles(AUDITOR) @Get('engagements/:id/items')
  items(@Param('id', ParseUUIDPipe) id: string, @Query() q: ItemsQuery, @CurrentUser() u: AuthUser) { return this.review.items(id, q, u); }

  @Roles(AUDITOR) @Put('engagements/:id/marks')
  mark(@Param('id', ParseUUIDPipe) id: string, @Body() dto: MarkDto, @CurrentUser() u: AuthUser) { return this.review.setMark(id, dto, u); }

  @Roles(AUDITOR) @Delete('marks/:id')
  unmark(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.review.deleteMark(id, u); }

  @Roles(AUDITOR) @Get('history')
  history(@Query() q: HistoryQuery, @CurrentUser() u: AuthUser) { return this.review.history(q.entityType, q.entityId, u); }

  // ---- hallazgos
  @Roles(ADMIN, AUDITOR) @Get('engagements/:id/findings')
  findings(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.listFindings(id, u); }

  @Roles(AUDITOR) @Post('engagements/:id/findings')
  createFinding(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateFindingDto, @CurrentUser() u: AuthUser) { return this.svc.createFinding(id, dto, u); }

  @Roles(AUDITOR) @Patch('findings/:id')
  updateFinding(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFindingDto, @CurrentUser() u: AuthUser) { return this.svc.updateFinding(id, dto, u); }

  @Roles(AUDITOR) @Post('findings/:id/communicate')
  communicate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.communicate(id, u); }

  @Roles(ADMIN) @Post('findings/:id/response')
  respond(@Param('id', ParseUUIDPipe) id: string, @Body() dto: FindingResponseDto, @CurrentUser() u: AuthUser) { return this.svc.respond(id, dto, u); }

  @Roles(AUDITOR) @Post('findings/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseFindingDto, @CurrentUser() u: AuthUser) { return this.svc.close(id, dto, u); }

  @Roles(AUDITOR) @Delete('findings/:id')
  deleteFinding(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.svc.deleteFinding(id, u); }

  // ---- archivos
  @Roles(AUDITOR) @Post('files') @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedFileLike | undefined, @Body() dto: UploadAuditFileDto, @CurrentUser() u: AuthUser) { return this.review.upload(file, dto, u); }

  @Roles(ADMIN, AUDITOR) @Get('files')
  files(@Query() q: FilesQuery, @CurrentUser() u: AuthUser) { return this.review.listFiles(q, u); }

  @Roles(ADMIN, AUDITOR) @Get('files/:id/download')
  async download(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser, @Res() res: Response) {
    const f = await this.review.download(id, u);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Length', f.data.length);
    res.setHeader('Content-Disposition', contentDisposition(f.fileName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(f.data);
  }

  @Roles(AUDITOR) @Delete('files/:id')
  deleteFile(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.review.deleteFile(id, u); }

  // ---- informe
  @Roles(ADMIN, AUDITOR) @Get('engagements/:id/report')
  async report(@Param('id', ParseUUIDPipe) id: string, @Query() q: ReportQuery, @CurrentUser() u: AuthUser, @Res() res: Response) {
    const e = await this.svc.getEngagement(id, u);
    const [company, wps, findings, marks, detail] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: u.companyId }, select: { name: true, taxId: true } }),
      this.prisma.auditWorkpaper.findMany({ where: { engagementId: id, companyId: u.companyId }, orderBy: [{ sortOrder: 'asc' }, { reference: 'asc' }], include: { procedures: { select: { done: true } }, _count: { select: { checkmarks: true } } } }),
      this.svc.listFindings(id, u),
      this.prisma.auditCheckmark.groupBy({ by: ['entityType', 'mark'], where: { engagementId: id, companyId: u.companyId }, _count: true }),
      this.prisma.auditCheckmark.findMany({ where: { engagementId: id, companyId: u.companyId }, select: { entityType: true, entityId: true, mark: true, note: true } }),
    ]);
    const names = await this.svc.userNames(wps.flatMap((w) => [w.preparedById, w.reviewedById]), u.companyId);
    const doc = buildAuditReport({
      company, engagement: e, accountNotices: e.accountNotices,
      workpapers: wps.map((w) => ({
        reference: w.reference, title: w.title, status: w.status, conclusion: w.conclusion, procedures: w.procedures.length, proceduresDone: w.procedures.filter((p) => p.done).length,
        marks: w._count.checkmarks, preparedBy: w.preparedById ? names.get(w.preparedById) ?? null : null, reviewedBy: w.reviewedById ? names.get(w.reviewedById) ?? null : null,
      })),
      findings: findings.filter((f) => f.includeInReport && f.status !== 'DRAFT'),
      marks: marks.map((m) => ({ entityType: m.entityType, mark: m.mark, count: m._count })), marksDetail: detail,
    });
    const data = q.format === 'xlsx' ? await renderXlsx(doc) : await renderPdf(doc);
    res.setHeader('Content-Type', q.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' : 'application/pdf');
    res.setHeader('Content-Length', data.length);
    res.setHeader('Content-Disposition', contentDisposition(`${doc.fileBase}.${q.format}`));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(data);
  }
}
