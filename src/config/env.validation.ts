import { plainToInstance } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
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

  // Cuántos proxies hay delante del backend (nginx = 1). 0 = ninguno: se ignora X-Forwarded-For.
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10)
  TRUST_PROXY?: number;

  // Orígenes permitidos por CORS, separados por coma (ej: https://app.midominio.com). Vacío = CORS apagado.
  @IsOptional()
  @IsString()
  CORS_ORIGINS?: string;

  // Carpeta donde se guardan los adjuntos (default ./uploads). En producción: un volumen persistente.
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  UPLOADS_DIR?: string;

  // Tamaño máximo por adjunto en MB (default 10)
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  MAX_UPLOAD_MB?: number;

  // Verificación en dos pasos (ANEXO-S0 §3.3). Llave de 64 hex (openssl rand -hex 32), distinta de JWT_SECRET.
  // Obligatoria solo si TWO_FACTOR_REQUIRED_ROLES no está vacía.
  @IsOptional()
  @IsString()
  TWO_FACTOR_ENCRYPTION_KEY?: string;

  // Roles que deben tener 2FA, separados por coma (ej: ADMIN). Vacía = nadie obligado (D41: se enciende después de la activación acompañada)
  @IsOptional()
  @IsString()
  TWO_FACTOR_REQUIRED_ROLES?: string;

  // Nombre que se ve en la app del teléfono (D46). Por defecto "Finanzas"
  @IsOptional()
  @IsString()
  @MaxLength(40)
  @Matches(/^[^:]*$/, { message: 'TWO_FACTOR_ISSUER no puede llevar ":"' })
  TWO_FACTOR_ISSUER?: string;

  // "true" publica la documentación de la API en /docs (solo para la red interna; nginx no la expone)
  @IsOptional()
  @IsIn(['true', 'false'])
  API_DOCS?: string;
}

/** Motivo por el que un JWT_SECRET es débil, o null si está bien. */
export function weakSecretReason(secret: string): string | null {
  if (new Set(secret).size < 10) return 'tiene muy pocos caracteres distintos (parece repetitivo)';
  if (/cambiar|changeme|change-me|change_me|secret|password|example|ejemplo|replace|your[-_ ]?key/i.test(secret)) {
    return 'parece un valor de ejemplo; genera uno real';
  }
  return null;
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

  const weak = weakSecretReason(validated.JWT_SECRET);
  if (weak) {
    throw new Error(`Variables de entorno inválidas:\n  - JWT_SECRET: ${weak}. Genera uno con: openssl rand -hex 64`);
  }

  // Vacío = ausente
  for (const k of ['TWO_FACTOR_ENCRYPTION_KEY', 'TWO_FACTOR_REQUIRED_ROLES', 'TWO_FACTOR_ISSUER'] as const) {
    if (validated[k] === '') validated[k] = undefined;
  }
  const roles = (validated.TWO_FACTOR_REQUIRED_ROLES ?? '').split(',').map((r) => r.trim()).filter(Boolean);
  const badRole = roles.find((r) => !['ADMIN', 'ACCOUNTANT', 'APPROVER', 'VIEWER'].includes(r));
  if (badRole) throw new Error(`Variables de entorno inválidas:\n  - TWO_FACTOR_REQUIRED_ROLES: "${badRole}" no es un rol (ADMIN, ACCOUNTANT, APPROVER, VIEWER)`);
  const key = validated.TWO_FACTOR_ENCRYPTION_KEY;
  if (roles.length && !key) {
    throw new Error('Variables de entorno inválidas:\n  - TWO_FACTOR_ENCRYPTION_KEY: es obligatoria si TWO_FACTOR_REQUIRED_ROLES no está vacía. Genérala con: openssl rand -hex 32');
  }
  if (key) {
    const why = !/^[0-9a-fA-F]{64}$/.test(key) ? 'debe tener exactamente 64 caracteres hexadecimales'
      : key === validated.JWT_SECRET ? 'debe ser distinta de JWT_SECRET' : weakSecretReason(key);
    if (why) throw new Error(`Variables de entorno inválidas:\n  - TWO_FACTOR_ENCRYPTION_KEY: ${why}. Genérala con: openssl rand -hex 32`);
  }

  return validated;
}
