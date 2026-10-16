import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../../auth/decorators/current-user.decorator.js';
import { Roles } from '../../auth/decorators/roles.decorator.js';
import { CashierAllowed } from '../../auth/decorators/cashier-allowed.decorator.js';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../../auth/guards/roles.guard.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import {
  CashMovementDto, CategoryDto, CloseShiftDto, CreateApprovalDto, CreateSaleDto, CreateTerminalDto, DrawerOpenDto, ListSalesQuery, ListShiftsQuery,
  OpenShiftDto, ParkSaleDto, ProductSettingDto, PromotionDto, ReportQuery, ReturnSaleDto, SetPinDto, UpdatePosSettingsDto, UpdateTerminalDto, VoidSaleDto,
} from './dto.js';
import { PosConfigService } from './pos-config.service.js';
import { PosSalesService } from './pos-sales.service.js';
import { PosShiftsService } from './pos-shifts.service.js';
import { MANAGERS, OPERATORS, SUPERVISORS, isSupervisor } from './pos-common.js';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength, ValidateNested, IsNotEmpty, Matches, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

class ProductSettingsBody {
  @IsArray() @ArrayMaxSize(1000) @ValidateNested({ each: true }) @Type(() => ProductSettingDto) items: ProductSettingDto[];
}
class CustomerBody {
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(20) taxId?: string;
  @IsOptional() @IsIn(['RNC', 'CEDULA', 'PASSPORT']) taxIdType?: 'RNC' | 'CEDULA' | 'PASSPORT';
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @Matches(/^[BE]\d{2}$/) defaultNcfType?: string;
}

/**
 * Punto de venta (vertical «pos», docs/PLAN-POS.md). Las rutas de la caja llevan @CashierAllowed(): el cajero no entra a
 * nada más del sistema (D-POS1). Configuración y reportes, solo administración.
 */
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('pos')
export class PosController {
  constructor(private readonly config: PosConfigService, private readonly shifts: PosShiftsService, private readonly sales: PosSalesService) {}

  // ---------------- Contexto de la caja ----------------
  @CashierAllowed() @Roles(...OPERATORS) @Get('context')
  async context(@CurrentUser() user: AuthUser) {
    const [settings, terminals] = await Promise.all([this.config.getSettings(user), this.config.listTerminals(user)]);
    return { configured: !!settings, isSupervisor: isSupervisor(user), terminals: terminals.filter((t) => t.active).map((t) => ({ id: t.id, code: t.code, name: t.name })) };
  }

  // ---------------- Configuración ----------------
  @Roles(...MANAGERS) @Get('settings') getSettings(@CurrentUser() u: AuthUser) { return this.config.getSettings(u); }
  @Roles(...MANAGERS) @Put('settings') updateSettings(@Body() dto: UpdatePosSettingsDto, @CurrentUser() u: AuthUser) { return this.config.updateSettings(dto, u); }
  @Roles(...MANAGERS) @Post('settings/bootstrap') bootstrap(@CurrentUser() u: AuthUser) { return this.config.bootstrap(u); }

  @Roles(...MANAGERS) @Get('terminals') listTerminals(@CurrentUser() u: AuthUser) { return this.config.listTerminals(u); }
  @Roles(...MANAGERS) @Post('terminals') createTerminal(@Body() dto: CreateTerminalDto, @CurrentUser() u: AuthUser) { return this.config.createTerminal(dto, u); }
  @Roles(...MANAGERS) @Patch('terminals/:id')
  updateTerminal(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTerminalDto, @CurrentUser() u: AuthUser) { return this.config.updateTerminal(id, dto, u); }

