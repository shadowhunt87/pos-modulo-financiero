import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// Decimal(19,4): 15 enteros + 4 decimales
const MAX_AMOUNT = 999_999_999_999_999;

export class CreateFiscalYearDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string; // ej: "2027"

  @IsDateString()
  startDate!: string; // "2027-01-01"

  @IsDateString()
  endDate!: string; // "2027-12-31" (inclusive)

  /**
   * true (defecto): genera los períodos mensuales del año.
   * false: no crea períodos; enlaza al año los que ya existan dentro del rango.
   */
  @IsOptional()
  @IsBoolean()
  generatePeriods?: boolean;
}

export class ReopenFiscalYearDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(300)
  reason!: string;
}

export class OpeningLineDto {
  @IsUUID()
  accountId!: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_AMOUNT)
  debit?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 4 })
  @Min(0)
  @Max(MAX_AMOUNT)
  credit?: number;

  /** Cliente/proveedor al que pertenece el saldo (para cuentas por cobrar/pagar) */
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  description?: string;
}

export class OpeningBalanceDto {
  /** Fecha de los saldos (normalmente el primer día del primer período que se lleva en el sistema) */
  @IsDateString()
  date!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsArray()
  @ArrayMinSize(2)
  @ArrayMaxSize(2000)
  @ValidateNested({ each: true })
  @Type(() => OpeningLineDto)
  lines!: OpeningLineDto[];
}