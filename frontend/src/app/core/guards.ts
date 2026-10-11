import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { Auth, Role } from './auth';
import { Notify } from './notify';

export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(Auth);
  if (auth.isValid()) return true;
  return inject(Router).createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
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
