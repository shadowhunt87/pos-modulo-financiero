import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginTwoFactorDto {
  @IsString() @MinLength(1) @MaxLength(2048) challengeToken!: string;
  @IsString() @MinLength(1) @MaxLength(32) code!: string;
}

export class EnrollStartDto {
  @IsString() @MinLength(1) @MaxLength(2048) challengeToken!: string;
}

export class SetupTwoFactorDto {
  @IsString() @MinLength(1) @MaxLength(72) password!: string;
  // Obligatorio si ya está activo (cambio de teléfono)
  @IsOptional() @IsString() @MaxLength(32) code?: string;
}

export class EnableTwoFactorDto {
  @IsString() @MinLength(1) @MaxLength(32) code!: string;
}

export class ConfirmTwoFactorDto {
  @IsString() @MinLength(1) @MaxLength(72) password!: string;
  @IsString() @MinLength(1) @MaxLength(32) code!: string;
}
