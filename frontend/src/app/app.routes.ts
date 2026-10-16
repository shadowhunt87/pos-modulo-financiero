import { Routes } from '@angular/router';
import { authGuard, notCashierGuard, roleGuard } from './core/guards';
import { Shell } from './layout/shell';

/**
 * Cada área vive en features/<área>/<área>.routes.ts y se carga cuando se visita.
 * Rutas por área:
 *  catalog   : partners, tax-rates, ncf, journals, document-sequences, account-classification, accounting-settings, accounts
 *  sales     : invoices, payments, receivables
 *  ledger    : entries, fiscal-periods, fiscal-years, opening-balances
 *  treasury  : bank-accounts, reconciliations
 *  reporting : reports, dgii, budgets
 *  admin     : users, service-keys, company, profile
 *  help      : help, help/:slug
 *  feedback  : feedback/mine, feedback
 *  ecf       : ecf/import
 *  fiscal    : fiscal-values, company/fiscal
 *  setup     : setup, setup/ncf
 *  auditing  : auditing, auditing/:id
 */
export const routes: Routes = [
  { path: 'login', loadComponent: () => import('./features/auth/login').then((m) => m.Login), title: 'Iniciar sesión' },
  // Caja del punto de venta: pantalla completa, sin el menú del sistema (la usa el cajero)
  { path: 'pos/caja', loadComponent: () => import('./features/verticals/pos/caja/caja').then((m) => m.Caja), title: 'Caja', canActivate: [authGuard, roleGuard('CASHIER', 'APPROVER', 'ACCOUNTANT', 'ADMIN')] },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard, notCashierGuard],
    children: [
      { path: '', pathMatch: 'full', loadComponent: () => import('./features/dashboard/dashboard').then((m) => m.Dashboard), title: 'Panel' },
      { path: '', loadChildren: () => import('./features/catalog/catalog.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/sales/sales.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/ledger/ledger.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/treasury/treasury.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/reporting/reporting.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/admin/admin.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/help/help.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/feedback/feedback.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/ecf/ecf.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/fiscal/fiscal.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/setup/setup.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/auditing/auditing.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/inventory/inventory.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/hr/hr.routes').then((m) => m.routes) },
      { path: '', loadChildren: () => import('./features/verticals/pos/pos.routes').then((m) => m.routes) },
      { path: '**', loadComponent: () => import('./features/not-found').then((m) => m.NotFound), title: 'No encontrado' },
    ],
  },
  { path: '**', redirectTo: '' },
];
