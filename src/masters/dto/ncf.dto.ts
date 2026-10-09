import { Type } from 'class-transformer';
import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export const NCF_TYPE_REGEX = /^(B(01|02|03|04|11|12|13|14|15|16|17)|E(31|32|33|34|41|43|44|45|46|47))$/;

export class CreateNcfSequenceDto {
  @IsString() @Matches(NCF_TYPE_REGEX, { message: 'ncfType inválido (ej: B01, B02, B14, E31)' })
  ncfType: string;

  @Type(() => Number) @IsInt() @Min(1) rangeStart: number;
  @Type(() => Number) @IsInt() @Min(1) rangeEnd: number;

  // Último número YA usado (para migrar una secuencia en curso). Default: rangeStart - 1
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) lastUsedNumber?: number;

  @IsOptional() @IsDateString() expirationDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) warningThreshold?: number;
}

export class UpdateNcfSequenceDto {
  // Solo se puede AMPLIAR el rango; para otro rango usa /renew
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) rangeEnd?: number;
  @IsOptional() @IsDateString() expirationDate?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) warningThreshold?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class RenewNcfSequenceDto {
  @Type(() => Number) @IsInt() @Min(1) rangeStart: number;
  @Type(() => Number) @IsInt() @Min(1) rangeEnd: number;
  @IsOptional() @IsDateString() expirationDate?: string;
}
