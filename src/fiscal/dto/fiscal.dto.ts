import { IsBoolean, IsDateString, IsEnum, IsIn, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { EXPORT_FORMATS, type ExportFormat } from '../../exports/dto/exports.dto.js';
import { AccountingFramework, DgiiClassification, LegalForm, TaxRegime } from '../../generated/prisma/enums.js';

export class DateQuery {
  @IsOptional() @IsDateString({}, { message: 'date debe ser una fecha AAAA-MM-DD' }) date?: string;
}

export class UpdateFiscalProfileDto {
  @IsOptional() @IsEnum(DgiiClassification, { message: 'Clasificación DGII inválida' }) dgiiClassification?: DgiiClassification | null;
  @IsOptional() @IsEnum(TaxRegime, { message: 'Régimen inválido' }) taxRegime?: TaxRegime | null;
  @IsOptional() @IsEnum(LegalForm, { message: 'Tipo de sociedad inválido' }) legalForm?: LegalForm | null;
  @IsOptional() @IsEnum(AccountingFramework, { message: 'Marco contable inválido' }) accountingFramework?: AccountingFramework | null;
  @IsOptional() @IsDateString({}, { message: 'Fecha de adopción inválida' }) frameworkAdoptionDate?: string | null;
  @IsOptional() @IsDateString({}, { message: 'Fecha de inicio como emisor e-CF inválida' }) ecfEmitterSince?: string | null;
  @IsOptional() @IsBoolean() isWithholdingAgent?: boolean;
}

export class LinkTaxDto {
  @IsString() @MaxLength(60) @Matches(/^[A-Z][A-Z0-9_]+$/, { message: 'Clave de parámetro inválida' }) parameterKey!: string;
}

export class ExportParametersQuery extends DateQuery {
  @IsIn(EXPORT_FORMATS, { message: 'format debe ser xlsx o pdf' }) format!: ExportFormat;
}