  @Roles(...MANAGERS) @Get('categories') listCategories(@CurrentUser() u: AuthUser) { return this.config.listCategories(u); }
  @Roles(...MANAGERS) @Post('categories') createCategory(@Body() dto: CategoryDto, @CurrentUser() u: AuthUser) { return this.config.saveCategory(null, dto, u); }
  @Roles(...MANAGERS) @Patch('categories/:id')
  updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CategoryDto, @CurrentUser() u: AuthUser) { return this.config.saveCategory(id, dto, u); }

  @Roles(...MANAGERS) @Get('product-settings') listProductSettings(@CurrentUser() u: AuthUser) { return this.config.listProductSettings(u); }
  @Roles(...MANAGERS) @Put('product-settings')
  saveProductSettings(@Body() body: ProductSettingsBody, @CurrentUser() u: AuthUser) { return this.config.saveProductSettings(body.items, u); }

  @Roles(...MANAGERS) @Get('promotions') listPromotions(@CurrentUser() u: AuthUser) { return this.config.listPromotions(u); }
  @Roles(...MANAGERS) @Post('promotions') createPromotion(@Body() dto: PromotionDto, @CurrentUser() u: AuthUser) { return this.config.savePromotion(null, dto, u); }
  @Roles(...MANAGERS) @Patch('promotions/:id')
  updatePromotion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PromotionDto, @CurrentUser() u: AuthUser) { return this.config.savePromotion(id, dto, u); }

  // ---------------- PIN y autorizaciones ----------------
  @Roles(...SUPERVISORS) @Put('pin') setPin(@Body() dto: SetPinDto, @CurrentUser() u: AuthUser) { return this.config.setPin(dto, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Post('approvals')
  approve(@Body() dto: CreateApprovalDto, @CurrentUser() u: AuthUser) { return this.config.createApproval(dto, u); }

  // ---------------- Catálogo y clientes de la caja ----------------
  @CashierAllowed() @Roles(...OPERATORS) @Get('catalog') catalog(@CurrentUser() u: AuthUser) { return this.sales.catalog(u); }
  @CashierAllowed() @Roles(...OPERATORS) @Get('customers') customers(@Query('q') q: string | undefined, @CurrentUser() u: AuthUser) { return this.sales.customers(q, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Post('customers') createCustomer(@Body() dto: CustomerBody, @CurrentUser() u: AuthUser) { return this.sales.createCustomer(dto, u); }

  // ---------------- Turnos ----------------
  @CashierAllowed() @Roles(...OPERATORS) @Post('shifts/open') open(@Body() dto: OpenShiftDto, @CurrentUser() u: AuthUser) { return this.shifts.open(dto, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Get('shifts/current')
  current(@Query('terminalId', ParseUUIDPipe) terminalId: string, @CurrentUser() u: AuthUser) { return this.shifts.current(terminalId, u); }
  @Roles(...SUPERVISORS) @Get('shifts') listShifts(@Query() q: ListShiftsQuery, @CurrentUser() u: AuthUser) { return this.shifts.list(q, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Get('shifts/:id') getShift(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.shifts.get(id, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Post('shifts/:id/movements')
  movement(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CashMovementDto, @CurrentUser() u: AuthUser) { return this.shifts.cashMovement(id, dto, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Post('shifts/:id/drawer')
  drawer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DrawerOpenDto, @CurrentUser() u: AuthUser) { return this.shifts.drawerOpen(id, dto, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Post('shifts/:id/close')
  close(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CloseShiftDto, @CurrentUser() u: AuthUser) { return this.shifts.close(id, dto, u); }

  // ---------------- Ventas ----------------
  @CashierAllowed() @Roles(...OPERATORS) @Post('sales') sell(@Body() dto: CreateSaleDto, @CurrentUser() u: AuthUser) { return this.sales.create(dto, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Get('sales') listSales(@Query() q: ListSalesQuery, @CurrentUser() u: AuthUser) { return this.sales.list(q, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Get('sales/:id') getSale(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.sales.get(id, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Get('sales/:id/ticket') ticket(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.sales.ticket(id, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Post('sales/:id/void')
  voidSale(@Param('id', ParseUUIDPipe) id: string, @Body() dto: VoidSaleDto, @CurrentUser() u: AuthUser) { return this.sales.void(id, dto, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Post('sales/:id/returns')
  returnSale(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReturnSaleDto, @CurrentUser() u: AuthUser) { return this.sales.return(id, dto, u); }

  // ---------------- Ventas suspendidas ----------------
  @CashierAllowed() @Roles(...OPERATORS) @Get('parked')
  parked(@Query('terminalId', ParseUUIDPipe) terminalId: string, @CurrentUser() u: AuthUser) { return this.sales.listParked(terminalId, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Post('parked') park(@Body() dto: ParkSaleDto, @CurrentUser() u: AuthUser) { return this.sales.park(dto, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Post('parked/:id/resume') resume(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.sales.resume(id, u); }
  @CashierAllowed() @Roles(...OPERATORS) @Delete('parked/:id') discard(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() u: AuthUser) { return this.sales.discardParked(id, u); }

  // ---------------- Reportes ----------------
  @Roles(...SUPERVISORS) @Get('reports/sales') report(@Query() q: ReportQuery, @CurrentUser() u: AuthUser) { return this.sales.report(q, u); }
}
