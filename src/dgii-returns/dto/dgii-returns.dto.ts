import { IsIn, IsOptional, Matches } from 'class-validator';
import { EXPORT_FORMATS, type ExportFormat } from '../../exports/dto/exports.dto.js';

export class PeriodQuery {
  @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'period: mes con formato AAAA-MM' }) period!: string;
}

export class ExportPeriodQuery extends PeriodQuery {
  @IsOptional() @IsIn(EXPORT_FORMATS, { message: 'format debe ser xlsx o pdf' }) format?: ExportFormat;
}
