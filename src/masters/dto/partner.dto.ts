import { Transform, Type } from 'class-transformer';
import {
  IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString,
  Matches, Max, MaxLength, Min,
} from 'class-validator';
import { PartnerType, TaxIdType } from '../../generated/prisma/enums.js';

const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;
// RNC/cédula: se guardan solo con dígitos ("131-12345-6" -> "131123456")
const digitsOnly = ({ value }: { value: unknown }) =>
  typeof value === 'string' ? value.replace(/[\s-]/g, '') : value;

export class CreatePartnerDto {
  @IsEnum(PartnerType) type: PartnerType;
  @IsString() @IsNotEmpty() @MaxLength(200) name: string;
  @IsOptional() @IsString() @MaxLength(200) tradeName?: string;

  @IsOptional() @IsEnum(TaxIdType) taxIdType?: TaxIdType;
  // RNC (9 dígitos) o cédula (11). La coherencia con taxIdType se valida en el service.
  @IsOptional() @Transform(digitsOnly) @IsString() @MaxLength(20) taxId?: string;

  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/, { message: 'country: código ISO de 2 letras' }) country?: string;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) creditLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @IsOptional() @IsString() @MaxLength(10) defaultNcfType?: string;
  @IsOptional() @IsBoolean() isWithholdingAgent?: boolean;
}

export class UpdatePartnerDto {
  @IsOptional() @IsEnum(PartnerType) type?: PartnerType;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(200) name?: string;
  @IsOptional() @IsString() @MaxLength(200) tradeName?: string;
  @IsOptional() @IsEnum(TaxIdType) taxIdType?: TaxIdType;
  @IsOptional() @Transform(digitsOnly) @IsString() @MaxLength(20) taxId?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @MaxLength(50) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsString() @MaxLength(100) city?: string;
  @IsOptional() @IsString() @Matches(/^[A-Z]{2}$/) country?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) creditLimit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(365) paymentTermsDays?: number;
  @IsOptional() @IsString() @MaxLength(10) defaultNcfType?: string;
  @IsOptional() @IsBoolean() isWithholdingAgent?: boolean;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListPartnersQuery {
  @IsOptional() @IsEnum(PartnerType) type?: PartnerType;
  @IsOptional() @Transform(toBool) @IsBoolean() active?: boolean;
  // Busca en nombre, nombre comercial y RNC/cédula
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}
