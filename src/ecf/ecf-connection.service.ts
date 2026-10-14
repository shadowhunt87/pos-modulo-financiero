import { Injectable, NotFoundException, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { SecretBox } from '../auth/two-factor/secret-box.js';
import type { EcfContext, EcfProvider } from './providers/provider.js';
import { SandboxEcfProvider } from './providers/sandbox.provider.js';
import { HttpEcfProvider } from './providers/http.provider.js';

/** Proveedores disponibles: agregar uno nuevo = una clase que cumpla EcfProvider y una línea aquí. */
export const PROVIDERS: Record<string, EcfProvider> = { sandbox: new SandboxEcfProvider(), http: new HttpEcfProvider() };
const E_TYPES = ['E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47'];

export interface ConnectionInput {
  providerCode: string; environment: 'TEST' | 'PROD'; numbering: 'OURS' | 'PROVIDER'; settings?: Record<string, unknown>;
  credentials?: Record<string, string>; ecfTypes: string[]; active: boolean;
}

/** Conexión de la empresa con su proveedor de e-CF (PLAN-v0.3 §7.2). Las credenciales se cifran y nunca se devuelven. */
@Injectable()
export class EcfConnectionService {
  private readonly box: SecretBox | null;
  constructor(private readonly prisma: PrismaService, config: ConfigService) {
    const key = config.get<string>('ECF_ENCRYPTION_KEY');
    this.box = key ? new SecretBox(key) : null;
  }

  private aad(companyId: string) { return `EcfConnection:${companyId}`; }

  async get(user: AuthUser) {
    const c = await this.prisma.ecfConnection.findUnique({ where: { companyId: user.companyId } });
    return {
      providers: Object.values(PROVIDERS).map((p) => ({ code: p.code, label: p.label })), eTypes: E_TYPES, encryptionReady: !!this.box,
      connection: c ? { providerCode: c.providerCode, environment: c.environment, numbering: c.numbering, settings: c.settings, ecfTypes: c.ecfTypes, active: c.active, hasCredentials: !!c.credentialsEnc, lastCheckAt: c.lastCheckAt, lastCheckOk: c.lastCheckOk, updatedAt: c.updatedAt } : null,
    };
  }

  async save(dto: ConnectionInput, user: AuthUser) {
    if (!PROVIDERS[dto.providerCode]) throw new UnprocessableEntityException('Proveedor desconocido');
    if (dto.providerCode === 'sandbox' && dto.environment === 'PROD') throw new UnprocessableEntityException('El proveedor de pruebas no se puede usar en producción');
    const bad = dto.ecfTypes.filter((t) => !E_TYPES.includes(t));
    if (bad.length) throw new UnprocessableEntityException(`Tipos de e-CF inválidos: ${bad.join(', ')}`);
    if (dto.credentials && !this.box) throw new ServiceUnavailableException('Falta ECF_ENCRYPTION_KEY en el servidor: sin ella no se pueden guardar credenciales. Avisa al administrador del sistema');
    const credentialsEnc = dto.credentials ? this.box!.seal(Buffer.from(JSON.stringify(dto.credentials)), this.aad(user.companyId)) : undefined;
    const data = {
      providerCode: dto.providerCode, environment: dto.environment, numbering: dto.numbering, settings: (dto.settings ?? Prisma.JsonNull) as Prisma.InputJsonValue,
      ecfTypes: dto.ecfTypes, active: dto.active, updatedById: user.id, ...(credentialsEnc ? { credentialsEnc } : {}),
    };
    await this.prisma.$transaction(async (tx) => {
      const c = await tx.ecfConnection.upsert({ where: { companyId: user.companyId }, create: { companyId: user.companyId, ...data }, update: data });
      // Nunca se registran las credenciales (la guardia de writeAudit también las quitaría)
      await writeAudit(tx, user, 'EcfConnection', c.id, AuditAction.UPDATE, { providerCode: dto.providerCode, environment: dto.environment, numbering: dto.numbering, ecfTypes: dto.ecfTypes, active: dto.active, credentialsChanged: !!dto.credentials });
    });
    return this.get(user);
  }

  /** Conexión ACTIVA que emite este tipo de e-CF (null = sin conexión: se emite en el portal y se importa). */
  async activeFor(companyId: string, ecfType: string, tx?: Prisma.TransactionClient) {
    const c = await (tx ?? this.prisma).ecfConnection.findUnique({ where: { companyId } });
    return c?.active && c.ecfTypes.includes(ecfType) ? c : null;
  }

  async context(companyId: string): Promise<{ provider: EcfProvider; ctx: EcfContext }> {
    const c = await this.prisma.ecfConnection.findUnique({ where: { companyId } });
    if (!c) throw new NotFoundException('No hay conexión con el proveedor de e-CF');
    let credentials: Record<string, string> = {};
    if (c.credentialsEnc) {
      if (!this.box) throw new ServiceUnavailableException('Falta ECF_ENCRYPTION_KEY en el servidor');
      credentials = JSON.parse(this.box.open(c.credentialsEnc, this.aad(companyId)).toString()) as Record<string, string>;
    }
    return { provider: PROVIDERS[c.providerCode], ctx: { companyId, environment: c.environment as 'TEST' | 'PROD', settings: (c.settings ?? {}) as Record<string, unknown>, credentials } };
  }

  async check(user: AuthUser) {
    const { provider, ctx } = await this.context(user.companyId);
    const r = await provider.check(ctx);
    await this.prisma.ecfConnection.updateMany({ where: { companyId: user.companyId }, data: { lastCheckAt: new Date(), lastCheckOk: r.ok } });
    return r;
  }
}
