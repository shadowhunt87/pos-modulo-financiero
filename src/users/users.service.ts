import {
  ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction, UserRole } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { AuthService } from '../auth/auth.service.js';
import { AttemptLimiter } from '../auth/attempt-limiter.js';
import { ENROLL_WINDOW_MS, TwoFactorService } from '../auth/two-factor/two-factor.service.js';
import { isUniqueViolation, writeAudit, type AuditMeta } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import {
  ChangePasswordDto, ListUsersQuery, ResetPasswordDto, ResetTwoFactorDto, SecurityEventsQuery, UpdateProfileDto, UpdateUserDto,
} from './dto/users.dto.js';

const BCRYPT_ROUNDS = 10;

// Nunca se devuelve el hash de la clave
const PUBLIC = {
  id: true, email: true, name: true, role: true, active: true, companyId: true,
  lastLoginAt: true, createdAt: true, updatedAt: true, twoFactor: { select: { enabledAt: true } },
} as const satisfies Prisma.UserSelect;

/** Sin la fila del 2FA: solo si está activo (ANEXO-S0 E10). */
function toPublic<T extends { twoFactor: { enabledAt: Date | null } | null }>(u: T) {
  const { twoFactor, ...rest } = u;
  return { ...rest, twoFactorEnabled: !!twoFactor?.enabledAt };
}

