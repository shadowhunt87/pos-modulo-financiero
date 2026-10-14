import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'ecf/import', loadComponent: () => import('./ecf-import').then((m) => m.EcfImport), title: 'Importar facturas electrónicas' },
];
