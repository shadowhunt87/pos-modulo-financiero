import {
  Catch, Controller, Get, PayloadTooLargeException, Post, Query, Res, UploadedFile, UseFilters, UseGuards, UseInterceptors,
  type ArgumentsHost, type ExceptionFilter,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { contentDisposition, type UploadedFileLike } from '../attachments/file-type.js';
import { ChartOfAccountsService } from './chart-of-accounts.service.js';
import { MAX_UPLOAD_BYTES, TOO_LARGE_MESSAGE } from './chart-of-accounts.file.js';
import { ExportChartQuery } from './dto/chart-of-accounts.dto.js';

/** multer corta el archivo de más de 2 MB con un mensaje en inglés ("File too large"): se traduce. */
@Catch(PayloadTooLargeException)
class TooLargeFilter implements ExceptionFilter {
  catch(_e: PayloadTooLargeException, host: ArgumentsHost) {
    host.switchToHttp().getResponse<Response>().status(413).json({ statusCode: 413, message: TOO_LARGE_MESSAGE, error: 'Payload Too Large' });
  }
}

const upload = FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1, fields: 10 } });

// Exportar y la plantilla son lectura (cualquier rol); importar y cargar el estándar, ADMIN y ACCOUNTANT.
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(TooLargeFilter)
@Controller('chart-of-accounts')
export class ChartOfAccountsController {
  constructor(private readonly chart: ChartOfAccountsService) {}

  private send(res: Response, f: { data: Buffer; mime: string; fileName: string }) {
    res.setHeader('Content-Type', f.mime);
    res.setHeader('Content-Length', f.data.length);
    res.setHeader('Content-Disposition', contentDisposition(f.fileName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(f.data);
  }

  /** /chart-of-accounts/export?format=xlsx|csv */
  @Get('export')
  async export(@Query() q: ExportChartQuery, @CurrentUser() user: AuthUser, @Res() res: Response) {
    this.send(res, await this.chart.exportFile(q.format ?? 'xlsx', user));
  }

  @Get('template')
  async template(@Res() res: Response) {
    this.send(res, await this.chart.template());
  }

  /** multipart/form-data, campo `file` (xlsx o csv). No guarda nada. */
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post('import/preview')
  @UseInterceptors(upload)
  preview(@UploadedFile() file: UploadedFileLike | undefined, @CurrentUser() user: AuthUser) {
    return this.chart.previewFile(file, user);
  }

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post('import')
  @UseInterceptors(upload)
  import(@UploadedFile() file: UploadedFileLike | undefined, @CurrentUser() user: AuthUser) {
    return this.chart.importFile(file, user);
  }

  /** Vista previa del catálogo estándar de RD contra el plan actual. No guarda nada. */
  @Get('standard/rd/preview')
  previewStandardRd(@CurrentUser() user: AuthUser) {
    return this.chart.previewStandardRd(user);
  }

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post('standard/rd')
  importStandardRd(@CurrentUser() user: AuthUser) {
    return this.chart.importStandardRd(user);
  }
}
