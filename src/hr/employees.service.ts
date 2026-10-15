import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { AuditAction, EmployeeDocumentType, EmployeeStatus } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import {
  CreateDepartmentDto, CreateEmployeeDto, ListEmployeesQuery, TerminateEmployeeDto, UpdateDepartmentDto, UpdateEmployeeDto,
} from './dto.js';

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
const INCLUDE = {
  department: { select: { id: true, name: true } },
  costCenter: { select: { id: true, name: true } },
} satisfies Prisma.EmployeeInclude;

/** Departamentos y ficha de empleados (P3). Los salarios son sensibles: solo ADMIN y ACCOUNTANT llegan aquí. */
@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  // ---------------- Departamentos ----------------
  async createDepartment(dto: CreateDepartmentDto, user: AuthUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const d = await tx.department.create({ data: { name: dto.name.trim(), companyId: user.companyId } });
        await writeAudit(tx, user, 'Department', d.id, AuditAction.CREATE, { name: d.name });
        return d;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Ya existe el departamento ${dto.name}`);
      throw e;
    }
  }

  listDepartments(user: AuthUser) {
    return this.prisma.department.findMany({
      where: { companyId: user.companyId }, orderBy: { name: 'asc' },
      include: { _count: { select: { employees: { where: { status: { not: EmployeeStatus.TERMINATED } } } } } },
    });
  }

  async updateDepartment(id: string, dto: UpdateDepartmentDto, user: AuthUser) {
    const cur = await this.prisma.department.findFirst({ where: { id, companyId: user.companyId } });
    if (!cur) throw new NotFoundException('Departamento no encontrado');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const d = await tx.department.update({ where: { id, companyId: user.companyId }, data: { ...dto, name: dto.name?.trim() } });
        await writeAudit(tx, user, 'Department', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue);
        return d;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Ya existe el departamento ${dto.name}`);
      throw e;
    }
  }

  // ---------------- Empleados ----------------
  /** Cédula: 11 dígitos, se guarda sin guiones. Pasaporte: tal cual, en mayúsculas. */
  private normalizeDocument(type: EmployeeDocumentType, value: string) {
    if (type === EmployeeDocumentType.CEDULA) {
      const digits = value.replace(/[\s-]/g, '');
      if (!/^\d{11}$/.test(digits)) throw new UnprocessableEntityException('La cédula debe tener 11 dígitos');
      return digits;
    }
    return value.trim().toUpperCase();
  }

  private async assertRefs(tx: Tx, companyId: string, dto: { departmentId?: string | null; costCenterId?: string | null }) {
    if (dto.departmentId) {
      const d = await tx.department.findFirst({ where: { id: dto.departmentId, companyId } });
      if (!d) throw new NotFoundException('Departamento no encontrado');
      if (!d.active) throw new UnprocessableEntityException(`El departamento ${d.name} está inactivo`);
    }
    if (dto.costCenterId) {
      const c = await tx.costCenter.findFirst({ where: { id: dto.costCenterId, companyId, active: true } });
      if (!c) throw new NotFoundException('Centro de costo no encontrado o inactivo');
    }
  }

  private duplicated(e: unknown): never {
    if (isUniqueViolation(e)) {
      const target = String((e as { meta?: { target?: unknown } }).meta?.target ?? '');
      throw new ConflictException(target.includes('documentNumber') ? 'Ya existe un empleado con ese documento' : 'Ya existe un empleado con ese código');
    }
    throw e;
  }

  async create(dto: CreateEmployeeDto, user: AuthUser) {
    const documentType = dto.documentType ?? EmployeeDocumentType.CEDULA;
    const documentNumber = this.normalizeDocument(documentType, dto.documentNumber);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertRefs(tx, user.companyId, dto);
        const e = await tx.employee.create({
          data: {
            ...dto, companyId: user.companyId, documentType, documentNumber,
            hireDate: day(dto.hireDate), birthDate: dto.birthDate ? day(dto.birthDate) : null,
          },
          include: INCLUDE,
        });
        await writeAudit(tx, user, 'Employee', e.id, AuditAction.CREATE, { code: e.code, name: `${e.firstName} ${e.lastName}` });
        return e;
      });
    } catch (e) {
      this.duplicated(e);
    }
  }

  async list(q: ListEmployeesQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const text = q.q?.trim();
    const where: Prisma.EmployeeWhereInput = {
      companyId: user.companyId, status: q.status, departmentId: q.departmentId,
      ...(text ? {
        OR: [
          { code: { contains: text, mode: 'insensitive' } }, { firstName: { contains: text, mode: 'insensitive' } },
          { lastName: { contains: text, mode: 'insensitive' } }, { documentNumber: { contains: text.replace(/[\s-]/g, '') } },
        ],
      } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, include: INCLUDE, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.employee.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string, user: AuthUser) {
    const e = await this.prisma.employee.findFirst({ where: { id, companyId: user.companyId }, include: INCLUDE });
    if (!e) throw new NotFoundException('Empleado no encontrado');
    return e;
  }

  async update(id: string, dto: UpdateEmployeeDto, user: AuthUser) {
    const cur = await this.get(id, user);
    if (dto.status === EmployeeStatus.TERMINATED) throw new UnprocessableEntityException('Para registrar la salida usa «Dar de baja» (POST /hr/employees/:id/terminate)');
    if (cur.status === EmployeeStatus.TERMINATED && dto.status) throw new UnprocessableEntityException('El empleado ya salió de la empresa: no se cambia su estado');
    const documentType = dto.documentType ?? cur.documentType;
    const data: Prisma.EmployeeUncheckedUpdateInput = {
      ...dto,
      ...(dto.documentNumber !== undefined || dto.documentType !== undefined
        ? { documentNumber: this.normalizeDocument(documentType, dto.documentNumber ?? cur.documentNumber) } : {}),
      ...(dto.hireDate ? { hireDate: day(dto.hireDate) } : {}),
      ...(dto.birthDate !== undefined ? { birthDate: dto.birthDate ? day(dto.birthDate) : null } : {}),
    };
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.assertRefs(tx, user.companyId, dto);
        const e = await tx.employee.update({ where: { id, companyId: user.companyId }, data, include: INCLUDE });
        // Bitácora sin datos bancarios: solo qué campos cambiaron (y el salario, que sí interesa al auditor)
        await writeAudit(tx, user, 'Employee', id, AuditAction.UPDATE, {
          fields: Object.keys(dto), ...(dto.baseSalary !== undefined ? { baseSalary: dto.baseSalary } : {}),
        });
        return e;
      });
    } catch (e) {
      this.duplicated(e);
    }
  }

  async terminate(id: string, dto: TerminateEmployeeDto, user: AuthUser) {
    const cur = await this.get(id, user);
    if (cur.status === EmployeeStatus.TERMINATED) throw new ConflictException('El empleado ya salió de la empresa');
    const date = day(dto.date);
    if (date < cur.hireDate) throw new UnprocessableEntityException('La fecha de salida no puede ser anterior a la de ingreso');
    return this.prisma.$transaction(async (tx) => {
      const e = await tx.employee.update({
        where: { id, companyId: user.companyId },
        data: { status: EmployeeStatus.TERMINATED, terminationDate: date, terminationReason: dto.reason }, include: INCLUDE,
      });
      await writeAudit(tx, user, 'Employee', id, AuditAction.UPDATE, { terminated: dto.date, reason: dto.reason });
      return e;
    });
  }
}
