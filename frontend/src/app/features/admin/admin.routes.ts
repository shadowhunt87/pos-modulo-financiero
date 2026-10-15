import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

export const routes: Routes = [
  { path: 'users', loadComponent: () => import('./users').then((m) => m.Users), title: 'Usuarios', canActivate: [roleGuard('ADMIN')] },
  { path: 'service-keys', loadComponent: () => import('./service-keys').then((m) => m.ServiceKeys), title: 'Conexiones con sistemas', canActivate: [roleGuard('ADMIN')] },
  { path: 'company', loadComponent: () => import('./company').then((m) => m.Company), title: 'Empresa' },
  { path: 'security', loadComponent: () => import('./security').then((m) => m.Security), title: 'Seguridad de mi cuenta' },
  { path: 'data-export', loadComponent: () => import('./data-export').then((m) => m.DataExport), title: 'Exportar todos mis datos', canActivate: [roleGuard('ADMIN')] },
  { path: 'profile', loadComponent: () => import('./profile').then((m) => m.Profile), title: 'Mi perfil' },
];
