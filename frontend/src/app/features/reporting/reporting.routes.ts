import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'reports', loadComponent: () => import('./reports').then((m) => m.Reports), title: 'Estados financieros' },
  { path: 'analysis', loadComponent: () => import('./analysis').then((m) => m.Analysis), title: 'Semáforo financiero' },
  { path: 'dgii', loadComponent: () => import('./dgii').then((m) => m.Dgii), title: 'DGII 606 · 607 · 608' },
  { path: 'dgii/it1', loadComponent: () => import('./dgii-forms').then((m) => m.DgiiForms), title: 'Declaraciones DGII', data: { form: 'it1' } },
  { path: 'dgii/ir17', loadComponent: () => import('./dgii-forms').then((m) => m.DgiiForms), title: 'Declaraciones DGII', data: { form: 'ir17' } },
  { path: 'dgii/609', loadComponent: () => import('./dgii-forms').then((m) => m.DgiiForms), title: 'Declaraciones DGII', data: { form: '609' } },
  { path: 'dgii/review', loadComponent: () => import('./dgii-returns').then((m) => m.DgiiReturns), title: 'Revisión del mes' },
  { path: 'budgets', loadComponent: () => import('./budgets').then((m) => m.Budgets), title: 'Presupuestos' },
  { path: 'budgets/:id', loadComponent: () => import('./budget-detail').then((m) => m.BudgetDetail), title: 'Presupuesto' },
];
