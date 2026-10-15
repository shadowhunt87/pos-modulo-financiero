import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'inventory', loadComponent: () => import('./stock').then((m) => m.Stock), title: 'Existencias' },
  { path: 'inventory/products/:id', loadComponent: () => import('./kardex').then((m) => m.Kardex), title: 'Kárdex del producto' },
  { path: 'inventory/adjustments', loadComponent: () => import('./adjustments').then((m) => m.Adjustments), title: 'Ajustes de inventario' },
  { path: 'inventory/adjustments/new', loadComponent: () => import('./adjustment-form').then((m) => m.AdjustmentForm), title: 'Nuevo ajuste de inventario' },
  { path: 'inventory/adjustments/:id', loadComponent: () => import('./adjustment-detail').then((m) => m.AdjustmentDetail), title: 'Ajuste de inventario' },
];
