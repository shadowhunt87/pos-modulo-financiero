import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNotEmpty, IsNumber, IsObject, IsOptional,
  IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import { PosCashMovementType, PosPayMethod, PosPromotionType } from '../../generated/prisma/enums.js';

const MAX_AMOUNT = 999_999_999_999;
const NCF_TYPE = /^[BE]\d{2}$/;
const toBool = ({ value }: { value: unknown }) => (value === 'true' ? true : value === 'false' ? false : value);
/** Acciones que piden PIN de supervisor a un cajero (D-POS6) */
export const APPROVAL_ACTIONS = ['DISCOUNT', 'VOID', 'RETURN', 'CASH_OUT', 'DRAWER', 'CREDIT_SALE'] as const;
export type ApprovalAction = (typeof APPROVAL_ACTIONS)[number];

// ---------------- Configuración ----------------
export class UpdatePosSettingsDto {
  @IsOptional() @IsUUID() defaultPartnerId?: string;
  @IsOptional() @Matches(NCF_TYPE, { message: 'defaultNcfType: tipo de comprobante (B02, E32...)' }) defaultNcfType?: string;
  @IsOptional() @Matches(NCF_TYPE, { message: 'fiscalCreditNcfType: tipo de comprobante (B01, E31...)' }) fiscalCreditNcfType?: string;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100) maxDiscountPct?: number;
  @IsOptional() @IsUUID() cashOverShortAccountId?: string | null;
  @IsOptional() @IsString() @MaxLength(300) receiptFooter?: string | null;
}

export class CreateTerminalDto {
  @IsString() @Matches(/^[A-Za-z0-9._-]{1,20}$/, { message: 'code: hasta 20 letras o números, sin espacios' }) code: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsUUID() cashRegisterId: string;
  @IsOptional() @IsUUID() cardBankAccountId?: string;
  @IsOptional() @IsUUID() transferBankAccountId?: string;
}

export class UpdateTerminalDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsUUID() cashRegisterId?: string;
  @IsOptional() @IsUUID() cardBankAccountId?: string | null;
  @IsOptional() @IsUUID() transferBankAccountId?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class SetPinDto {
  @IsString() @Matches(/^\d{4,6}$/, { message: 'El PIN es de 4 a 6 números' }) pin: string;
}

// ---------------- Catálogo de la caja ----------------
export class CategoryDto {
  @IsString() @IsNotEmpty() @MaxLength(60) name: string;
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/, { message: 'color: #RRGGBB' }) color?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ProductSettingDto {
  @IsUUID() productId: string;
  @IsOptional() @IsUUID() categoryId?: string | null;
  @IsOptional() @IsBoolean() showInPos?: boolean;
  @IsOptional() @IsInt() @Min(0) @Max(9999) sortOrder?: number;
  // Reemplaza los códigos de barra del producto
  @IsOptional() @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Matches(/^[A-Za-z0-9-]{1,40}$/, { each: true, message: 'Código de barras inválido' })
  barcodes?: string[];
}

export class PromotionDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsEnum(PosPromotionType) type: PosPromotionType;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(MAX_AMOUNT) value?: number;
  @IsOptional() @IsInt() @Min(2) @Max(100) buyQty?: number;
  @IsOptional() @IsInt() @Min(0) @Max(99) payQty?: number;
  @IsOptional() @IsArray() @ArrayMaxSize(500) @IsUUID('all', { each: true }) productIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(100) @IsUUID('all', { each: true }) categoryIds?: string[];
  @IsOptional() @IsDateString() startsAt?: string | null;
  @IsOptional() @IsDateString() endsAt?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(7) @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true }) weekdays?: number[];
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'timeFrom: HH:MM' }) timeFrom?: string | null;
  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/, { message: 'timeTo: HH:MM' }) timeTo?: string | null;
  @IsOptional() @IsInt() @Min(0) @Max(100) priority?: number;
  @IsOptional() @IsBoolean() active?: boolean;
}

// ---------------- Autorizaciones ----------------
export class CreateApprovalDto {
  @IsIn(APPROVAL_ACTIONS) action: ApprovalAction;
  // Supervisor que autoriza (su correo) y su PIN
  @IsString() @IsNotEmpty() @MaxLength(200) supervisorEmail: string;
  @IsString() @Matches(/^\d{4,6}$/, { message: 'PIN inválido' }) pin: string;
}

