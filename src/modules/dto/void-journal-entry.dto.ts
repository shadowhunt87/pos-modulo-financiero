import { IsDateString, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class VoidJournalEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;

  // Fecha del reverso ("2027-04-01"). Obligatoria si el mes del asiento ya está cerrado.
  @IsOptional()
  @IsDateString()
  reverseOn?: string;
}
