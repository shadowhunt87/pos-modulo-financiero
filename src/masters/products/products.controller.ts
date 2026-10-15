import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { UserRole } from '../../generated/prisma/enums.js';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { ProductsService } from './products.service.js';
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from '../dto/product.dto.js';

const { ADMIN, ACCOUNTANT } = UserRole;

@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Roles(ADMIN, ACCOUNTANT)
  @Post()
  create(@Body() dto: CreateProductDto, @CurrentUser() user: AuthUser) {
    return this.products.create(dto, user);
  }

  @Get()
  list(@Query() q: ListProductsQuery, @CurrentUser() user: AuthUser) {
    return this.products.list(q, user);
  }

  @Get(':id')
  get(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.products.get(id, user);
  }

  @Roles(ADMIN, ACCOUNTANT)
  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: AuthUser) {
    return this.products.update(id, dto, user);
  }
}
