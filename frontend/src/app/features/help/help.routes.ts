import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'help', loadComponent: () => import('./help-index').then((m) => m.HelpIndex), title: 'Manual de usuario' },
  { path: 'help/:slug', loadComponent: () => import('./help-page').then((m) => m.HelpPage), title: 'Manual de usuario' },
];
