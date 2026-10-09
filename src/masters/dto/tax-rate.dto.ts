import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { TaxApplies, TaxType } from '../../generated/prisma/enums.js';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class CreateTaxRateDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string; // "ITBIS 18%"
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) rate: number;
  @IsEnum(TaxType) type: TaxType;
  @IsOptional() @IsEnum(TaxApplies) appliesTo?: TaxApplies;
  @IsOptional() @IsString() @MaxLength(20) dgiiCode?: string;
  // Cuenta donde se acumula el impuesto en ventas (ej: ITBIS por pagar)
  @IsOptional() @IsUUID() salesAccountId?: string;
  // Cuenta donde se acumula en compras (ej: ITBIS adelantado)
  @IsOptional() @IsUUID() purchaseAccountId?: string;
}

export class UpdateTaxRateDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) rate?: number;
  @IsOptional() @IsEnum(TaxApplies) appliesTo?: TaxApplies;
  @IsOptional() @IsString() @MaxLength(20) dgiiCode?: string;
  @IsOptional() @IsUUID() salesAccountId?: string;
  @IsOptional() @IsUUID() purchaseAccountId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListTaxRatesQuery {
  @IsOptional() @Transform(toBool) @IsBoolean() active?: boolean;
  @IsOptional() @IsEnum(TaxType) type?: TaxType;
  @IsOptional() @IsEnum(TaxApplies) appliesTo?: TaxApplies;
}
