import type { Request } from 'express';
import type { AuditMeta } from '../../common/audit.js';

/** IP (ya resuelta por TRUST_PROXY) y navegador para la bitácora. */
export const ipOf = (req: Request) => req.ip ?? 'unknown';
export const metaOf = (req: Request): AuditMeta => ({ ipAddress: req.ip ?? null, userAgent: req.get('user-agent') ?? null });
