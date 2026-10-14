import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'fiscal-values', loadComponent: () => import('./parameters').then((m) => m.FiscalParameters), title: 'Valores fiscales' },
  { path: 'fiscal-calendar', loadComponent: () => import('./calendar').then((m) => m.FiscalCalendar), title: 'Calendario fiscal' },
  { path: 'company/fiscal', loadComponent: () => import('./fiscal-profile').then((m) => m.FiscalProfileView), title: 'Datos fiscales' },
];
