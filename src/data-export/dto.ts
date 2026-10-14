import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

export class DataExportDto {
  @IsOptional() @IsString() @MaxLength(72) confirmPassword?: string;
  @IsOptional() @IsString() @MaxLength(32) confirmCode?: string;
  @IsOptional() @IsIn(['ON_DEMAND', 'CANCELLATION']) purpose?: 'ON_DEMAND' | 'CANCELLATION';
}
