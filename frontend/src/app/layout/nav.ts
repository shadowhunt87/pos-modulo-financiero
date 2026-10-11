import { Role } from '../core/auth';

export interface NavItem { label: string; path: string; roles?: Role[] }
export interface NavGroup { title: string; items: NavItem[] }

/** Menú lateral. `roles` limita quién lo ve (si falta, lo ven todos). */
export const NAV: NavGroup[] = [
  { title: '', items: [{ label: 'Panel', path: '/' }] },
  { title: 'Ventas y compras', items: [
    { label: 'Facturas', path: '/invoices' },
    { label: 'Cobros y pagos', path: '/payments' },
    { label: 'Cuentas por cobrar y pagar', path: '/receivables' },
  ] },
  { title: 'Contabilidad', items: [
    { label: 'Asientos', path: '/entries' },
    { label: 'Plan de cuentas', path: '/accounts' },
    { label: 'Períodos fiscales', path: '/fiscal-periods' },
    { label: 'Años fiscales y cierre', path: '/fiscal-years' },
    { label: 'Saldos iniciales', path: '/opening-balances', roles: ['ADMIN', 'ACCOUNTANT'] },
  ] },
  { title: 'Tesorería', items: [
    { label: 'Bancos y cajas', path: '/bank-accounts' },
    { label: 'Conciliación bancaria', path: '/reconciliations' },
  ] },
  { title: 'Reportes', items: [
    { label: 'Estados financieros', path: '/reports' },
    { label: 'DGII 606 · 607 · 608', path: '/dgii' },
    { label: 'Presupuestos', path: '/budgets' },
  ] },
  { title: 'Catálogos', items: [
    { label: 'Clientes y proveedores', path: '/partners' },
    { label: 'Impuestos', path: '/tax-rates' },
    { label: 'Comprobantes (NCF)', path: '/ncf' },
    { label: 'Diarios', path: '/journals' },
    { label: 'Numeración de documentos', path: '/document-sequences' },
    { label: 'Clasificación de cuentas', path: '/account-classification' },
    { label: 'Configuración contable', path: '/accounting-settings' },
  ] },
  { title: 'Administración', items: [
    { label: 'Usuarios', path: '/users', roles: ['ADMIN'] },
    { label: 'Empresa', path: '/company' },
  ] },
];
