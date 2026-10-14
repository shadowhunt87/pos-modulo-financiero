import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';
import { SOURCE_MODULE } from '../../invoicing/dto/invoice.dto.js';

export class CreateServiceKeyDto {
  // Para reconocerla en la lista, ej: "Taller Sirtech"
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  // Único origen que podrá usar en sus facturas, ej: "taller.orden"
  @IsString() @Matches(SOURCE_MODULE, { message: 'sourceModule: <sistema>.<documento>, ej. taller.orden' }) sourceModule: string;
}
