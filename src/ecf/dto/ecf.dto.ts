import { IsArray, IsBoolean, IsIn, IsObject, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

// Lo que el XML no trae: la clasificación para el 606/607
export class ConfirmEcfImportDto {
  @IsOptional() @IsString() @Matches(/^(0[1-9]|1[01])$/, { message: 'dgiiExpenseType: 01 a 11' }) dgiiExpenseType?: string;
  @IsOptional() @IsString() @Matches(/^0[1-6]$/, { message: 'dgiiIncomeType: 01 a 06' }) dgiiIncomeType?: string;
}

export class EcfConnectionDto {
  @IsString() @MaxLength(30) providerCode!: string;
  @IsIn(['TEST', 'PROD']) environment!: 'TEST' | 'PROD';
  @IsIn(['OURS', 'PROVIDER']) numbering!: 'OURS' | 'PROVIDER';
  @IsOptional() @IsObject() settings?: Record<string, unknown>;
  // Se escriben, nunca se devuelven
  @IsOptional() @IsObject() credentials?: Record<string, string>;
  @IsArray() @IsString({ each: true }) ecfTypes!: string[];
  @IsBoolean() active!: boolean;
}

export class EcfInboxQuery {
  @IsOptional() @IsIn(['IMPORTED', 'PENDING_SEND', 'SENDING', 'ACCEPTED', 'ACCEPTED_CONDITIONAL', 'REJECTED', 'CONTINGENCY', 'VOID_UNUSED']) status?: string;
}
