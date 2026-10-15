import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID,
  Max, MaxLength, Min, ValidateNested,
} from 'class-validator';

const MAX_AMOUNT = 999_999_999_999_999;
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class AdjustmentLineDto {
  @IsUUID() productId: string;
  // + entra (existencia inicial, sobrante); − sale (faltante, merma, daño). Nunca cero.
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(-MAX_AMOUNT) @Max(MAX_AMOUNT) quantity: number;
  // Costo unitario en moneda base: obligatorio en las entradas; las salidas usan el costo promedio
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(0) @Max(MAX_AMOUNT) unitCost?: number;
}

export class CreateAdjustmentDto {
  @IsDateString() date: string;
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  // Contrapartida del asiento; si no, la de Configuración contable (inventoryAdjustmentAccountId)
  @IsOptional() @IsUUID() counterAccountId?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => AdjustmentLineDto)
  lines: AdjustmentLineDto[];
}

export class VoidAdjustmentDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

export class StockQuery {
  // Busca en código y nombre
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  // true: solo productos con existencia distinta de cero
  @IsOptional() @Transform(toBool) @IsBoolean() withStock?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class MovementsQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class ListAdjustmentsQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
