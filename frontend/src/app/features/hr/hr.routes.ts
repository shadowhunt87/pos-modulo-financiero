import { Routes } from '@angular/router';
import { roleGuard } from '../../core/guards';

// P3: RRHH y nómina. Salarios y documentos son sensibles: solo ADMIN y ACCOUNTANT (igual que el backend)
const hr = [roleGuard('ADMIN', 'ACCOUNTANT')];

export const routes: Routes = [
  { path: 'hr/employees', loadComponent: () => import('./employees').then((m) => m.Employees), title: 'Empleados', canActivate: hr },
  { path: 'hr/payroll', loadComponent: () => import('./payroll-runs').then((m) => m.PayrollRuns), title: 'Nóminas', canActivate: hr },
  { path: 'hr/payroll/:id', loadComponent: () => import('./payroll-detail').then((m) => m.PayrollDetail), title: 'Nómina', canActivate: hr },
  { path: 'hr/reports', loadComponent: () => import('./payroll-reports').then((m) => m.PayrollReports), title: 'Reportes de nómina', canActivate: hr },
  { path: 'hr/settings', loadComponent: () => import('./hr-settings').then((m) => m.HrSettings), title: 'Configuración de nómina', canActivate: hr },
];
