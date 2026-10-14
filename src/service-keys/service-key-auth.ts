import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { ForbiddenException, Injectable, NotFoundException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { PATH_METADATA, METHOD_METADATA } from '@nestjs/common/constants.js';
import { RequestMethod } from '@nestjs/common';
import type { Request } from 'express';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from '../auth/types/auth-user.js';

export const KEY_PREFIX = 'fsk_';
const KEY_RE = /^fsk_([A-Za-z0-9]{12})_([A-Za-z0-9_-]{43})$/;
const LAST_USED_EVERY_MS = 60_000; // no se escribe en cada petición

export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest('hex');
/** Llave nueva: el prefijo identifica la fila; el secreto (256 bits) solo se guarda como hash. */
export function newKey() {
  const prefix = randomBytes(9).toString('base64url').replace(/[-_]/g, '').slice(0, 12).padEnd(12, '0');
  const secret = randomBytes(32).toString('base64url');
  return { prefix, secret, key: `${KEY_PREFIX}${prefix}_${secret}`, keyHash: hashSecret(secret) };
}

/**
 * Lo único que puede hacer una llave de servicio (INTEGRACION-TALLER §4.7, S-b): leer clientes,
 * impuestos, bancos y cajas; crear clientes, facturas de venta y cobros; leer SOLO las facturas y
 * cobros que creó ella. Cualquier otra ruta: 403, aunque el rol del usuario técnico la permita.
 */
const ALLOWED = new Set([
  'GET /auth/me', 'GET /meta/version',
  'GET /partners', 'GET /partners/:id', 'POST /partners',
  'GET /tax-rates', 'GET /bank-accounts', 'GET /cash-registers',
  'POST /invoices', 'GET /invoices/by-source', 'GET /invoices/:id',
  'POST /payments', 'GET /payments/:id',
]);

export type ServiceUser = AuthUser & { serviceKeyId: string; sourceModule: string };

@Injectable()
export class ServiceKeyAuth {
  constructor(private readonly prisma: PrismaService) {}

  /** Ruta de Nest que atiende la petición, como "POST /invoices/:id" (igual que la política de rutas). */
  private routeOf(ctx: ExecutionContext) {
    const base = Reflect.getMetadata(PATH_METADATA, ctx.getClass()) as string;
    const path = Reflect.getMetadata(PATH_METADATA, ctx.getHandler()) as string;
    const method = RequestMethod[Reflect.getMetadata(METHOD_METADATA, ctx.getHandler()) as number];
    return `${method} ${`/${base}/${path}`.replace(/\/+/g, '/').replace(/\/$/, '')}`;
  }

  async authenticate(ctx: ExecutionContext, req: Request, raw: string): Promise<boolean> {
    const m = KEY_RE.exec(raw);
    if (!m) throw new UnauthorizedException('Llave de servicio inválida');
    const row = await this.prisma.serviceKey.findUnique({ where: { prefix: m[1] } });
    // Mismo error para "no existe", "secreto distinto" y "revocada": no se revela cuál
    const given = Buffer.from(hashSecret(m[2]), 'hex');
    const ok = !!row && !row.revokedAt && timingSafeEqual(given, Buffer.from(row.keyHash, 'hex'));
    if (!row || !ok) throw new UnauthorizedException('Llave de servicio inválida o revocada');
    const user = await this.prisma.user.findFirst({
      where: { id: row.userId, companyId: row.companyId, isService: true },
      include: { company: { select: { active: true } } },
    });
    if (!user?.active || !user.company.active) throw new UnauthorizedException('Llave de servicio inválida o revocada');

    const route = this.routeOf(ctx);
    if (!ALLOWED.has(route)) throw new ForbiddenException('Esta llave de servicio no permite esta operación');
    const body = (req.body ?? {}) as Record<string, unknown>;
    if (route === 'POST /invoices') {
      // Solo ventas, con su origen: ni notas ni compras, y siempre con la llave natural
      if (body.type !== 'SALE') throw new ForbiddenException('Con esta llave solo se crean facturas de venta');
      if (body.sourceModule !== row.sourceModule || !body.sourceId) {
        throw new ForbiddenException(`Con esta llave toda factura lleva sourceModule "${row.sourceModule}" y su sourceId`);
      }
    }
    if (route === 'GET /invoices/by-source' && (req.query as Record<string, unknown>).sourceModule !== row.sourceModule) {
      throw new ForbiddenException(`Con esta llave solo se consulta el origen "${row.sourceModule}"`);
    }
    if (route === 'POST /payments') {
      if (body.direction !== 'RECEIVED') throw new ForbiddenException('Con esta llave solo se registran cobros');
      if (!body.externalRef) throw new ForbiddenException('Con esta llave todo cobro lleva su externalRef');
    }
    // Lectura acotada: solo lo que creó la llave (404 como si no existiera, igual que lo de otra empresa)
    const id = (req.params as Record<string, string | undefined>).id;
    if (route === 'GET /invoices/:id' || route === 'GET /payments/:id') {
      const where = { id: id ?? '', companyId: row.companyId, createdById: user.id };
      const found = route === 'GET /invoices/:id'
        ? await this.prisma.invoice.count({ where }).catch(() => 0)
        : await this.prisma.payment.count({ where }).catch(() => 0);
      if (!found) throw new NotFoundException(route === 'GET /invoices/:id' ? 'Factura no encontrada' : 'Pago no encontrado');
    }

    if (!row.lastUsedAt || Date.now() - row.lastUsedAt.getTime() > LAST_USED_EVERY_MS) {
      await this.prisma.serviceKey.updateMany({ where: { id: row.id, companyId: row.companyId }, data: { lastUsedAt: new Date() } });
    }
    const su: ServiceUser = {
      id: user.id, email: user.email, role: user.role, companyId: user.companyId, serviceKeyId: row.id, sourceModule: row.sourceModule,
    };
    (req as Request & { user: AuthUser }).user = su;
    return true;
  }
}
