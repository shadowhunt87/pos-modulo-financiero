import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'products', loadComponent: () => import('./products').then((m) => m.Products), title: 'Productos y servicios' },
  { path: 'partners', loadComponent: () => import('./partners').then((m) => m.Partners), title: 'Clientes y proveedores' },
  { path: 'accounts', loadComponent: () => import('./accounts').then((m) => m.Accounts), title: 'Plan de cuentas' },
  { path: 'tax-rates', loadComponent: () => import('./tax-rates').then((m) => m.TaxRates), title: 'Impuestos' },
  { path: 'ncf', loadComponent: () => import('./ncf').then((m) => m.Ncf), title: 'Comprobantes (NCF)' },
  { path: 'journals', loadComponent: () => import('./journals').then((m) => m.Journals), title: 'Diarios' },
  { path: 'document-sequences', loadComponent: () => import('./document-sequences').then((m) => m.DocumentSequences), title: 'Numeración de documentos' },
  { path: 'account-classification', loadComponent: () => import('./account-classification').then((m) => m.AccountClassification), title: 'Clasificación de cuentas' },
  { path: 'accounting-settings', loadComponent: () => import('./accounting-settings').then((m) => m.AccountingSettings), title: 'Configuración contable' },
];
