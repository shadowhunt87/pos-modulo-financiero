import { IsIn, IsOptional } from 'class-validator';

export const CHART_EXPORT_FORMATS = ['xlsx', 'csv'] as const;
export type ChartExportFormat = (typeof CHART_EXPORT_FORMATS)[number];

export class ExportChartQuery {
  // Sin format = xlsx
  @IsOptional()
  @IsIn(CHART_EXPORT_FORMATS, { message: 'El formato debe ser Excel (xlsx) o CSV' })
  format?: ChartExportFormat;
}
