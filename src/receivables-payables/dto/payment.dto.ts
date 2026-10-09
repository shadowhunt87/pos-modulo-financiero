import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PaymentDirection, PaymentMethod, PaymentStatus } from '../../generated/prisma/enums.js';

const MAX_AMOUNT = 999_999_999_999_999;

export class AllocationDto {
  @IsUUID() invoiceId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.01) @Max(MAX_AMOUNT) amount: number;
}

export class CreatePaymentDto {
  // RECEIVED = cobro a cliente, MADE = pago a proveedor
  @IsEnum(PaymentDirection) direction: PaymentDirection;
  @IsUUID() partnerId: string;
  @IsDateString() date: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.01) @Max(MAX_AMOUNT) amount: number;
  @IsEnum(PaymentMethod) method: PaymentMethod;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 6 }) @Min(0.000001) exchangeRate?: number;
  @IsOptional() @IsString() @MaxLength(100) reference?: string; // nº cheque / transferencia
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
  // Exactamente uno de los dos
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsOptional() @IsUUID() cashRegisterId?: string;
  // Facturas que cubre. Lo que sobre del monto queda como anticipo.
  @IsOptional() @IsArray() @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AllocationDto)
  allocations?: AllocationDto[];
}

// Aplica el anticipo no consumido de un pago a facturas pendientes
export class AllocatePaymentDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @ValidateNested({ each: true }) @Type(() => AllocationDto)
  allocations: AllocationDto[];
  @IsOptional() @IsDateString() date?: string;
}

export class VoidPaymentDto {
  @IsString() @MaxLength(500) reason: string;
}

export class ListPaymentsQuery {
  @IsOptional() @IsEnum(PaymentDirection) direction?: PaymentDirection;
  @IsOptional() @IsEnum(PaymentStatus) status?: PaymentStatus;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}