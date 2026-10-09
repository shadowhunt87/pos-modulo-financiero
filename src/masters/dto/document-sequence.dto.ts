import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Matches, Max, Min } from 'class-validator';

export class UpdateDocumentSequenceDto {
  @IsOptional() @IsString() @Matches(/^[A-Z0-9-]{0,10}$/) prefix?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) padding?: number;
  // Solo se permite subir el contador (nunca reutilizar números)
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) nextNumber?: number;
}
