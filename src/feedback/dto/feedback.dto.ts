import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { FeedbackKind, FeedbackStatus } from '../../generated/prisma/enums.js';

// La fecha, el usuario, su rol y la empresa salen del servidor (token y reloj): el DTO no los acepta.
// El navegador se toma de la cabecera User-Agent.
export class CreateFeedbackDto {
  @IsEnum(FeedbackKind) kind!: FeedbackKind;
  // Se guarda tal cual (sin recortar ni escapar): el escape se hace al mostrarlo
  @IsString() @MaxLength(2000) @Matches(/\S/, { message: 'message: escribe el comentario' }) message!: string;
  // Pantalla desde la que se envía, ej. /sales/invoices/new
  @IsString() @MaxLength(200) @Matches(/^\//, { message: 'route: debe empezar con /' }) route!: string;
}

// Solo el ADMIN; null o "" en response/taskRef los borra
export class UpdateFeedbackDto {
  @IsOptional() @IsEnum(FeedbackStatus) status?: FeedbackStatus;
  @IsOptional() @IsString() @MaxLength(1000) response?: string | null;
  @IsOptional() @IsString() @MaxLength(100) taskRef?: string | null;
}

export class ListMyFeedbackQuery {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ListFeedbackQuery extends ListMyFeedbackQuery {
  @IsOptional() @IsEnum(FeedbackStatus) status?: FeedbackStatus;
  @IsOptional() @IsEnum(FeedbackKind) kind?: FeedbackKind;
}
