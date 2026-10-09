import { Type } from 'class-transformer';
import { IsDateString, IsInt, IsOptional, Max, Min } from 'class-validator';

/**
 * Rango de fechas común a todos los reportes. Las fechas llegan como
 * query params (strings ISO, ej: "2027-01-31") y se interpretan como
 * día completo en reports.service.ts vía startOfDay()/endOfDay().
 */
export class DateRangeQuery {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;
}

/**
 * Paginación para el libro diario. page/limit llegan como string desde
 * query params -> @Type(() => Number) los convierte antes de validar.
 * Requiere que el ValidationPipe global tenga `transform: true`.
 */
export class JournalBookQuery extends DateRangeQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/**
 * Paginación para el detalle de mayor por cuenta (auxiliar).
 * Separado de JournalBookQuery aunque hoy sea igual: el límite por
 * defecto es distinto (100 vs 50) y es el punto natural para agregar
 * filtros propios del auxiliar más adelante (ej: solo conciliados).
 */
export class LedgerDetailQuery extends DateRangeQuery {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit?: number;
}

/**
 * Estado de Resultados: es un período, no una fecha de corte, así que
 * from/to van requeridos aquí (a diferencia de DateRangeQuery, donde son
 * opcionales para los otros reportes).
 */
export class IncomeStatementQuery {
  @IsDateString()
  from: string;

  @IsDateString()
  to: string;
}

/**
 * Balance General: "as of" una fecha de corte. periodStart es desde cuándo
 * se cuenta el resultado del ejercicio que entra a Patrimonio (por defecto,
 * 1 de enero del año de asOf — ajústalo si el año fiscal no es calendario).
 */
export class BalanceSheetQuery {
  @IsDateString()
  asOf: string;

  @IsOptional()
  @IsDateString()
  periodStart?: string;
}