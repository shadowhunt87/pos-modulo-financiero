import { BadRequestException, Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { InvoicingService } from './invoicing.service.js';
import { BySourceQuery, CreateInvoiceDto, IssueInvoiceDto, ListInvoicesQuery, UpdateInvoiceDto, VoidInvoiceDto } from './dto/invoice.dto.js';

const { ADMIN, ACCOUNTANT, APPROVER } = UserRole;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoicingController {
  constructor(
    private readonly invoicing: InvoicingService,
    private readonly prisma: PrismaService,
  ) {}

  @Roles(ADMIN, ACCOUNTANT)
  @Post()
  create(@Body() dto: CreateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoicing.create(dto, user);
  }

  @Get()
  list(@Query() q: ListInvoicesQuery, @CurrentUser() user: AuthUser) {
    return this.invoicing.list(q, user);
  }

  /** /invoices/by-source?sourceModule=taller.orden&sourceId=ot-1:1,ot-2:1 (antes de :id) */
  @Get('by-source')
  bySource(@Query() q: BySourceQuery, @CurrentUser() user: AuthUser) {
    const ids = [...new Set(q.sourceId.split(',').map((x) => x.trim()).filter(Boolean))];
    if (ids.length > 50) throw new BadRequestException('Máximo 50 sourceId por consulta');
    return this.invoicing.findBySource(this.prisma, user.companyId, q.sourceModule, ids);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.invoicing.get(id, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoicing.update(id, dto, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Post(':id/issue')
  issue(@Param('id', ParseUUIDPipe) id: string, @Body() dto: IssueInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoicing.issue(id, dto, user);
  }

  @Roles(ADMIN, APPROVER)
  @Post(':id/void')
  void(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidInvoiceDto, @CurrentUser() user: AuthUser) {
    return this.invoicing.void(id, dto, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Delete(':id')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.invoicing.remove(id, user);
  }
}