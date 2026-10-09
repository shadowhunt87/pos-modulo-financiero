import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';
import { DateRangeQuery } from './reports-queries.dto.js';

// Mayor de una cuenta con documentos origen; con partnerId es el auxiliar de un tercero
export class DocumentLedgerQuery extends DateRangeQuery {
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
}

// Auxiliar: saldo de una cuenta desglosado por tercero
export class SubledgerQuery extends DateRangeQuery {
  @IsUUID() accountId: string;
}

export class CashFlowQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
}