// ---------------- Turnos ----------------
export class OpenShiftDto {
  @IsUUID() terminalId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_AMOUNT) openingCash: number;
}

export class CashMovementDto {
  @IsEnum(PosCashMovementType) type: PosCashMovementType;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(MAX_AMOUNT) amount: number;
  @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
  // Contrapartida: gasto menor, banco donde se depositó, fondo de caja...
  @IsUUID() accountId: string;
  @IsOptional() @IsUUID() approvalId?: string;
}

export class DrawerOpenDto {
  @IsString() @IsNotEmpty() @MaxLength(300) reason: string;
  @IsOptional() @IsUUID() approvalId?: string;
}

export class CloseShiftDto {
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_AMOUNT) countedCash: number;
  // { "2000": 3, "500": 1, ... } (denominación → cantidad)
  @IsOptional() @IsObject() countDetail?: Record<string, number>;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class ListShiftsQuery {
  @IsOptional() @IsUUID() terminalId?: string;
  @IsOptional() @IsIn(['OPEN', 'CLOSED']) status?: 'OPEN' | 'CLOSED';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

// ---------------- Ventas ----------------
export class SaleLineDto {
  @IsUUID() productId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(MAX_AMOUNT) quantity: number;
  // Descuento manual de la línea (monto, sobre lo que queda después de la promoción)
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(MAX_AMOUNT) discount?: number;
}

export class SalePaymentDto {
  @IsEnum(PosPayMethod) method: PosPayMethod;
  // Efectivo: lo que entregó el cliente (puede ser más que el total: se calcula el cambio)
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(MAX_AMOUNT) amount: number;
  @IsOptional() @IsString() @MaxLength(100) reference?: string;
}

export class CreateSaleDto {
  // Id que genera la caja: un reintento con el mismo id devuelve la misma venta (no cobra dos veces)
  @IsString() @Matches(/^[A-Za-z0-9-]{8,64}$/, { message: 'clientUuid inválido' }) clientUuid: string;
  @IsUUID() shiftId: string;
  @IsOptional() @IsUUID() partnerId?: string;
  @IsOptional() @Matches(NCF_TYPE, { message: 'ncfType: tipo de comprobante (B02, B01...)' }) ncfType?: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => SaleLineDto) lines: SaleLineDto[];
  @IsArray() @ArrayMaxSize(10) @ValidateNested({ each: true }) @Type(() => SalePaymentDto) payments: SalePaymentDto[];
  // Total que vio la caja: si el servidor calcula otro, responde 409 TOTAL_MISMATCH y no cobra
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) expectedTotal?: number;
  // Venta a crédito (queda saldo en «Lo que me deben»): solo con cliente y, si es cajero, con autorización
  @IsOptional() @IsBoolean() allowCredit?: boolean;
  @IsOptional() @IsUUID() approvalId?: string;
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class VoidSaleDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  // Código de anulación DGII (608): 01 a 10. Lo elige quien anula (no hay uno fijo en el código)
  @Matches(/^(0[1-9]|10)$/, { message: 'reasonCode: código de anulación de la DGII, 01 a 10' }) reasonCode: string;
  @IsOptional() @IsUUID() approvalId?: string;
}

export class ReturnLineDto {
  @IsUUID() saleLineId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(MAX_AMOUNT) quantity: number;
}

export class ReturnSaleDto {
  @IsUUID() shiftId: string;
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(200) @ValidateNested({ each: true }) @Type(() => ReturnLineDto) lines: ReturnLineDto[];
  @IsEnum(PosPayMethod) refundMethod: PosPayMethod;
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
  @IsOptional() @IsUUID() approvalId?: string;
}

export class ListSalesQuery {
  @IsOptional() @IsUUID() shiftId?: string;
  @IsOptional() @IsUUID() terminalId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  // Número de ticket o NCF
  @IsOptional() @IsString() @MaxLength(30) q?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class ParkSaleDto {
  @IsUUID() terminalId: string;
  @IsString() @IsNotEmpty() @MaxLength(100) label: string;
  @IsObject() payload: Record<string, unknown>;
}

export class ReportQuery {
  @IsDateString() from: string;
  @IsDateString() to: string;
  @IsOptional() @IsUUID() terminalId?: string;
  @IsOptional() @Transform(toBool) @IsBoolean() byCashier?: boolean;
}
