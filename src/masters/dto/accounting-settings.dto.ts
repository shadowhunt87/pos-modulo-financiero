import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

// undefined = no tocar; null = quitar la cuenta configurada
export class UpdateAccountingSettingsDto {
  @IsOptional() @IsUUID() receivableAccountId?: string | null;
  @IsOptional() @IsUUID() payableAccountId?: string | null;
  @IsOptional() @IsUUID() salesIncomeAccountId?: string | null;
  @IsOptional() @IsUUID() purchaseExpenseAccountId?: string | null;
  @IsOptional() @IsUUID() salesDiscountAccountId?: string | null;
  @IsOptional() @IsUUID() customerAdvanceAccountId?: string | null;
  @IsOptional() @IsUUID() supplierAdvanceAccountId?: string | null;
  @IsOptional() @IsUUID() retainedEarningsAccountId?: string | null;
  @IsOptional() @IsUUID() currentYearResultAccountId?: string | null;
  @IsOptional() @IsUUID() fxGainAccountId?: string | null;
  @IsOptional() @IsUUID() fxLossAccountId?: string | null;
  @IsOptional() @IsUUID() roundingAccountId?: string | null;
  // P2: inventario (cada producto puede tener las suyas)
  @IsOptional() @IsUUID() inventoryAccountId?: string | null;
  @IsOptional() @IsUUID() cogsAccountId?: string | null;
  // Contrapartida por defecto de los ajustes de inventario (gasto por faltantes, patrimonio para existencias iniciales...)
  @IsOptional() @IsUUID() inventoryAdjustmentAccountId?: string | null;
  // true: los asientos manuales quedan en borrador hasta que otro usuario los apruebe
  @IsOptional() @IsBoolean() requireEntryApproval?: boolean;
}
