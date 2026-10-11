import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { Auth } from './auth';
import { AppConfig } from './config';

/** Agrega el token a las llamadas al backend y cierra la sesión si el servidor dice 401. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const auth = inject(Auth);
  const cfg = inject(AppConfig);
  const router = inject(Router);
  const toApi = req.url.startsWith(cfg.apiUrl);
  const token = auth.token();
  const request = toApi && token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  return next(request).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && err.status === 401 && toApi && !req.url.endsWith('/auth/login') && auth.loggedIn()) {
        auth.logout(router.url.startsWith('/login') ? undefined : router.url);
      }
      return throwError(() => err);
    }),
  );
};
