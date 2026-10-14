import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { UserRole } from '../generated/prisma/enums.js';
import { FeedbackService } from './feedback.service.js';
import { CreateFeedbackDto, ListFeedbackQuery, ListMyFeedbackQuery, UpdateFeedbackDto } from './dto/feedback.dto.js';

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('feedback')
export class FeedbackController {
  constructor(private readonly feedback: FeedbackService) {}

  // Cualquier usuario puede contar lo que le pasó. Roles explícitos (política de rutas);
  // AUDITOR se agrega aquí cuando exista el rol (Fase 5).
  @Post()
  @Roles(UserRole.ADMIN, UserRole.ACCOUNTANT, UserRole.APPROVER, UserRole.VIEWER, UserRole.AUDITOR)
  create(
    @Body() dto: CreateFeedbackDto,
    @Headers('user-agent') userAgent: string | undefined,
    @CurrentUser() user: AuthUser,
  ) {
    return this.feedback.create(dto, userAgent, user);
  }

  // Sin @Roles: cada usuario ve solo los suyos
  @Get('mine')
  listMine(@Query() q: ListMyFeedbackQuery, @CurrentUser() user: AuthUser) {
    return this.feedback.listMine(q, user);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  list(@Query() q: ListFeedbackQuery, @CurrentUser() user: AuthUser) {
    return this.feedback.list(q, user);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFeedbackDto, @CurrentUser() user: AuthUser) {
    return this.feedback.update(id, dto, user);
  }
}
