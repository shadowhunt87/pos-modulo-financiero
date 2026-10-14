import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'setup', loadComponent: () => import('./setup-wizard').then((m) => m.SetupWizard), title: 'Configuración inicial' },
  { path: 'setup/ncf', loadComponent: () => import('./ncf-guide').then((m) => m.NcfGuide), title: 'Tus comprobantes fiscales (NCF)' },
];
