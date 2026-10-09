import { plainToInstance } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
  validateSync,
} from 'class-validator';

/**
 * Variables de entorno obligatorias. Si falta alguna o es inválida,
 * la app NO arranca y el error dice exactamente cuál es.
 */
class EnvironmentVariables {
  @IsString()
  @IsNotEmpty()
  DATABASE_URL: string;

  // 32+ caracteres. Genera uno con: openssl rand -hex 64
  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  // Duración del token en SEGUNDOS (default en AuthModule: 28800 = 8 h)
  @IsOptional()
  @IsInt()
  @Min(60)
  @Max(2_592_000) // 30 días
  JWT_EXPIRES_IN_SECONDS?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65535)
  PORT?: number;
}

export function validate(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    const detail = errors
      .map((e) => `  - ${e.property}: ${Object.values(e.constraints ?? {}).join(', ')}`)
      .join('\n');
    throw new Error(`Variables de entorno inválidas:\n${detail}`);
  }

  return validated;
}
