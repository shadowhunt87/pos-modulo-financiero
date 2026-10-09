import {
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../generated/prisma/enums.js';

// OJO: ya no lleva companyId. La empresa del nuevo usuario es SIEMPRE la del
// admin que lo crea (sale del JWT), así un admin no puede meter usuarios en
// otra empresa.
export class RegisterDto {
  @IsEmail()
  email: string;

  // bcrypt solo procesa los primeros 72 bytes de la clave
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  // Opcional; si no se manda, el usuario entra como ACCOUNTANT
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
