import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { FeedbackKind, FeedbackStatus } from '../../generated/prisma/enums.js';

// Postgres no admite el byte nulo en un texto: sin esta regla, un \u0000 daría un error 500 al guardar
// oxlint-disable-next-line no-control-regex -- es justo lo que se quiere detectar
const NO_NULL = /^[^\u0000]*$/;
const NO_NULL_MSG = 'El texto tiene un carácter invisible no válido. Bórralo y vuelve a escribirlo';

// La fecha, el usuario, su rol y la empresa salen del servidor (token y reloj): el DTO no los acepta.
// El navegador se toma de la cabecera User-Agent.
export class CreateFeedbackDto {
  @IsEnum(FeedbackKind) kind!: FeedbackKind;
  // Se guarda tal cual (sin recortar ni escapar): el escape se hace al mostrarlo
  @IsString() @MaxLength(2000, { message: 'El comentario no puede pasar de 2000 caracteres' })
  @Matches(/\S/, { message: 'Escribe el comentario' }) @Matches(NO_NULL, { message: NO_NULL_MSG }) message!: string;
  // Pantalla desde la que se envía, ej. /sales/invoices/new
  @IsString() @MaxLength(200) @Matches(/^\//, { message: 'La pantalla desde la que se envía debe empezar con /' })
  @Matches(NO_NULL, { message: NO_NULL_MSG }) route!: string;
}

// Solo el ADMIN; null o "" en response/taskRef los borra
export class UpdateFeedbackDto {
  @IsOptional() @IsEnum(FeedbackStatus) status?: FeedbackStatus;
  @IsOptional() @IsString() @MaxLength(1000, { message: 'La respuesta no puede pasar de 1000 caracteres' })
  @Matches(NO_NULL, { message: NO_NULL_MSG }) response?: string | null;
  @IsOptional() @IsString() @MaxLength(100, { message: 'La referencia de tarea no puede pasar de 100 caracteres' })
  @Matches(NO_NULL, { message: NO_NULL_MSG }) taskRef?: string | null;
}

export class ListMyFeedbackQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ListFeedbackQuery extends ListMyFeedbackQuery {
  @IsOptional() @IsEnum(FeedbackStatus) status?: FeedbackStatus;
  @IsOptional() @IsEnum(FeedbackKind) kind?: FeedbackKind;
}
