import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, Role } from './auth';
import { Notify } from './notify';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  if (auth.isValid()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/**
 * D-POS1: los roles de tienda no usan el sistema contable. El cajero va a la caja; el vendedor y el almacén trabajan en
 * la aplicación del punto de venta (pos-frontend), así que aquí se les cierra la sesión con el aviso.
 */
export const notCashierGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  const role = auth.role();
  if (role === 'CASHIER') return inject(Router).createUrlTree(['/pos/caja']);
  if (role === 'SELLER' || role === 'WAREHOUSE') {
    inject(Notify).error('Tu usuario es de tienda: entra por la aplicación del punto de venta.');
    auth.logout();
    return inject(Router).createUrlTree(['/login']);
  }
  return true;
};

/** Restringe una ruta a ciertos roles. La API igual valida; esto evita mostrar pantallas inútiles. */
export function roleGuard(...roles: Role[]): CanActivateFn {
  return () => {
    const auth = inject(Auth);
    if (auth.has(...roles)) return true;
    inject(Notify).error('Tu rol no tiene acceso a esa sección.');
    return inject(Router).createUrlTree(['/']);
  };
}
