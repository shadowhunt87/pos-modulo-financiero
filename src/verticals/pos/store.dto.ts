import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional,
  IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { ProductKind } from '../../generated/prisma/enums.js';

/**
 * POS completo (tienda): productos, inventario, compras, clientes, proveedores y facturas. Son la puerta del punto de
 * venta a los servicios del núcleo; las reglas de negocio (NCF, ITBIS, inventario, asientos) las aplica el núcleo.
 */
const MAX_AMOUNT = 999_999_999_999;
const NCF_TYPE = /^[BE]\d{2}$/;
const CODE = /^[A-Za-z0-9._-]{1,40}$/;
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
const digitsOnly = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

class PageQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

// ---------------- Productos ----------------
export class StoreProductsQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() active?: boolean;
  @IsOptional() @IsUUID() categoryId?: string;
  // true: solo los que controlan inventario y están en o bajo el mínimo (existencia ≤ 0)
  @IsOptional() @Transform(toBool) @IsBoolean() outOfStock?: boolean;
}

export class StoreProductDto {
  @IsOptional() @IsString() @Matches(CODE, { message: 'Código: hasta 40 letras, números, punto o guion, sin espacios' }) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @IsEnum(ProductKind) kind?: ProductKind;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20) unit?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) salePrice?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) purchasePrice?: number | null;
  @IsOptional() @IsUUID() saleTaxRateId?: string | null;
  @IsOptional() @IsUUID() purchaseTaxRateId?: string | null;
  @IsOptional() @IsBoolean() tracksInventory?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
  // Cómo se ve en la caja
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsBoolean() showInPos?: boolean;
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Matches(/^[A-Za-z0-9-]{1,40}$/, { each: true, message: 'Código de barras inválido' })
  barcodes?: string[];
}

// ---------------- Inventario ----------------
export class StoreStockQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() withStock?: boolean;
}

export class StoreDateRangeQuery extends PageQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class StoreAdjustmentLineDto {
  @IsUUID() productId: string;
  // + entra, − sale. Nunca cero.
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(-MAX_AMOUNT) @Max(MAX_AMOUNT) quantity: number;
  // Obligatorio en las entradas; las salidas van al costo promedio
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(MAX_AMOUNT) unitCost?: number;
}

export class StoreAdjustmentDto {
  @IsDateString() date: string;
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => StoreAdjustmentLineDto)
  lines: StoreAdjustmentLineDto[];
}

export class StoreVoidDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  // Solo facturas: código de anulación DGII (608), 01 a 10
  @IsOptional() @Matches(/^(0[1-9]|10)$/, { message: 'reasonCode: código de anulación de la DGII, 01 a 10' }) reasonCode?: string;
  @IsOptional() @IsUUID() approvalId?: string;
}

// ---------------- Compras (entrada de mercancía) ----------------
export class PurchaseLineDto {
  @IsUUID() productId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(MAX_AMOUNT) quantity: number;
  // Costo unitario SIN ITBIS, como viene en la factura del proveedor
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) unitCost: number;
  // ITBIS de la compra; si no se manda, el de compra del producto
  @IsOptional() @IsUUID() taxRateId?: string | null;
}

export class StorePurchaseDto {
  @IsString() @Matches(/^[A-Za-z0-9-]{8,64}$/, { message: 'clientUuid inválido' }) clientUuid: string;
  @IsUUID() supplierId: string;
  @IsDateString() issueDate: string;
  // NCF que trae la factura del proveedor (B01…, E31…). Sin NCF: proveedor informal y lo emites tú (ncfType B11)
  @IsOptional() @Transform(upper) @IsString() @Matches(/^[BE]\d{10,11}$/, { message: 'NCF del proveedor inválido (ej: B0100000123)' }) ncf?: string;
  @IsOptional() @Transform(upper) @Matches(NCF_TYPE, { message: 'ncfType: tipo de comprobante (B11...)' }) ncfType?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => PurchaseLineDto) lines: PurchaseLineDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

// ---------------- Clientes y proveedores ----------------
export class StorePartnersQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() active?: boolean;
  // true: solo los que tienen saldo pendiente
  @IsOptional() @Transform(toBool) @IsBoolean() withBalance?: boolean;
}

export class StorePartnerDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) tradeName?: string;
  @IsOptional() @IsIn(['RNC', 'CEDULA', 'PASSPORT']) taxIdType?: 'RNC' | 'CEDULA' | 'PASSPORT';
  @IsOptional() @Transform(digitsOnly) @IsString() @MaxLength(20) taxId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) creditLimit?: number;
  @IsOptional() @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @IsOptional() @Transform(upper) @Matches(NCF_TYPE, { message: 'defaultNcfType: tipo de comprobante (B01, B02...)' }) defaultNcfType?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

// ---------------- Facturas ----------------
export class StoreInvoicesQuery extends PageQuery {
  @IsOptional() @IsString() @MaxLength(50) q?: string;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsIn(['DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOIDED']) status?: string;
  // true: solo las que tienen saldo por cobrar
  @IsOptional() @Transform(toBool) @IsBoolean() pending?: boolean;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class StoreInvoiceLineDto {
  @IsUUID() productId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(MAX_AMOUNT) quantity: number;
  // Descuento manual en monto (sin ITBIS). El precio lo pone el servidor.
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_AMOUNT) discount?: number;
}

export class StoreInvoiceDto {
  // Id que genera el frontend: un reintento devuelve la misma factura (no factura dos veces)
  @IsString() @Matches(/^[A-Za-z0-9-]{8,64}$/, { message: 'clientUuid inválido' }) clientUuid: string;
  @IsUUID() partnerId: string;
  @IsOptional() @Transform(upper) @Matches(NCF_TYPE, { message: 'ncfType: tipo de comprobante (B01, B02...)' }) ncfType?: string;
  @IsOptional() @IsDateString() dueDate?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => StoreInvoiceLineDto) lines: StoreInvoiceLineDto[];
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  @IsOptional() @IsUUID() approvalId?: string;
}

export class StoreCollectDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(MAX_AMOUNT) amount: number;
  @IsIn(['CASH', 'CARD', 'TRANSFER', 'CHECK']) method: 'CASH' | 'CARD' | 'TRANSFER' | 'CHECK';
  // Efectivo: caja; tarjeta, transferencia o cheque: banco
  @IsOptional() @IsUUID() cashRegisterId?: string;
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}
