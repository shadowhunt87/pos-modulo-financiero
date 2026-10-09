import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class VoidJournalEntryDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  reason: string;
}
