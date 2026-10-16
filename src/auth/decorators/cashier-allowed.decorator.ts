import { SetMetadata } from '@nestjs/common';

export const CASHIER_ALLOWED_KEY = 'cashierAllowed';

/**
 * D-POS1 (docs/PLAN-POS.md): un usuario CASHIER solo entra a las rutas (o controladores) marcadas así. En todo lo demás la
 * guardia de sesión responde 403, también en las lecturas que hoy están abiertas a cualquier rol.
 */
export const CashierAllowed = () => SetMetadata(CASHIER_ALLOWED_KEY, true);
