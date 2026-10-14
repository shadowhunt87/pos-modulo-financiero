import { Transform, Type } from 'class-transformer';
import { IsBoolean, IsEmail, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, MaxLength, Max, Min, MinLength } from 'class-validator';
import { UserRole } from '../../generated/prisma/enums.js';

const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);

export class ListUsersQuery {
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @Transform(toBool) @IsBoolean() active?: boolean;
  // Busca por nombre o email
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

/** Confirmación reforzada de quien hace una acción delicada (ANEXO-S0 3.10b). */
class Confirmation {
  @IsOptional() @IsString() @MaxLength(72) confirmPassword?: string;
  @IsOptional() @IsString() @MaxLength(32) confirmCode?: string;
}

export class UpdateUserDto extends Confirmation {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateProfileDto {
  @IsString() @IsNotEmpty() @MaxLength(150) name: string;
}

// bcrypt solo procesa los primeros 72 bytes de la clave
export class ResetPasswordDto extends Confirmation {
  @IsString() @MinLength(8) @MaxLength(72) password: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(72) currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(72) newPassword: string;
  // Obligatorio si el usuario tiene 2FA (ANEXO-S0 3.9)
  @IsOptional() @IsString() @MaxLength(32) code?: string;
}

/** E9: el ADMIN quita el 2FA de otro usuario y le fija una clave nueva (N1). */
export class ResetTwoFactorDto extends Confirmation {
  @IsString() @MinLength(8) @MaxLength(72) newPassword: string;
}

export class SecurityEventsQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(90) days?: number;
}
