import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsEnum, IsOptional, IsUUID, ValidateNested } from 'class-validator';
import { AccountCategory, CashFlowCategory, SubledgerType } from '../../generated/prisma/enums.js';

// En cada campo: undefined = no tocar, null = quitar la clasificación
export class ClassificationItemDto {
  @IsUUID() accountId: string;
  @IsOptional() @IsEnum(AccountCategory) category?: AccountCategory | null;
  @IsOptional() @IsEnum(CashFlowCategory) cashFlowCategory?: CashFlowCategory | null;
  @IsOptional() @IsBoolean() isContra?: boolean;
  @IsOptional() @IsEnum(SubledgerType) subledger?: SubledgerType | null;
}

export class BulkClassificationDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(500) @ValidateNested({ each: true }) @Type(() => ClassificationItemDto)
  items: ClassificationItemDto[];
}

export class AutoClassifyDto {
  // false (default) = solo muestra la propuesta; true = la aplica
  @IsOptional() @IsBoolean() apply?: boolean;
}
