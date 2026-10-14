import { IsOptional, IsString, Matches } from 'class-validator';

// Lo que el XML no trae: la clasificación para el 606/607
export class ConfirmEcfImportDto {
  @IsOptional() @IsString() @Matches(/^(0[1-9]|1[01])$/, { message: 'dgiiExpenseType: 01 a 11' }) dgiiExpenseType?: string;
  @IsOptional() @IsString() @Matches(/^0[1-6]$/, { message: 'dgiiIncomeType: 01 a 06' }) dgiiIncomeType?: string;
}