/** Eventos de seguridad que ve el ADMIN (E11). */
const VISIBLE_EVENTS = [
  'TWO_FACTOR_ENABLED', 'TWO_FACTOR_DEVICE_CHANGED', 'TWO_FACTOR_DISABLED', 'TWO_FACTOR_LOCKED_OUT', 'TWO_FACTOR_RESET',
  'ADMIN_GRANTED', 'PASSWORD_RESET_BY_ADMIN', 'LOGIN_2FA', 'DATA_EXPORT_STARTED', 'DATA_EXPORT_COMPLETED', 'DATA_EXPORT_FAILED',
];

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
    private readonly limiter: AttemptLimiter,
    private readonly twoFactor: TwoFactorService,
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
    return { data: data.map(toPublic), total, page, limit };
  }

  async get(id: string, user: AuthUser) {
    const u = await this.prisma.user.findFirst({ where: { id, companyId: user.companyId }, select: PUBLIC });
    if (!u) throw new NotFoundException('Usuario no encontrado');
    return toPublic(u);
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

  async update(id: string, dto: UpdateUserDto, actor: AuthUser, ip = 'unknown', meta: AuditMeta = {}) {
    // Ascender a ADMIN o cambiar el correo de un ADMIN pide confirmación reforzada (ANEXO-S0 3.10b)
    const before = await this.prisma.user.findFirst({ where: { id, companyId: actor.companyId }, select: { role: true, email: true } });
    if (!before) throw new NotFoundException('Usuario no encontrado');
    const promotes = dto.role === UserRole.ADMIN && before.role !== UserRole.ADMIN;
    const adminEmail = dto.email !== undefined && dto.email !== before.email && before.role === UserRole.ADMIN;
    if (promotes || adminEmail) await this.twoFactor.confirmActor(actor, dto.confirmPassword, dto.confirmCode, ip, meta);
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
          // El ascendido vuelve a entrar (y, si hay política, se inscribe en las 72 h)
          ...(promotes && { passwordChangedAt: new Date() }),
        };
        const updated = await tx.user.update({ where: { id, companyId: actor.companyId }, data, select: PUBLIC });
        await writeAudit(tx, actor, 'User', id, AuditAction.UPDATE, {
          before: { name: target.name, email: target.email, role: target.role, active: target.active },
          after: { name: updated.name, email: updated.email, role: updated.role, active: updated.active },
        });
        if (promotes) {
          await this.twoFactor.openEnrollWindow(tx, id, actor.companyId);
          await writeAudit(tx, actor, 'User', id, AuditAction.UPDATE, { event: 'ADMIN_GRANTED', via: 'ROLE_CHANGE' }, meta);
        }
        return toPublic(updated);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya existe un usuario con ese email');
      throw e;
    }
  }

  /** El ADMIN fija una clave nueva; las sesiones abiertas del usuario dejan de servir. */
  async resetPassword(id: string, dto: ResetPasswordDto, actor: AuthUser, ip = 'unknown', meta: AuditMeta = {}) {
    // Siempre con confirmación reforzada; no quita el 2FA, pero limpia sus contadores y abre la ventana de 72 h
    await this.twoFactor.confirmActor(actor, dto.confirmPassword, dto.confirmCode, ip, meta);
    const hash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.user.updateMany({
        where: { id, companyId: actor.companyId },
        data: { password: hash, passwordChangedAt: new Date() },
      });
      if (res.count === 0) throw new NotFoundException('Usuario no encontrado');
      await this.twoFactor.resetCounters(tx, id, actor.companyId);
      await writeAudit(tx, actor, 'User', id, AuditAction.UPDATE, { passwordReset: true, event: 'PASSWORD_RESET_BY_ADMIN' }, meta);
    });
    return { ok: true };
  }

  /**
   * E9: el ADMIN quita el 2FA de otro usuario de su empresa y le fija una clave nueva en la misma acción (N1): quien
   * provocó bloqueos con la clave vieja ya no puede inscribir su teléfono. Cierra sus sesiones y abre 72 h de inscripción.
   */
  async resetTwoFactor(id: string, dto: ResetTwoFactorDto, actor: AuthUser, ip: string, meta: AuditMeta) {
    const target = await this.prisma.user.findFirst({ where: { id, companyId: actor.companyId }, select: { id: true } });
    if (!target) throw new NotFoundException('Usuario no encontrado');
    if (id === actor.id) throw new UnprocessableEntityException('No puedes restablecer tu propia verificación: usa «Seguridad de mi cuenta».');
    if (!(await this.twoFactor.isEnabled(id))) throw new UnprocessableEntityException('Este usuario no tiene activada la verificación en dos pasos.');
    await this.twoFactor.confirmActor(actor, dto.confirmPassword, dto.confirmCode, ip, meta);
    const hash = await bcrypt.hash(dto.newPassword, BCRYPT_ROUNDS);
    await this.prisma.$transaction(async (tx) => {
      const now = new Date();
      const res = await tx.user.updateMany({ where: { id, companyId: actor.companyId }, data: { password: hash, passwordChangedAt: now } });
      if (res.count === 0) throw new NotFoundException('Usuario no encontrado');
      await this.twoFactor.clearState(tx, id, actor.companyId, new Date(now.getTime() + ENROLL_WINDOW_MS));
      await writeAudit(tx, actor, 'User', id, AuditAction.UPDATE, { event: 'TWO_FACTOR_RESET' }, meta);
      await writeAudit(tx, actor, 'User', id, AuditAction.UPDATE, { event: 'PASSWORD_RESET_BY_ADMIN', passwordReset: true }, meta);
    });
    return { ok: true };
  }

  /** E11: cambios de seguridad de la empresa (últimos N días), con actor y afectado. */
  async securityEvents(q: SecurityEventsQuery, actor: AuthUser) {
    const since = new Date(Date.now() - (q.days ?? 30) * 86_400_000);
    const rows = await this.prisma.auditLog.findMany({
      where: {
        companyId: actor.companyId, createdAt: { gte: since },
        OR: VISIBLE_EVENTS.map((e) => ({ changes: { path: ['event'], equals: e } })),
      },
      orderBy: { createdAt: 'desc' }, take: 500,
      select: { id: true, entityName: true, entityId: true, changes: true, createdAt: true, ipAddress: true, userId: true, user: { select: { name: true, email: true } } },
    });
    const targetIds = [...new Set(rows.filter((r) => r.entityName === 'User').map((r) => r.entityId))];
    const targets = await this.prisma.user.findMany({ where: { id: { in: targetIds }, companyId: actor.companyId }, select: { id: true, name: true, email: true } });
    const byId = new Map(targets.map((t) => [t.id, t]));
    return rows
      .filter((r) => { const c = r.changes as { event?: string; method?: string } | null; return c?.event !== 'LOGIN_2FA' || c.method === 'RECOVERY_CODE'; })
      .map((r) => {
        const c = (r.changes ?? {}) as Record<string, unknown>;
        const viaOperator = c.via === 'operator-cli';
        return {
          id: r.id, event: c.event as string, at: r.createdAt, ip: r.ipAddress, via: (c.via as string | undefined) ?? 'API',
          actor: viaOperator ? { name: 'Operador del sistema', email: null } : { name: r.user.name, email: r.user.email },
          target: r.entityName === 'User' ? (byId.get(r.entityId) ?? null) : null,
          details: { method: c.method ?? null, kind: c.kind ?? null, purpose: c.purpose ?? null, reason: c.reason ?? null, motivo: c.motivo ?? null },
        };
      });
  }

  async updateProfile(dto: UpdateProfileDto, me: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const u = await tx.user.update({ where: { id: me.id }, data: { name: dto.name }, select: PUBLIC });
      await writeAudit(tx, me, 'User', me.id, AuditAction.UPDATE, { name: dto.name });
      return u;
    });
  }

  /** Cambia la clave propia. Devuelve un token nuevo porque los anteriores quedan invalidados. */
  async changePassword(dto: ChangePasswordDto, me: AuthUser, ip = 'unknown', meta: AuditMeta = {}) {
    const current = await this.prisma.user.findUnique({ where: { id: me.id } });
    if (!current) throw new NotFoundException('Usuario no encontrado');
    // Con un token robado se podría adivinar la clave actual: se limitan los fallos (reserva antes de verificar).
    // Clave mala = 422 (no 401): no cierra la sesión (ANEXO-S0 G3)
    try { await this.twoFactor.checkPassword(me.id, dto.currentPassword); }
    catch (e) {
      if (e instanceof UnprocessableEntityException) throw new UnprocessableEntityException('La clave actual no es correcta');
      throw e;
    }
    // Con 2FA, además el código (M2s)
    if (await this.twoFactor.isEnabled(me.id)) {
      if (!dto.code) throw new UnprocessableEntityException('Escribe el código de tu aplicación (verificación en dos pasos).');
      await this.twoFactor.confirmActor(me, dto.currentPassword, dto.code, ip, meta);
    }
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

