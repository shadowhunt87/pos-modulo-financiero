import { randomBytes } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuditAction, UserRole } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { newKey } from './service-key-auth.js';
import { CreateServiceKeyDto } from './dto/service-keys.dto.js';

const LIST_SELECT = {
  id: true, name: true, prefix: true, sourceModule: true, lastUsedAt: true, revokedAt: true, createdAt: true, userId: true,
} as const;

/**
 * Llaves de servicio (INTEGRACION-TALLER §4.7, S-b). Cada llave tiene su usuario técnico ACCOUNTANT
 * sin clave usable (isService: no puede iniciar sesión ni entrar a las pantallas). El secreto se
 * muestra UNA vez al crearla; después solo se ve el prefijo.
 */
@Injectable()
export class ServiceKeysService {
  constructor(private readonly prisma: PrismaService) {}

  list(user: AuthUser) {
    return this.prisma.serviceKey.findMany({ where: { companyId: user.companyId }, select: LIST_SELECT, orderBy: { createdAt: 'desc' } });
  }

  async create(dto: CreateServiceKeyDto, admin: AuthUser) {
    const k = newKey();
    // Clave aleatoria que nadie conoce: aunque alguien la reseteara, el login rechaza a los usuarios técnicos
    const password = await bcrypt.hash(randomBytes(32).toString('base64url'), 10);
    const row = await this.prisma.$transaction(async (tx) => {
      const svc = await tx.user.create({
        data: {
          companyId: admin.companyId, email: `servicio-${k.prefix.toLowerCase()}@servicio.invalid`, password,
          name: `Servicio: ${dto.name}`, role: UserRole.ACCOUNTANT, isService: true,
        },
      });
      const key = await tx.serviceKey.create({
        data: {
          companyId: admin.companyId, userId: svc.id, name: dto.name, prefix: k.prefix, keyHash: k.keyHash,
          sourceModule: dto.sourceModule, createdById: admin.id,
        },
        select: LIST_SELECT,
      });
      await writeAudit(tx, admin, 'ServiceKey', key.id, AuditAction.CREATE, { name: dto.name, prefix: k.prefix, sourceModule: dto.sourceModule });
      return key;
    });
    return { ...row, key: k.key, warning: 'Copia la llave ahora: no se vuelve a mostrar. Guárdala en el otro sistema, nunca en un correo o chat.' };
  }

  async revoke(id: string, admin: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const key = await tx.serviceKey.findFirst({ where: { id, companyId: admin.companyId } });
      if (!key) throw new NotFoundException('Llave no encontrada');
      if (key.revokedAt) throw new ConflictException('La llave ya está revocada');
      await tx.serviceKey.updateMany({ where: { id, companyId: admin.companyId }, data: { revokedAt: new Date(), revokedById: admin.id } });
      // Su usuario técnico queda inactivo: lo que creó sigue a su nombre en la historia
      await tx.user.updateMany({ where: { id: key.userId, companyId: admin.companyId, isService: true }, data: { active: false } });
      await writeAudit(tx, admin, 'ServiceKey', id, AuditAction.VOID, { prefix: key.prefix });
      return tx.serviceKey.findFirstOrThrow({ where: { id, companyId: admin.companyId }, select: LIST_SELECT });
    });
  }
}
