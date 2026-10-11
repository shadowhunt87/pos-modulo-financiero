import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'bank-accounts', loadComponent: () => import('./bank-accounts').then((m) => m.BankAccounts), title: 'Bancos y cajas' },
  { path: 'bank-accounts/:id', loadComponent: () => import('./bank-account-detail').then((m) => m.BankAccountDetail), title: 'Cuenta bancaria' },
  { path: 'reconciliations', loadComponent: () => import('./reconciliations').then((m) => m.Reconciliations), title: 'Conciliación bancaria' },
  { path: 'reconciliations/:id', loadComponent: () => import('./reconciliation-detail').then((m) => m.ReconciliationDetail), title: 'Conciliación' },
];
