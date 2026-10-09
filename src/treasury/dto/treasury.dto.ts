import { Transform, Type } from 'class-transformer';
import {
  Allow, ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsIn, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString,
  IsUUID, Matches, Max, MaxLength, Min, MinLength, ValidateNested,
} from 'class-validator';
import { BankTransactionStatus } from '../../generated/prisma/enums.js';
import { IsEnum } from 'class-validator';

const MAX_AMOUNT = 999_999_999_999_999;
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

// ---------- Cuentas bancarias ----------
export class CreateBankAccountDto {
  @IsString() @IsNotEmpty() @MaxLength(100) bankName: string;
  @IsString() @IsNotEmpty() @MaxLength(50) accountNumber: string;
  @IsOptional() @IsString() @MaxLength(34) iban?: string;
  @IsOptional() @IsString() @MaxLength(11) swift?: string;
  @IsOptional() @IsIn(['CHECKING', 'SAVINGS']) type?: 'CHECKING' | 'SAVINGS';
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  // Cuenta contable (activo) que representa a este banco en el mayor
  @IsUUID() glAccountId: string;
  // Informativo: el saldo inicial real entra por un asiento de apertura
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) openingBalance?: number;
  @IsOptional() @IsDateString() openingBalanceDate?: string;
}

export class UpdateBankAccountDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() @MaxLength(34) iban?: string;
  @IsOptional() @IsString() @MaxLength(11) swift?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

// ---------- Cajas ----------
export class CreateCashRegisterDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{3}$/) currency?: string;
  @IsUUID() glAccountId: string;
  @IsOptional() @IsUUID() custodianId?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) openingBalance?: number;
}

export class UpdateCashRegisterDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsUUID() custodianId?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

// ---------- Movimientos del banco ----------
export class AddTransactionDto {
  @IsDateString() date: string;
  @IsString() @IsNotEmpty() @MaxLength(300) description: string;
  // + entrada / - salida
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(-MAX_AMOUNT) @Max(MAX_AMOUNT) amount: number;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) balanceAfter?: number;
  @IsOptional() @IsString() @MaxLength(100) externalId?: string;
}

export class ListTransactionsQuery {
  @IsOptional() @IsEnum(BankTransactionStatus) status?: BankTransactionStatus;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

export class ImportRowDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() description?: string;
  @Allow() amount?: string | number;
  @Allow() debit?: string | number;
  @Allow() credit?: string | number;
  @IsOptional() @IsString() reference?: string;
  @Allow() balance?: string | number;
  @IsOptional() @IsString() externalId?: string;
}

class ColumnsDto {
  @IsOptional() @IsString() date?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() amount?: string;
  @IsOptional() @IsString() debit?: string;
  @IsOptional() @IsString() credit?: string;
  @IsOptional() @IsString() reference?: string;
  @IsOptional() @IsString() balance?: string;
}

// Envía `csv` (texto del archivo) o `rows` (ya parseadas), no ambos.
export class ImportStatementDto {
  @IsOptional() @IsString() @MaxLength(5_000_000) csv?: string;
  @IsOptional() @IsArray() @ArrayMaxSize(5000) @ValidateNested({ each: true }) @Type(() => ImportRowDto) rows?: ImportRowDto[];
  @IsOptional() @IsIn([',', ';', '\t', '|']) delimiter?: string;
  @IsOptional() @IsBoolean() hasHeader?: boolean;
  // Formato de fecha cuando no es ISO. Default DMY (31/12/2027)
  @IsOptional() @IsIn(['ISO', 'DMY', 'MDY']) dateFormat?: 'ISO' | 'DMY' | 'MDY';
  // '.' => 1,234.56   ',' => 1.234,56
  @IsOptional() @IsIn(['.', ',']) decimalSeparator?: '.' | ',';
  // Nombres de columna si el banco usa encabezados no estándar
  @IsOptional() @ValidateNested() @Type(() => ColumnsDto) columns?: ColumnsDto;
  // Categorizar de una vez con las reglas
  @IsOptional() @IsBoolean() applyRules?: boolean;
}

export class CategorizeDto {
  // Cuenta contraparte (ej: Gastos bancarios, Intereses ganados)
  @IsUUID() accountId: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
}

// ---------- Reglas ----------
export class CreateBankRuleDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  // El movimiento coincide si su descripción CONTIENE este texto (sin distinguir mayúsculas)
  @IsString() @MinLength(2) @MaxLength(100) matchText: string;
  @IsUUID() accountId: string;
  @IsOptional() @IsUUID() bankAccountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) priority?: number;
}

export class UpdateBankRuleDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MinLength(2) @MaxLength(100) matchText?: string;
  @IsOptional() @IsUUID() accountId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) priority?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListBankRulesQuery {
  @IsOptional() @Transform(toBool) @IsBoolean() active?: boolean;
}

// ---------- Transferencias ----------
export class TransferDto {
  @IsIn(['BANK', 'CASH']) fromType: 'BANK' | 'CASH';
  @IsUUID() fromId: string;
  @IsIn(['BANK', 'CASH']) toType: 'BANK' | 'CASH';
  @IsUUID() toId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.01) @Max(MAX_AMOUNT) amount: number;
  @IsDateString() date: string;
  @IsOptional() @IsString() @MaxLength(300) description?: string;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}