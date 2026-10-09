import type { Prisma } from '../generated/prisma/client.js';
import type { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';

/** Registra auditoría dentro de la MISMA transacción que el cambio. */
export function writeAudit(
  tx: Prisma.TransactionClient,
  user: AuthUser,
  entityName: string,
  entityId: string,
  action: AuditAction,
  changes?: Prisma.InputJsonValue,
) {
  return tx.auditLog.create({
    data: { companyId: user.companyId, userId: user.id, entityName, entityId, action, changes },
  });
}

export const isUniqueViolation = (e: unknown) => (e as { code?: string })?.code === 'P2002';
