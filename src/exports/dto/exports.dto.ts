import { IsDateString, IsIn, IsOptional, Matches } from 'class-validator';

export const EXPORT_FORMATS = ['xlsx', 'pdf'] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];

class FormatQuery {
  @IsIn(EXPORT_FORMATS, { message: 'format debe ser xlsx o pdf' })
  format!: ExportFormat;
}

/** Rango opcional (balanza, mayor): sin fechas = todo el historial */
export class ExportRangeQuery extends FormatQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

/** Rango obligatorio (resultados, flujo, razones) */
export class ExportPeriodQuery extends FormatQuery {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
}

export class ExportBalanceSheetQuery extends FormatQuery {
  @IsDateString() asOf!: string;
  @IsOptional() @IsDateString() periodStart?: string;
}

export class ExportDgiiQuery extends FormatQuery {
  @Matches(/^\d{4}-?(0[1-9]|1[0-2])$/, { message: 'period debe ser AAAA-MM o AAAAMM, ej: 2027-03' })
  period!: string;
}
