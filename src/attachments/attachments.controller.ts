import {
  Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, Res, UploadedFile, UseGuards, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { AttachmentsService } from './attachments.service.js';
import { ListAttachmentsQuery, UploadAttachmentDto } from './dto/attachments.dto.js';
import { contentDisposition, type UploadedFileLike } from './file-type.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('attachments')
export class AttachmentsController {
  constructor(private readonly attachments: AttachmentsService) {}

  /** multipart/form-data: campo `file` + exactamente uno de invoiceId, paymentId, journalEntryId, reconciliationId */
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  @Post()
  @UseInterceptors(FileInterceptor('file'))
  upload(@UploadedFile() file: UploadedFileLike | undefined, @Body() dto: UploadAttachmentDto, @CurrentUser() user: AuthUser) {
    return this.attachments.upload(file, dto, user);
  }

  @Get()
  list(@Query() q: ListAttachmentsQuery, @CurrentUser() user: AuthUser) {
    return this.attachments.list(q, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.attachments.get(id, user);
  }

  @Get(':id/download')
  async download(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Res() res: Response) {
    const f = await this.attachments.download(id, user);
    res.setHeader('Content-Type', f.mimeType);
    res.setHeader('Content-Length', f.data.length);
    res.setHeader('Content-Disposition', contentDisposition(f.fileName));
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'private, no-store');
    res.end(f.data);
  }

  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.attachments.remove(id, user);
  }
}
