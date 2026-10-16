import { SetMetadata } from '@nestjs/common';

export const CASHIER_ALLOWED_KEY = 'cashierAllowed';

/** Roles de tienda: solo usan el punto de venta (cajero, vendedor y almacén). */
export const STORE_ONLY_ROLES: readonly string[] = ['CASHIER', 'SELLER', 'WAREHOUSE'];

/**
 * D-POS1 (docs/PLAN-POS.md): un usuario de tienda (STORE_ONLY_ROLES) solo entra a las rutas (o controladores) marcadas
 * así. En todo lo demás la guardia de sesión responde 403, también en las lecturas que hoy están abiertas a cualquier rol.
 * Qué rol de tienda entra a cada ruta lo decide su @Roles().
 */
export const CashierAllowed = () => SetMetadata(CASHIER_ALLOWED_KEY, true);
