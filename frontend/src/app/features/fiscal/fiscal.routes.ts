import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'fiscal-values', loadComponent: () => import('./parameters').then((m) => m.FiscalParameters), title: 'Valores fiscales' },
  { path: 'company/fiscal', loadComponent: () => import('./fiscal-profile').then((m) => m.FiscalProfileView), title: 'Datos fiscales' },
];
