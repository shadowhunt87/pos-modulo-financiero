import { Role } from '../core/auth';

export interface NavItem { label: string; path: string; roles?: Role[] }
export interface NavGroup { title: string; items: NavItem[] }

/**
 * Menú lateral por intención (docs/PLAN-v0.2.md 9.4). `roles` limita quién lo ve (si falta, lo ven todos).
 * Las rutas no cambian; solo los nombres y la agrupación. El grupo "Auditoría" (Fase 5) se agrega en su fase,
 * como un grupo más antes de "Configuración". "Comentarios recibidos" (ADMIN) se suma a "Ayuda" con "Enviar comentario".
 */
export const NAV: NavGroup[] = [
  { title: '', items: [{ label: 'Panel', path: '/' }] },
  { title: 'Ventas y compras', items: [
    { label: 'Clientes y proveedores', path: '/partners' },
    { label: 'Facturas', path: '/invoices' },
    { label: 'Cobros y pagos', path: '/payments' },
    { label: 'Lo que me deben y lo que debo', path: '/receivables' },
    { label: 'Importar facturas electrónicas', path: '/ecf/import' },
  ] },
  { title: 'Bancos y caja', items: [
    { label: 'Bancos y cajas', path: '/bank-accounts' },
    { label: 'Conciliación bancaria', path: '/reconciliations' },
  ] },
  { title: 'Contabilidad', items: [
    { label: 'Asientos', path: '/entries' },
    { label: 'Plan de cuentas', path: '/accounts' },
    { label: 'Períodos fiscales', path: '/fiscal-periods' },
    { label: 'Años fiscales y cierre', path: '/fiscal-years' },
    { label: 'Saldos iniciales', path: '/opening-balances', roles: ['ADMIN', 'ACCOUNTANT'] },
  ] },
  { title: 'Reportes', items: [
    { label: 'Estados financieros', path: '/reports' },
    { label: 'Semáforo financiero', path: '/analysis' },
    { label: 'DGII 606 · 607 · 608', path: '/dgii' },
    { label: 'Presupuestos', path: '/budgets' },
  ] },
  { title: 'Configuración', items: [
    { label: 'Empresa', path: '/company' },
    { label: 'Usuarios', path: '/users', roles: ['ADMIN'] },
    { label: 'Conexiones con otros sistemas', path: '/service-keys', roles: ['ADMIN'] },
    { label: 'Impuestos', path: '/tax-rates' },
    { label: 'Comprobantes fiscales (NCF)', path: '/ncf' },
    { label: 'Clasificación de cuentas para reportes', path: '/account-classification' },
    { label: 'Cuentas automáticas', path: '/accounting-settings' },
    { label: 'Libros diarios', path: '/journals' },
    { label: 'Numeración de facturas y pagos', path: '/document-sequences' },
  ] },
  { title: 'Ayuda', items: [
    { label: 'Manual de usuario', path: '/help' },
    { label: 'Mis comentarios', path: '/feedback/mine' },
    { label: 'Comentarios recibidos', path: '/feedback', roles: ['ADMIN'] },
  ] },
];
