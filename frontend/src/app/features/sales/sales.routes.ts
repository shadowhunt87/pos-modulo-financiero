import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: 'invoices', loadComponent: () => import('./invoices').then((m) => m.Invoices), title: 'Facturas' },
  { path: 'invoices/new', loadComponent: () => import('./invoice-form').then((m) => m.InvoiceForm), title: 'Nueva factura' },
  { path: 'invoices/:id/edit', loadComponent: () => import('./invoice-form').then((m) => m.InvoiceForm), title: 'Editar factura' },
  { path: 'invoices/:id', loadComponent: () => import('./invoice-detail').then((m) => m.InvoiceDetail), title: 'Factura' },
  { path: 'payments', loadComponent: () => import('./payments').then((m) => m.Payments), title: 'Cobros y pagos' },
  { path: 'payments/new', loadComponent: () => import('./payment-form').then((m) => m.PaymentForm), title: 'Nuevo cobro o pago' },
  { path: 'payments/:id', loadComponent: () => import('./payment-detail').then((m) => m.PaymentDetail), title: 'Cobro o pago' },
  { path: 'receivables', loadComponent: () => import('./receivables').then((m) => m.Receivables), title: 'Cuentas por cobrar y pagar' },
];
