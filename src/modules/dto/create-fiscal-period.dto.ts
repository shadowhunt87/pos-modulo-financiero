import { IsDateString, IsNotEmpty, IsString, MaxLength } from 'class-validator';

export class CreateFiscalPeriodDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name: string; // ej: "Enero 2027"

  // "2027-01-01" (inicio del día, UTC)
  @IsDateString()
  startDate: string;

  // "2027-01-31" (INCLUSIVE: se toma hasta las 23:59:59.999 UTC)
  @IsDateString()
  endDate: string;
}
