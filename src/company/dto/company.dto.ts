import { Transform } from 'class-transformer';
import { IsEmail, IsInt, IsNotEmpty, IsOptional, IsString, IsUrl, Matches, Max, MaxLength, Min } from 'class-validator';

// RNC/cédula: solo dígitos ("131-12345-6" -> "131123456")
const digitsOnly = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/[\s-]/g, '') : value);

// undefined = no tocar; null = borrar (en los campos opcionales)
export class UpdateCompanyDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) name?: string;
  @IsOptional() @IsString() @MaxLength(200) legalName?: string | null;
  // Lo usan los reportes DGII: RNC (9) o cédula (11)
  @IsOptional() @Transform(digitsOnly) @Matches(/^(\d{9}|\d{11})$/, { message: 'taxId: RNC de 9 dígitos o cédula de 11' }) taxId?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string | null;
  @IsOptional() @IsString() @MaxLength(50) phone?: string | null;
  @IsOptional() @IsEmail() email?: string | null;
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['http', 'https'] }) @MaxLength(500) logoUrl?: string | null;
  // Solo se puede cambiar mientras no haya asientos
  @IsOptional() @Matches(/^[A-Z]{3}$/, { message: 'baseCurrency: código ISO de 3 letras' }) baseCurrency?: string;
  // Solo se puede cambiar mientras no haya años fiscales
  @IsOptional() @IsInt() @Min(1) @Max(12) fiscalYearStartMonth?: number;
}
