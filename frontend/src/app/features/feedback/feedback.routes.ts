import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

export const routes: Routes = [
  { path: 'feedback/mine', loadComponent: () => import('./my-feedback').then((m) => m.MyFeedback), title: 'Mis comentarios' },
  { path: 'feedback', loadComponent: () => import('./feedback-inbox').then((m) => m.FeedbackInbox), title: 'Comentarios recibidos', canActivate: [roleGuard('ADMIN')] },
];
