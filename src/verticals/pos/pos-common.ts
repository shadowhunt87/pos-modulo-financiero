import { ForbiddenException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { UserRole } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';

export type Tx = Prisma.TransactionClient;
export type Dec = Prisma.Decimal;
export const D = (v?: Dec | number | string | null): Dec => new Prisma.Decimal(v === null || v === undefined ? 0 : v);
export const ZERO = D(0);
export const r2 = (d: Dec) => d.toDecimalPlaces(2, 4);

/** Quién opera la caja: el cajero y los supervisores (D-POS1). */
export const OPERATORS: UserRole[] = [UserRole.CASHIER, UserRole.APPROVER, UserRole.ACCOUNTANT, UserRole.ADMIN];
/** Supervisores: autorizan con su PIN y no necesitan autorización para sí mismos. */
export const SUPERVISORS: UserRole[] = [UserRole.APPROVER, UserRole.ACCOUNTANT, UserRole.ADMIN];
/** Configuran el POS. */
export const MANAGERS: UserRole[] = [UserRole.ACCOUNTANT, UserRole.ADMIN];

// ---------------- POS completo (tienda): quién ve y hace qué ----------------
/** Ven el catálogo: precios, existencias, categorías e impuestos. */
export const CATALOG_READERS: UserRole[] = [UserRole.CASHIER, UserRole.SELLER, UserRole.WAREHOUSE, UserRole.APPROVER, UserRole.ACCOUNTANT, UserRole.ADMIN];
/** Crean y editan productos y categorías. */
export const CATALOG_EDITORS: UserRole[] = [UserRole.WAREHOUSE, UserRole.ACCOUNTANT, UserRole.ADMIN];
/** Ven el kárdex, los ajustes, las compras y los proveedores. */
export const STOCK_READERS: UserRole[] = [UserRole.WAREHOUSE, UserRole.APPROVER, UserRole.ACCOUNTANT, UserRole.ADMIN];
/** Registran ajustes de inventario, compras (entrada de mercancía) y proveedores. */
export const STOCK_EDITORS: UserRole[] = [UserRole.WAREHOUSE, UserRole.ACCOUNTANT, UserRole.ADMIN];
/** Gestionan clientes y crean facturas. */
export const SALES_STAFF: UserRole[] = [UserRole.SELLER, UserRole.APPROVER, UserRole.ACCOUNTANT, UserRole.ADMIN];
/** Ven las facturas y los clientes (el cajero, para cobrarlas). */
export const INVOICE_READERS: UserRole[] = [UserRole.SELLER, UserRole.CASHIER, UserRole.APPROVER, UserRole.ACCOUNTANT, UserRole.ADMIN];
/** Piden la autorización de un supervisor (PIN): quien opera la caja y quien factura con descuento. */
export const APPROVAL_REQUESTERS: UserRole[] = [UserRole.CASHIER, UserRole.SELLER, UserRole.APPROVER, UserRole.ACCOUNTANT, UserRole.ADMIN];
/** Cobran facturas pendientes. */
export const COLLECTORS: UserRole[] = [UserRole.CASHIER, UserRole.APPROVER, UserRole.ACCOUNTANT, UserRole.ADMIN];

export const isSupervisor = (u: AuthUser) => SUPERVISORS.includes(u.role);

/** Fecha de hoy en Santo Domingo (UTC−4), como fecha sin hora: la que llevan la factura y el cobro. */
export function drToday(now = new Date()): Date {
  const local = new Date(now.getTime() - 4 * 3_600_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

/** Error de negocio con código, para que la caja reaccione (pedir PIN, refrescar el catálogo...). */
export const posError = (code: string, message: string, extra: Record<string, unknown> = {}) =>
  new UnprocessableEntityException({ code, message, ...extra });

export const forbidden = (message: string) => new ForbiddenException(message);

/** Orígenes de los documentos del POS (contrato de verticales §3.2). */
export const SOURCE = { SALE: 'pos.venta', RETURN: 'pos.devolucion', SHIFT: 'pos.turno', MOVEMENT: 'pos.movimiento' } as const;
