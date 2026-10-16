import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, Role } from './auth';
import { Notify } from './notify';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  if (auth.isValid()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
};

/** D-POS1: el cajero solo usa la caja; si intenta entrar al sistema contable, va a la caja. */
export const notCashierGuard: CanActivateFn = () => {
  const auth = inject(Auth);
  return auth.role() === 'CASHIER' ? inject(Router).createUrlTree(['/pos/caja']) : true;
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
