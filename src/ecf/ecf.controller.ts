import {
  BadRequestException, Body, Catch, Controller, Delete, Get, Param, ParseUUIDPipe, PayloadTooLargeException, Post, Put, Query,
  UploadedFiles, UseFilters, UseGuards, UseInterceptors, type ArgumentsHost, type ExceptionFilter,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import type { UploadedFileLike } from '../attachments/file-type.js';
import { EcfImportService } from './ecf-import.service.js';
import { ConfirmEcfImportDto, EcfConnectionDto, EcfInboxQuery } from './dto/ecf.dto.js';
import { EcfConnectionService } from './ecf-connection.service.js';
import { EcfSenderService } from './ecf-sender.service.js';

export const MAX_ECF_FILES = 10;
export const MAX_ECF_BYTES = 1024 * 1024;

/** multer responde en inglés ("File too large", "Too many files"): se traduce. */
@Catch(PayloadTooLargeException, BadRequestException)
class UploadLimitsFilter implements ExceptionFilter {
  catch(e: PayloadTooLargeException | BadRequestException, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    const body = e.getResponse() as { message?: unknown };
    if (e instanceof PayloadTooLargeException) {
      res.status(413).json({ statusCode: 413, error: 'Payload Too Large', message: 'Cada XML puede pesar hasta 1 MB: un e-CF normal pesa mucho menos.' });
    } else if (body?.message === 'Too many files' || body?.message === 'Unexpected field') {
      res.status(400).json({ statusCode: 400, error: 'Bad Request', message: `Sube hasta ${MAX_ECF_FILES} archivos XML a la vez, en el campo "files".` });
    } else {
      res.status(400).json(body);
    }
  }
}

const upload = FilesInterceptor('files', MAX_ECF_FILES, { limits: { fileSize: MAX_ECF_BYTES, files: MAX_ECF_FILES, fields: 5 } });

// Importar y confirmar: ADMIN y ACCOUNTANT (PLAN-v0.3 §10). Consultar: todos.
@UseGuards(JwtAuthGuard, RolesGuard)
@UseFilters(UploadLimitsFilter)
@Controller('ecf')
export class EcfController {
  constructor(private readonly importer: EcfImportService, private readonly conn: EcfConnectionService, private readonly sender: EcfSenderService) {}

  // ---- conexión con el proveedor (N7): solo ADMIN; las credenciales se escriben y nunca se devuelven
  @Roles(UserRole.ADMIN)
  @Get('connection')
  connection(@CurrentUser() user: AuthUser) { return this.conn.get(user); }

  @Roles(UserRole.ADMIN)
  @Put('connection')
  saveConnection(@Body() dto: EcfConnectionDto, @CurrentUser() user: AuthUser) { return this.conn.save(dto, user); }

  @Roles(UserRole.ADMIN)
  @Post('connection/check')
  check(@CurrentUser() user: AuthUser) { return this.conn.check(user); }

  // ---- bandeja de estados (todos leen; reintentar ADMIN y ACCOUNTANT)
  @Get('documents')
  documents(@Query() q: EcfInboxQuery, @CurrentUser() user: AuthUser) { return this.sender.list(user, q.status); }

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post('documents/:id/retry')
  retry(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.sender.retry(user, id); }

  /** multipart/form-data, campo `files` (hasta 10 XML de 1 MB). Revisa y guarda; no crea facturas. */
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post('import')
  @UseInterceptors(upload)
  prepare(@UploadedFiles() files: UploadedFileLike[] | undefined, @CurrentUser() user: AuthUser) {
    return this.importer.prepare(files, user);
  }

  @Get('imports')
  list(@CurrentUser() user: AuthUser) {
    return this.importer.list(user);
  }

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Post('import/:id/confirm')
  confirm(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ConfirmEcfImportDto, @CurrentUser() user: AuthUser) {
    return this.importer.confirm(id, dto, user);
  }

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT)
  @Delete('import/:id')
  discard(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.importer.discard(id, user);
  }
}
