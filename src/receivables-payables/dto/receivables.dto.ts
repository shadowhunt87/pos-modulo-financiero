import { IsDateString, IsIn, IsNumber, IsOptional, IsUUID, Max, Min } from 'class-validator';

export const SCOPES = ['RECEIVABLE', 'PAYABLE'] as const;
export type Scope = (typeof SCOPES)[number];

export class StatementQuery {
  // RECEIVABLE = cuenta del cliente, PAYABLE = cuenta del proveedor
  @IsIn(SCOPES) scope: Scope;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

export class AgingQuery {
  @IsIn(SCOPES) scope: Scope;
  // Fecha de corte (default: hoy)
  @IsOptional() @IsDateString() asOf?: string;
}

export class ApplyCreditDto {
  @IsUUID() creditNoteId: string;
  @IsUUID() invoiceId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.01) @Max(999_999_999_999_999) amount: number;
}