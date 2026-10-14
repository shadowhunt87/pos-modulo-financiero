import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

export const routes: Routes = [
  { path: 'entries', loadComponent: () => import('./entries').then((m) => m.Entries), title: 'Asientos' },
  { path: 'entries/new', loadComponent: () => import('./entry-form').then((m) => m.EntryForm), title: 'Nuevo asiento' },
  { path: 'entries/:id/edit', loadComponent: () => import('./entry-form').then((m) => m.EntryForm), title: 'Corregir asiento' },
  { path: 'entries/:id', loadComponent: () => import('./entry-detail').then((m) => m.EntryDetail), title: 'Asiento' },
  { path: 'period-close', loadComponent: () => import('./period-close').then((m) => m.PeriodClose), title: 'Cierre de mes guiado' },
  { path: 'fiscal-periods', loadComponent: () => import('./fiscal-periods').then((m) => m.FiscalPeriods), title: 'Períodos fiscales' },
  { path: 'fiscal-years', loadComponent: () => import('./fiscal-years').then((m) => m.FiscalYears), title: 'Años fiscales y cierre' },
  { path: 'opening-balances', loadComponent: () => import('./opening-balances').then((m) => m.OpeningBalances), title: 'Saldos iniciales', canActivate: [roleGuard('ADMIN', 'ACCOUNTANT')] },
];
