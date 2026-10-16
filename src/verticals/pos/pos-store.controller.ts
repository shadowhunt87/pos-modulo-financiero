import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CashierAllowed } from '../../auth/decorators/cashier-allowed.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
  CATALOG_EDITORS, CATALOG_READERS, COLLECTORS, INVOICE_READERS, MANAGERS, SALES_STAFF, STOCK_EDITORS, STOCK_READERS, SUPERVISORS,
} from './pos-common.js';
import { PosStoreService } from './pos-store.service.js';
import {
  StoreAdjustmentDto, StoreCollectDto, StoreDateRangeQuery, StoreInvoiceDto, StoreInvoicesQuery, StorePartnerDto, StorePartnersQuery,
  StoreProductDto, StoreProductsQuery, StorePurchaseDto, StoreStockQuery, StoreVoidDto,
} from './store.dto.js';

/**
 * POS completo (tienda): /pos/store. Todas las rutas admiten roles de tienda (@CashierAllowed); cuál entra lo dice cada
 * @Roles(). Cajero: cobrar facturas. Vendedor: clientes y facturas. Almacén: productos, inventario, compras y proveedores.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@CashierAllowed()
@Controller('pos/store')
export class PosStoreController {
  constructor(private readonly store: PosStoreService) {}

  @Roles(...CATALOG_READERS) @Get('summary') summary(@CurrentUser() u: AuthUser) { return this.store.summary(u); }
  @Roles(...CATALOG_READERS) @Get('tax-rates') taxRates(@CurrentUser() u: AuthUser) { return this.store.taxRates(u); }
  @Roles(...COLLECTORS) @Get('funds') funds(@CurrentUser() u: AuthUser) { return this.store.funds(u); }

  // ---------------- Productos ----------------
  @Roles(...CATALOG_READERS) @Get('products') products(@Query() q: StoreProductsQuery, @CurrentUser() u: AuthUser) { return this.store.listProducts(q, u); }
  @Roles(...CATALOG_READERS) @Get('products/:id') product(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.store.getProduct(id, u); }
  @Roles(...CATALOG_EDITORS) @Post('products') createProduct(@Body() dto: StoreProductDto, @CurrentUser() u: AuthUser) { return this.store.saveProduct(null, dto, u); }
  @Roles(...CATALOG_EDITORS) @Patch('products/:id')
  updateProduct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StoreProductDto, @CurrentUser() u: AuthUser) { return this.store.saveProduct(id, dto, u); }

  // ---------------- Inventario ----------------
  @Roles(...CATALOG_READERS) @Get('stock') stock(@Query() q: StoreStockQuery, @CurrentUser() u: AuthUser) { return this.store.stock(q, u); }
  @Roles(...STOCK_READERS) @Get('products/:id/movements')
  movements(@Param('id', ParseUUIDPipe) id: string, @Query() q: StoreDateRangeQuery, @CurrentUser() u: AuthUser) { return this.store.movements(id, q, u); }
  @Roles(...STOCK_READERS) @Get('adjustments') adjustments(@Query() q: StoreDateRangeQuery, @CurrentUser() u: AuthUser) { return this.store.listAdjustments(q, u); }
  @Roles(...STOCK_READERS) @Get('adjustments/:id') adjustment(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.store.getAdjustment(id, u); }
  @Roles(...STOCK_EDITORS) @Post('adjustments') createAdjustment(@Body() dto: StoreAdjustmentDto, @CurrentUser() u: AuthUser) { return this.store.createAdjustment(dto, u); }
  @Roles(...MANAGERS) @Post('adjustments/:id/void')
  voidAdjustment(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StoreVoidDto, @CurrentUser() u: AuthUser) { return this.store.voidAdjustment(id, dto, u); }

  // ---------------- Compras y proveedores ----------------
  @Roles(...STOCK_READERS) @Get('purchases') purchases(@Query() q: StoreInvoicesQuery, @CurrentUser() u: AuthUser) { return this.store.listPurchases(q, u); }
  @Roles(...STOCK_EDITORS) @Post('purchases') createPurchase(@Body() dto: StorePurchaseDto, @CurrentUser() u: AuthUser) { return this.store.createPurchase(dto, u); }
  @Roles(...STOCK_READERS) @Get('suppliers') suppliers(@Query() q: StorePartnersQuery, @CurrentUser() u: AuthUser) { return this.store.listPartners('SUPPLIER', q, u); }
  @Roles(...STOCK_READERS) @Get('suppliers/:id') supplier(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.store.getPartner('SUPPLIER', id, u); }
  @Roles(...STOCK_EDITORS) @Post('suppliers') createSupplier(@Body() dto: StorePartnerDto, @CurrentUser() u: AuthUser) { return this.store.savePartner('SUPPLIER', null, dto, u); }
  @Roles(...STOCK_EDITORS) @Patch('suppliers/:id')
  updateSupplier(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StorePartnerDto, @CurrentUser() u: AuthUser) { return this.store.savePartner('SUPPLIER', id, dto, u); }

  // ---------------- Clientes ----------------
  @Roles(...INVOICE_READERS) @Get('customers') customers(@Query() q: StorePartnersQuery, @CurrentUser() u: AuthUser) { return this.store.listPartners('CUSTOMER', q, u); }
  @Roles(...INVOICE_READERS) @Get('customers/:id') customer(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.store.getPartner('CUSTOMER', id, u); }
  @Roles(...SALES_STAFF) @Post('customers') createCustomer(@Body() dto: StorePartnerDto, @CurrentUser() u: AuthUser) { return this.store.savePartner('CUSTOMER', null, dto, u); }
  @Roles(...SALES_STAFF) @Patch('customers/:id')
  updateCustomer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StorePartnerDto, @CurrentUser() u: AuthUser) { return this.store.savePartner('CUSTOMER', id, dto, u); }

  // ---------------- Facturas ----------------
  @Roles(...INVOICE_READERS) @Get('invoices') invoices(@Query() q: StoreInvoicesQuery, @CurrentUser() u: AuthUser) { return this.store.listInvoices(q, u); }
  // El detalle lo ven también almacén (sus compras) y quien ve el catálogo
  @Roles(...CATALOG_READERS) @Get('invoices/:id') invoice(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.store.getInvoice(id, u); }
  @Roles(...SALES_STAFF) @Post('invoices') createInvoice(@Body() dto: StoreInvoiceDto, @CurrentUser() u: AuthUser) { return this.store.createInvoice(dto, u); }
  @Roles(...SUPERVISORS) @Post('invoices/:id/void')
  voidInvoice(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StoreVoidDto, @CurrentUser() u: AuthUser) { return this.store.voidInvoice(id, dto, u); }
  @Roles(...COLLECTORS) @Post('invoices/:id/payments')
  collect(@Param('id', ParseUUIDPipe) id: string, @Body() dto: StoreCollectDto, @CurrentUser() u: AuthUser) { return this.store.collect(id, dto, u); }
}
