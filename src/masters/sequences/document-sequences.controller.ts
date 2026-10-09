import { Body, Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { DocumentSequencesService } from './document-sequences.service.js';
import { UpdateDocumentSequenceDto } from '../dto/document-sequence.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('document-sequences')
export class DocumentSequencesController {
  constructor(private readonly seqs: DocumentSequencesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser) {
    return this.seqs.list(user);
  }

  @Roles(UserRole.ADMIN)
  @Patch(':docType')
  update(@Param('docType') docType: string, @Body() dto: UpdateDocumentSequenceDto, @CurrentUser() user: AuthUser) {
    return this.seqs.update(docType, dto, user);
  }
}
