import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min,
} from 'class-validator';
import { ProductKind } from '../../generated/prisma/enums.js';

const MAX_AMOUNT = 999_999_999_999_999;
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
// Código del catálogo: letras, números, punto, guion y guion bajo (sin espacios)
const CODE = /^[A-Za-z0-9._-]{1,40}$/;

export class CreateProductDto {
  @IsString() @Matches(CODE, { message: 'code: hasta 40 letras, números, punto, guion o guion bajo, sin espacios' }) code: string;
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string;
  // GOODS = bien (mercancía); SERVICE = servicio
  @IsOptional() @IsEnum(ProductKind) kind?: ProductKind;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20) unit?: string; // "UND", "HORA", "GAL"...
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) salePrice?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) purchasePrice?: number;
  @IsOptional() @IsUUID() saleTaxRateId?: string;
  @IsOptional() @IsUUID() purchaseTaxRateId?: string;
  // Cuentas por defecto de la línea de factura; si no, las de Configuración contable
  @IsOptional() @IsUUID() incomeAccountId?: string;
  @IsOptional() @IsUUID() expenseAccountId?: string;
  // P2: solo bienes. Controla existencias con costo promedio; cuentas propias o las de Configuración contable
  @IsOptional() @IsBoolean() tracksInventory?: boolean;
  @IsOptional() @IsUUID() inventoryAccountId?: string;
  @IsOptional() @IsUUID() cogsAccountId?: string;
}

// undefined = no tocar; null = quitar (precios, impuestos y cuentas)
export class UpdateProductDto {
  @IsOptional() @IsString() @Matches(CODE, { message: 'code: hasta 40 letras, números, punto, guion o guion bajo, sin espacios' }) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(1000) description?: string | null;
  @IsOptional() @IsEnum(ProductKind) kind?: ProductKind;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20) unit?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) salePrice?: number | null;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) purchasePrice?: number | null;
  @IsOptional() @IsUUID() saleTaxRateId?: string | null;
  @IsOptional() @IsUUID() purchaseTaxRateId?: string | null;
  @IsOptional() @IsUUID() incomeAccountId?: string | null;
  @IsOptional() @IsUUID() expenseAccountId?: string | null;
  @IsOptional() @IsBoolean() tracksInventory?: boolean;
  @IsOptional() @IsUUID() inventoryAccountId?: string | null;
  @IsOptional() @IsUUID() cogsAccountId?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListProductsQuery {
  // Busca en código y nombre
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(ProductKind) kind?: ProductKind;
  @IsOptional() @Transform(toBool) @IsBoolean() active?: boolean;
  @IsOptional() @Transform(toBool) @IsBoolean() tracksInventory?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
