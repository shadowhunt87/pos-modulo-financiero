import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min,
} from 'class-validator';
import { ReconciliationStatus } from '../../generated/prisma/enums.js';

export class MatchTransactionDto {
  // Líneas del mayor (cuenta contable del banco) que cubren este movimiento. Deben sumar su monto exacto.
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(50) @IsUUID('all', { each: true }) journalEntryLineIds: string[];
}

export class SuggestionsQuery {
  // Tolerancia en días entre el movimiento y el asiento
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(30) days?: number;
}

export class CreateReconciliationDto {
  @IsUUID() bankAccountId: string;
  // Fecha de corte del extracto
  @IsDateString() statementDate: string;
  // Saldo final que dice el extracto del banco
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(-999_999_999_999_999) @Max(999_999_999_999_999) statementBalance: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

export class ListReconciliationsQuery {
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsOptional() @IsEnum(ReconciliationStatus) status?: ReconciliationStatus;
}