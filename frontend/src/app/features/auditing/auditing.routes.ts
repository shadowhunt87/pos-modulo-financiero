import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

export const routes: Routes = [
  { path: 'auditing', loadComponent: () => import('./engagements').then((m) => m.Engagements), title: 'Auditoría', canActivate: [roleGuard('ADMIN', 'AUDITOR')] },
  { path: 'auditing/:id', loadComponent: () => import('./engagement-detail').then((m) => m.EngagementDetail), title: 'Encargo de auditoría', canActivate: [roleGuard('ADMIN', 'AUDITOR')] },
];
