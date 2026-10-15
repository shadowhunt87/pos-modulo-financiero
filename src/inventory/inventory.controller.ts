import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../generated/prisma/enums.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { InventoryService } from './inventory.service.js';
import { CreateAdjustmentDto, ListAdjustmentsQuery, MovementsQuery, StockQuery, VoidAdjustmentDto } from './dto.js';

const { ADMIN, ACCOUNTANT } = UserRole;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private readonly inventory: InventoryService) {}

  // Existencia, costo promedio y valor de cada producto que controla inventario
  @Get('stock')
  stock(@Query() q: StockQuery, @CurrentUser() user: AuthUser) {
    return this.inventory.stock(q, user);
  }

  // Kárdex del producto, en orden de registro
  @Get('products/:id/movements')
  movements(@Param('id', ParseUUIDPipe) id: string, @Query() q: MovementsQuery, @CurrentUser() user: AuthUser) {
    return this.inventory.movements(id, q, user);
  }

  @Get('adjustments')
  listAdjustments(@Query() q: ListAdjustmentsQuery, @CurrentUser() user: AuthUser) {
    return this.inventory.listAdjustments(q, user);
  }

  @Get('adjustments/:id')
  getAdjustment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.inventory.getAdjustment(id, user);
  }

  // Existencias iniciales, conteo físico, mermas y daños. Genera su asiento.
  @Roles(ADMIN, ACCOUNTANT)
  @Post('adjustments')
  createAdjustment(@Body() dto: CreateAdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.inventory.createAdjustment(dto, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Post('adjustments/:id/void')
  voidAdjustment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidAdjustmentDto, @CurrentUser() user: AuthUser) {
    return this.inventory.voidAdjustment(id, dto, user);
  }
}
