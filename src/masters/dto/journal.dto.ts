import { IsEnum, IsBoolean, IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';
import { JournalType } from '../../generated/prisma/enums.js';

export class CreateJournalDto {
  @IsString() @Matches(/^[A-Z0-9]{1,6}$/, { message: 'code: 1-6 caracteres A-Z/0-9' }) code: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsEnum(JournalType) type: JournalType;
}

export class UpdateJournalDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}
