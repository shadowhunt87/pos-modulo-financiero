import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { DgiiReviewService } from './review.service.js';
import { PeriodQuery } from './dto/dgii-returns.dto.js';

// Declaraciones asistidas y revisión del mes (PLAN-v0.3 §9): solo lectura, todos los roles
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('dgii-returns')
export class DgiiReturnsController {
  constructor(private readonly review: DgiiReviewService) {}

  @Get('review')
  monthReview(@Query() q: PeriodQuery, @CurrentUser() user: AuthUser) {
    return this.review.review(q.period, user);
  }
}
