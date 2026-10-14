import { Logger } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { SECRET_NAME_PATTERN } from './secret-names.js';

const logger = new Logger('Audit');

/** IP y navegador de quien hizo el cambio (ANEXO-S0 §3.12). */
export interface AuditMeta { ipAddress?: string | null; userAgent?: string | null }

/**
 * Quita de `changes` todo campo con nombre de secreto, a cualquier profundidad (también en listas), salvo si su valor
 * es booleano (`passwordReset: true`). Hace falta porque varios servicios guardan el DTO entero (ANEXO-S0 §3.12, N4).
 */
export function scrubSecrets(value: unknown, removed: string[] = []): unknown {
  if (Array.isArray(value)) return value.map((v) => scrubSecrets(v, removed));
  if (value === null || typeof value !== 'object' || value instanceof Date) return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value)) {
    if (SECRET_NAME_PATTERN.test(k) && typeof v !== 'boolean') { removed.push(k); continue; }
    out[k] = scrubSecrets(v, removed);
  }
  return out;
}

/** Registra auditoría dentro de la MISMA transacción que el cambio. `changes` nunca lleva secretos. */
export function writeAudit(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  entityName: string,
  entityId: string,
  action: AuditAction,
  changes?: Prisma.InputJsonValue,
  meta?: AuditMeta,
) {
  const removed: string[] = [];
  const clean = changes === undefined ? undefined : (scrubSecrets(changes, removed) as Prisma.InputJsonValue);
  if (removed.length) logger.warn(`Se quitaron campos con nombre de secreto de la bitácora de ${entityName}: ${[...new Set(removed)].join(', ')}`);
  return tx.auditLog.create({
    data: {
      companyId: user.companyId, userId: user.id, entityName, entityId, action, changes: clean,
      ipAddress: meta?.ipAddress ?? null, userAgent: meta?.userAgent ? meta.userAgent.slice(0, 300) : null,
    },
  });
}

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
