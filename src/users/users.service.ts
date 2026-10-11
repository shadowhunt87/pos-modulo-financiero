import {
  ConflictException, Injectable, NotFoundException, UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction, UserRole } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { AuthService } from '../auth/auth.service.js';
import { AttemptLimiter, TooManyAttemptsException, passwordRules } from '../auth/attempt-limiter.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ChangePasswordDto, ListUsersQuery, ResetPasswordDto, UpdateProfileDto, UpdateUserDto } from './dto/users.dto.js';

const BCRYPT_ROUNDS = 10;

// Nunca se devuelve el hash de la clave
const PUBLIC = {
  id: true, email: true, name: true, role: true, active: true, companyId: true,
  lastLoginAt: true, createdAt: true, updatedAt: true,
} as const satisfies Prisma.UserSelect;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly limiter: AttemptLimiter,
  ) {}

  async list(q: ListUsersQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.UserWhereInput = {
      companyId: user.companyId,
      role: q.role,
      active: q.active,
      ...(q.q ? { OR: [{ name: { contains: q.q, mode: 'insensitive' } }, { email: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.user.findMany({ where, select: PUBLIC, orderBy: [{ active: 'desc' }, { name: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.user.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string, user: AuthUser) {
    const u = await this.prisma.user.findFirst({ where: { id, companyId: user.companyId }, select: PUBLIC });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return u;
  }

  /**
   * Bloquea a los ADMIN activos de la empresa para que dos cambios simultáneos
   * (p. ej. dos admins degradándose entre sí) no dejen la empresa sin administrador.
   */
  private async lockActiveAdmins(tx: Prisma.TransactionClient, companyId: string) {
    const rows = await tx.$queryRaw<{ id: string }[]>(
      Prisma.sql`SELECT "id" FROM "User" WHERE "companyId" = ${companyId} AND "role" = 'ADMIN'::"UserRole" AND "active" = true FOR UPDATE`,
    );
    return rows.map((r) => r.id);
  }

  async update(id: string, dto: UpdateUserDto, actor: AuthUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const admins = await this.lockActiveAdmins(tx, actor.companyId);
        const target = await tx.user.findFirst({ where: { id, companyId: actor.companyId } });
        if (!target) throw new NotFoundException('Usuario no encontrado');

        if (id === actor.id && dto.active === false) {
          throw new UnprocessableEntityException('No puedes desactivar tu propia cuenta');
        }
        const staysActiveAdmin =
          (dto.active ?? target.active) && (dto.role ?? target.role) === UserRole.ADMIN;
        const isActiveAdmin = admins.includes(id);
        if (isActiveAdmin && !staysActiveAdmin && admins.length <= 1) {
          throw new UnprocessableEntityException('La empresa debe conservar al menos un ADMIN activo');
        }

        const data: Prisma.UserUpdateInput = {
          ...(dto.name !== undefined && { name: dto.name }),
          ...(dto.email !== undefined && { email: dto.email }),
          ...(dto.role !== undefined && { role: dto.role }),
          ...(dto.active !== undefined && { active: dto.active }),
        };
        const updated = await tx.user.update({ where: { id, companyId: actor.companyId }, data, select: PUBLIC });
        await writeAudit(tx, actor, 'User', id, AuditAction.UPDATE, {
          before: { name: target.name, email: target.email, role: target.role, active: target.active },
          after: { name: updated.name, email: updated.email, role: updated.role, active: updated.active },
        });
        return updated;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya existe un usuario con ese email');
      throw e;
    }
  }

  /** El ADMIN fija una clave nueva; las sesiones abiertas del usuario dejan de servir. */
  async resetPassword(id: string, dto: ResetPasswordDto, actor: AuthUser) {
    const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.user.updateMany({
        where: { id, companyId: actor.companyId },
        data: { password: hash, passwordChangedAt: new Date() },
      });
      if (res.count === 0) throw new NotFoundException('Usuario no encontrado');
      await writeAudit(tx, actor, 'User', id, AuditAction.UPDATE, { passwordReset: true });
    });
    return { ok: true };
  }

  async updateProfile(dto: UpdateProfileDto, me: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: me.id }, data: { name: dto.name }, select: PUBLIC });
      await writeAudit(tx, me, 'User', me.id, AuditAction.UPDATE, { name: dto.name });
      return u;
    });
  }

  /** Cambia la clave propia. Devuelve un token nuevo porque los anteriores quedan invalidados. */
  async changePassword(dto: ChangePasswordDto, me: AuthUser) {
    const current = await this.prisma.user.findUnique({ where: { id: me.id } });
    if (!current) throw new NotFoundException('Usuario no encontrado');
    // Con un token robado se podría adivinar la clave actual: se limitan los fallos
    const rules = passwordRules(me.id);
    const wait = this.limiter.check(rules);
    if (wait > 0) throw new TooManyAttemptsException(wait);
    if (!(await bcrypt.compare(dto.currentPassword, current.password))) {
      this.limiter.recordFailure(rules);
      throw new UnauthorizedException('La clave actual no es correcta');
    }
    this.limiter.clear(rules.map((r) => r.key));
    if (dto.currentPassword === dto.newPassword) {
      throw new UnprocessableEntityException('La clave nueva debe ser distinta de la actual');
    }
    const hash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      // Si otra sesión cambió la clave entre la verificación y este update, no se pisa
      const res = await tx.user.updateMany({
        where: { id: me.id, password: current.password },
        data: { password: hash, passwordChangedAt: new Date() },
      });
      if (res.count === 0) throw new ConflictException('La clave cambió mientras tanto; reintenta');
      await writeAudit(tx, me, 'User', me.id, AuditAction.UPDATE, { passwordChanged: true });
    });
    return this.auth.issueToken({
      id: current.id, email: current.email, name: current.name, role: current.role, companyId: current.companyId,
    });
  }
}

