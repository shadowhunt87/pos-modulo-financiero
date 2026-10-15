import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID,
  Matches, Max, MaxLength, Min, ValidateNested,
} from 'class-validator';
import {
  EmployeeDocumentType, EmployeePaymentMethod, EmployeeSex, EmployeeStatus, PayFrequency, PayrollConceptKind, PayrollRunStatus, PayrollRunType,
} from '../generated/prisma/enums.js';

const MAX_AMOUNT = 999_999_999_999;
const CODE = /^[A-Za-z0-9._-]{1,20}$/;
const CODE_MSG = 'code: hasta 20 letras, números, punto, guion o guion bajo, sin espacios';
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

// ---------------- Departamentos ----------------
export class CreateDepartmentDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
}

export class UpdateDepartmentDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsBoolean() active?: boolean;
}

// ---------------- Empleados ----------------
export class CreateEmployeeDto {
  @IsString() @Matches(CODE, { message: CODE_MSG }) code: string;
  @IsString() @IsNotEmpty() @MaxLength(100) firstName: string;
  @IsString() @IsNotEmpty() @MaxLength(100) lastName: string;
  @IsOptional() @IsEnum(EmployeeDocumentType) documentType?: EmployeeDocumentType;
  // Cédula: 11 dígitos (con o sin guiones)
  @IsString() @IsNotEmpty() @MaxLength(20) documentNumber: string;
  @IsOptional() @IsString() @MaxLength(20) nss?: string;
  @IsOptional() @IsEnum(EmployeeSex) sex?: EmployeeSex;
  @IsOptional() @IsDateString() birthDate?: string;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(300) address?: string;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @IsString() @MaxLength(100) position?: string;
  @IsDateString() hireDate: string;
  @IsOptional() @IsEnum(PayFrequency) payFrequency?: PayFrequency;
  // Salario MENSUAL; la nómina quincenal o semanal lo divide
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(MAX_AMOUNT) baseSalary: number;
  @IsOptional() @IsEnum(EmployeePaymentMethod) paymentMethod?: EmployeePaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string;
  @IsOptional() @IsString() @MaxLength(40) bankAccountNumber?: string;
  @IsOptional() @IsUUID() costCenterId?: string;
}

// undefined = no tocar; null = quitar. La salida se registra con /terminate, no aquí.
export class UpdateEmployeeDto {
  @IsOptional() @IsString() @Matches(CODE, { message: CODE_MSG }) code?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) firstName?: string;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) lastName?: string;
  @IsOptional() @IsEnum(EmployeeDocumentType) documentType?: EmployeeDocumentType;
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(20) documentNumber?: string;
  @IsOptional() @IsString() @MaxLength(20) nss?: string | null;
  @IsOptional() @IsEnum(EmployeeSex) sex?: EmployeeSex | null;
  @IsOptional() @IsDateString() birthDate?: string | null;
  @IsOptional() @IsEmail() @MaxLength(200) email?: string | null;
  @IsOptional() @IsString() @MaxLength(30) phone?: string | null;
  @IsOptional() @IsString() @MaxLength(300) address?: string | null;
  @IsOptional() @IsUUID() departmentId?: string | null;
  @IsOptional() @IsString() @MaxLength(100) position?: string | null;
  @IsOptional() @IsDateString() hireDate?: string;
  @IsOptional() @IsEnum(PayFrequency) payFrequency?: PayFrequency;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(MAX_AMOUNT) baseSalary?: number;
  @IsOptional() @IsEnum(EmployeePaymentMethod) paymentMethod?: EmployeePaymentMethod;
  @IsOptional() @IsString() @MaxLength(100) bankName?: string | null;
  @IsOptional() @IsString() @MaxLength(40) bankAccountNumber?: string | null;
  @IsOptional() @IsUUID() costCenterId?: string | null;
  // ACTIVE o SUSPENDED (la suspensión saca a la persona de las nóminas)
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
}

export class TerminateEmployeeDto {
  @IsDateString() date: string;
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

export class ListEmployeesQuery {
  // Busca en código, nombres, apellidos y documento
  @IsOptional() @IsString() @MaxLength(100) q?: string;
  @IsOptional() @IsEnum(EmployeeStatus) status?: EmployeeStatus;
  @IsOptional() @IsUUID() departmentId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
}

// ---------------- Conceptos y configuración ----------------
export class CreatePayrollConceptDto {
  @IsString() @Matches(CODE, { message: CODE_MSG }) code: string;
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  @IsEnum(PayrollConceptKind) kind: PayrollConceptKind;
  // Solo ingresos
  @IsOptional() @IsBoolean() affectsTss?: boolean;
  @IsOptional() @IsBoolean() affectsIsr?: boolean;
  @IsOptional() @IsUUID() accountId?: string;
}

export class UpdatePayrollConceptDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @IsBoolean() affectsTss?: boolean;
  @IsOptional() @IsBoolean() affectsIsr?: boolean;
  @IsOptional() @IsUUID() accountId?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}

export class ListPayrollConceptsQuery {
  @IsOptional() @IsEnum(PayrollConceptKind) kind?: PayrollConceptKind;
  @IsOptional() @Transform(toBool) @IsBoolean() active?: boolean;
}

// undefined = no tocar; null = quitar
export class UpdatePayrollSettingsDto {
  @IsOptional() @IsUUID() salaryExpenseAccountId?: string | null;
  @IsOptional() @IsUUID() employerContributionsExpenseAccountId?: string | null;
  @IsOptional() @IsUUID() salariesPayableAccountId?: string | null;
  @IsOptional() @IsUUID() tssPayableAccountId?: string | null;
  @IsOptional() @IsUUID() isrPayableAccountId?: string | null;
  @IsOptional() @IsUUID() otherDeductionsPayableAccountId?: string | null;
  // Tasa de riesgos laborales asignada por la TSS (%)
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(10) srlRate?: number | null;
}

// ---------------- Nóminas ----------------
export class CreatePayrollRunDto {
  @IsOptional() @IsEnum(PayrollRunType) type?: PayrollRunType;
  // Nómina regular: frecuencia y período obligatorios. Regalía: el período es el año de payDate.
  @IsOptional() @IsEnum(PayFrequency) frequency?: PayFrequency;
  @IsOptional() @IsDateString() periodStart?: string;
  @IsOptional() @IsDateString() periodEnd?: string;
  @IsDateString() payDate: string;
  // Sin lista: todos los empleados activos de esa frecuencia con días en el período
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsUUID('all', { each: true }) employeeIds?: string[];
  @IsOptional() @IsString() @MaxLength(500) notes?: string;
}

export class PayrollItemDto {
  @IsUUID() conceptId: string;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(MAX_AMOUNT) amount: number;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
}

export class SetPayrollItemsDto {
  @IsArray() @ArrayMaxSize(50) @ValidateNested({ each: true }) @Type(() => PayrollItemDto)
  items: PayrollItemDto[];
}

export class PayPayrollDto {
  @IsUUID() bankAccountId: string;
  // Fecha del pago; si no, la fecha de pago de la nómina
  @IsOptional() @IsDateString() date?: string;
}

export class VoidPayrollDto {
  @IsString() @IsNotEmpty() @MaxLength(500) reason: string;
}

export class ListPayrollRunsQuery {
  @IsOptional() @IsEnum(PayrollRunStatus) status?: PayrollRunStatus;
  @IsOptional() @IsEnum(PayrollRunType) type?: PayrollRunType;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;
}

export class MonthQuery {
  @IsString() @Matches(/^\d{4}-(0[1-9]|1[0-2])$/, { message: 'month: AAAA-MM' }) month: string;
}
