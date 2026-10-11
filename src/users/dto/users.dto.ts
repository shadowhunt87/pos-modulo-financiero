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

export class UpdateUserDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(150) name?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsEnum(UserRole) role?: UserRole;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class UpdateProfileDto {
  @IsString() @IsNotEmpty() @MaxLength(150) name: string;
}

// bcrypt solo procesa los primeros 72 bytes de la clave
export class ResetPasswordDto {
  @IsString() @MinLength(8) @MaxLength(72) password: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(72) currentPassword: string;
  @IsString() @MinLength(8) @MaxLength(72) newPassword: string;
}
