import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

export const routes: Routes = [
  { path: 'ecf/import', loadComponent: () => import('./ecf-import').then((m) => m.EcfImport), title: 'Importar facturas electrónicas' },
  { path: 'ecf/inbox', loadComponent: () => import('./ecf-inbox').then((m) => m.EcfInbox), title: 'Facturas electrónicas (e-CF)' },
  { path: 'ecf/connection', loadComponent: () => import('./ecf-connection').then((m) => m.EcfConnection), title: 'Facturación electrónica: conexión', canActivate: [roleGuard('ADMIN')] },
];
