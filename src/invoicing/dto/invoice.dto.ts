import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt, IsNotEmpty, IsNumber,
  IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { InvoiceStatus, InvoiceType } from '../../generated/prisma/enums.js';

const MAX_AMOUNT = 999_999_999_999_999;
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class InvoiceLineDto {
  @IsString() @IsNotEmpty() @MaxLength(300) description: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(MAX_AMOUNT) quantity: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) unitPrice: number;
  // Monto de descuento de la línea (no porcentaje)
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) discount?: number;
  @IsOptional() @IsUUID() taxRateId?: string;
  // Cuenta de ingreso/gasto; si no, se usa la de Configuración contable
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
}

export class InvoiceWithholdingDto {
  @IsUUID() taxRateId: string;
  // Base de la retención. Default: ITBIS de la factura (ITBIS retenido) o el subtotal (ISR)
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) base?: number;
}

class InvoiceBase {
  @IsOptional() @IsDateString() dueDate?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/, { message: 'currency: código ISO de 3 letras' }) currency?: string;
  // Si no viene y la moneda no es la base, se busca en Tasas de cambio
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) exchangeRate?: number;
  // Ventas: tipo de comprobante a emitir (B01, B02...). Compras: usa `ncf`
  @IsOptional() @IsString() @MaxLength(3) ncfType?: string;
  // Compras: NCF que viene en la factura del proveedor
  @IsOptional() @IsString() @MaxLength(13) ncf?: string;
  // Obligatorio en notas de crédito/débito: la factura que modifican
  @IsOptional() @IsUUID() relatedInvoiceId?: string;
  @IsOptional() @IsString() @Matches(/^(0[1-9]|1[01])$/, { message: 'dgiiExpenseType: 01 a 11' }) dgiiExpenseType?: string;
  @IsOptional() @IsString() @Matches(/^0[1-6]$/, { message: 'dgiiIncomeType: 01 a 06' }) dgiiIncomeType?: string;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class CreateInvoiceDto extends InvoiceBase {
  @IsEnum(InvoiceType) type: InvoiceType;
  @IsUUID() partnerId: string;
  @IsDateString() issueDate: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines: InvoiceLineDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => InvoiceWithholdingDto)
  withholdings?: InvoiceWithholdingDto[];
  // Crea y emite en un solo paso
  @IsOptional() @IsBoolean() issueNow?: boolean;
}

// Solo borradores. Si envías `lines` o `withholdings`, reemplazan por completo a los anteriores.
export class UpdateInvoiceDto extends InvoiceBase {
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsDateString() issueDate?: string;
  @IsOptional() @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => InvoiceLineDto)
  lines?: InvoiceLineDto[];
  @IsOptional() @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => InvoiceWithholdingDto)
  withholdings?: InvoiceWithholdingDto[];
}

export class IssueInvoiceDto {
  @IsOptional() @IsString() @MaxLength(3) ncfType?: string;
  @IsOptional() @IsString() @MaxLength(13) ncf?: string;
}

export class VoidInvoiceDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  // Código de anulación DGII (reporte 608): 01 a 10. Obligatorio si la factura tiene NCF emitido por ti.
  @IsOptional() @IsString() @Matches(/^(0[1-9]|10)$/, { message: 'reasonCode: 01 a 10' }) reasonCode?: string;
}

export class ListInvoicesQuery {
  @IsOptional() @IsEnum(InvoiceType) type?: InvoiceType;
  @IsOptional() @IsEnum(InvoiceStatus) status?: InvoiceStatus;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  // Busca por número interno o NCF
  @IsOptional() @IsString() @MaxLength(50) q?: string;
  // Emitidas/parcialmente pagadas con vencimiento pasado
  @IsOptional() @Transform(toBool) @IsBoolean() overdue?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}