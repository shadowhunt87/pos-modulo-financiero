import { Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsIn, IsNumber, IsOptional, IsString, Matches, Max,
  MaxLength, Min, ValidateNested,
} from 'class-validator';
import { EXPORT_FORMATS, type ExportFormat } from '../../exports/dto/exports.dto.js';

const MAX_LIMIT = 999_999_999_999;
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

export class HealthQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
}

export class TrendQuery {
  @Matches(MONTH, { message: 'from: mes con formato AAAA-MM' }) from: string;
  @Matches(MONTH, { message: 'to: mes con formato AAAA-MM' }) to: string;
  @IsOptional() @IsIn(['MONTH', 'QUARTER', 'YEAR'], { message: 'granularity: MONTH, QUARTER o YEAR' })
  granularity?: 'MONTH' | 'QUARTER' | 'YEAR';
  // Hasta 4 razones separadas por coma (ej: currentRatio,netMargin). Vacío = las 4 principales.
  @IsOptional() @IsString() @MaxLength(200) keys?: string;
}

// Sin compareFrom/compareTo se compara con el mismo tramo del año anterior
export class CompareQuery extends HealthQuery {
  @IsOptional() @IsDateString() compareFrom?: string;
  @IsOptional() @IsDateString() compareTo?: string;
}

export class ThresholdItemDto {
  @IsString() @MaxLength(50) ratioKey: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(-MAX_LIMIT) @Max(MAX_LIMIT) greenAt: number;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(-MAX_LIMIT) @Max(MAX_LIMIT) redAt: number;
  // false = sin semáforo para esta razón en la empresa
  @IsOptional() @IsBoolean() enabled?: boolean;
}

export class UpdateThresholdsDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(30) @ValidateNested({ each: true }) @Type(() => ThresholdItemDto)
  thresholds: ThresholdItemDto[];
}

export class ExportHealthQuery extends HealthQuery {
  @IsIn(EXPORT_FORMATS, { message: 'format debe ser xlsx o pdf' }) format!: ExportFormat;
}

export class ExportCompareQuery extends CompareQuery {
  @IsIn(EXPORT_FORMATS, { message: 'format debe ser xlsx o pdf' }) format!: ExportFormat;
}
