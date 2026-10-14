import { Type } from 'class-transformer';
import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength,
} from 'class-validator';
import {
  AuditArea, AuditEntityType, AuditMark, EngagementStatus, FindingKind, FindingSeverity, WorkpaperStatus,
} from '../../generated/prisma/enums.js';

export class CreateEngagementDto {
  @IsString() @MinLength(1) @MaxLength(120) name!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsOptional() @IsString() @MaxLength(5000) objective?: string;
  @IsOptional() @IsString() @MaxLength(5000) scope?: string;
  @IsOptional() @IsString() @MaxLength(200) auditorFirm?: string;
  @IsArray() @ArrayMinSize(1) @IsEnum(AuditArea, { each: true }) areas!: AuditArea[];
}

export class UpdateEngagementDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(5000) objective?: string;
  @IsOptional() @IsString() @MaxLength(5000) scope?: string;
  @IsOptional() @IsString() @MaxLength(200) auditorFirm?: string;
  @IsOptional() @IsString() @MaxLength(10000) overallConclusion?: string;
}

export class EngagementStatusDto {
  @IsEnum(EngagementStatus) status!: EngagementStatus;
  // Obligatorio para reabrir (de IN_REVIEW o CLOSED hacia IN_PROGRESS)
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

export class AddWorkpaperDto {
  @IsEnum(AuditArea) area!: AuditArea;
  @IsOptional() @IsString() @MaxLength(20) reference?: string;
  @IsOptional() @IsString() @MaxLength(120) title?: string;
}

export class UpdateWorkpaperDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(5000) objective?: string;
  @IsOptional() @IsString() @MaxLength(5000) conclusion?: string;
  @IsOptional() @IsEnum(WorkpaperStatus) status?: WorkpaperStatus;
}

export class SignOffDto {
  @IsIn(['PREPARED', 'REVIEWED']) step!: 'PREPARED' | 'REVIEWED';
}

export class ProcedureDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(1000) description?: string;
  @IsOptional() @IsBoolean() done?: boolean;
  @IsOptional() @IsString() @MaxLength(2000) result?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) sortOrder?: number;
}

export class CreateFindingDto {
  @IsOptional() @IsEnum(FindingKind) kind?: FindingKind;
  @IsOptional() @IsUUID() workpaperId?: string;
  @IsString() @MinLength(1) @MaxLength(200) title!: string;
  @IsString() @MinLength(1) @MaxLength(5000) condition!: string;
  @IsOptional() @IsString() @MaxLength(5000) criteria?: string;
  @IsOptional() @IsString() @MaxLength(5000) cause?: string;
  @IsOptional() @IsString() @MaxLength(5000) effect?: string;
  @IsOptional() @IsString() @MaxLength(5000) recommendation?: string;
  @IsOptional() @IsEnum(FindingSeverity) severity?: FindingSeverity;
  @IsOptional() @IsBoolean() includeInReport?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) amount?: number;
}

export class UpdateFindingDto {
  @IsOptional() @IsEnum(FindingKind) kind?: FindingKind;
  @IsOptional() @IsUUID() workpaperId?: string | null;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(200) title?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(5000) condition?: string;
  @IsOptional() @IsString() @MaxLength(5000) criteria?: string;
  @IsOptional() @IsString() @MaxLength(5000) cause?: string;
  @IsOptional() @IsString() @MaxLength(5000) effect?: string;
  @IsOptional() @IsString() @MaxLength(5000) recommendation?: string;
  @IsOptional() @IsEnum(FindingSeverity) severity?: FindingSeverity;
  @IsOptional() @IsBoolean() includeInReport?: boolean;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) amount?: number | null;
}

export class FindingResponseDto {
  @IsString() @MinLength(1) @MaxLength(5000) managementResponse!: string;
  @IsOptional() @IsString() @MaxLength(5000) actionPlan?: string;
  @IsOptional() @IsString() @MaxLength(120) responsible?: string;
  @IsOptional() @IsDateString() dueDate?: string;
}

export class CloseFindingDto {
  @IsIn(['RESOLVED', 'RISK_ACCEPTED']) status!: 'RESOLVED' | 'RISK_ACCEPTED';
  @IsString() @MinLength(1) @MaxLength(2000) note!: string;
}

export class ItemsQuery {
  @IsEnum(AuditEntityType) entityType!: AuditEntityType;
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsIn(['reviewed', 'pending']) filter?: 'reviewed' | 'pending';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class MarkDto {
  @IsEnum(AuditEntityType) entityType!: AuditEntityType;
  @IsUUID() entityId!: string;
  @IsEnum(AuditMark) mark!: AuditMark;
  @IsOptional() @IsUUID() workpaperId?: string;
  @IsOptional() @IsString() @MaxLength(2000) note?: string;
}

export class HistoryQuery {
  @IsEnum(AuditEntityType) entityType!: AuditEntityType;
  @IsUUID() entityId!: string;
}

export class FilesQuery {
  @IsOptional() @IsUUID() workpaperId?: string;
  @IsOptional() @IsUUID() findingId?: string;
}

export class UploadAuditFileDto {
  @IsOptional() @IsUUID() workpaperId?: string;
  @IsOptional() @IsUUID() findingId?: string;
}

export class ReportQuery {
  @IsIn(['pdf', 'xlsx']) format!: 'pdf' | 'xlsx';
}
