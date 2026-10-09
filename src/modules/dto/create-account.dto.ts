import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';
import { AccountType } from '../../generated/prisma/enums.js';

export class CreateAccountDto {
  // Ej: "1101", "1.1.01", "4-101"
  @IsString()
  @Matches(/^[0-9A-Za-z.\-]{1,20}$/, {
    message: 'code solo admite letras, números, punto y guion (máx. 20)',
  })
  code: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  name: string;

  @IsEnum(AccountType)
  type: AccountType;

  // Cuenta padre (debe ser de la misma empresa y del mismo tipo)
  @IsOptional()
  @IsUUID()
  parentId?: string;
}
