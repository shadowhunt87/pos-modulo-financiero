import { Routes } from '@angular/router';
import { roleGuard } from '../../../core/guards';

// Administración del punto de venta (la caja está en app.routes, a pantalla completa)
const managers = [roleGuard('ADMIN', 'ACCOUNTANT')];
const supervisors = [roleGuard('ADMIN', 'ACCOUNTANT', 'APPROVER')];

export const routes: Routes = [
  { path: 'pos/configuracion', loadComponent: () => import('./admin/pos-config').then((m) => m.PosConfigPage), title: 'Configuración del POS', canActivate: managers },
  { path: 'pos/productos', loadComponent: () => import('./admin/pos-products').then((m) => m.PosProductsPage), title: 'Productos en caja', canActivate: managers },
  { path: 'pos/promociones', loadComponent: () => import('./admin/pos-promotions').then((m) => m.PosPromotionsPage), title: 'Promociones', canActivate: managers },
  { path: 'pos/turnos', loadComponent: () => import('./admin/pos-shifts').then((m) => m.PosShiftsPage), title: 'Turnos de caja', canActivate: supervisors },
  { path: 'pos/turnos/:id', loadComponent: () => import('./admin/pos-shift-detail').then((m) => m.PosShiftDetail), title: 'Turno de caja', canActivate: supervisors },
  { path: 'pos/reportes', loadComponent: () => import('./admin/pos-reports').then((m) => m.PosReportsPage), title: 'Ventas del POS', canActivate: supervisors },
];
