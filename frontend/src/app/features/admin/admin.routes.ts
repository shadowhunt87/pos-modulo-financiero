import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

export const routes: Routes = [
  { path: 'users', loadComponent: () => import('./users').then((m) => m.Users), title: 'Usuarios', canActivate: [roleGuard('ADMIN')] },
  { path: 'company', loadComponent: () => import('./company').then((m) => m.Company), title: 'Empresa' },
  { path: 'profile', loadComponent: () => import('./profile').then((m) => m.Profile), title: 'Mi perfil' },
];
