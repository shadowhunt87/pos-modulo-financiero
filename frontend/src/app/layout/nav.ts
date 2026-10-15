import { Role } from '../core/auth';

export interface NavItem { label: string; path: string; roles?: Role[] }
export interface NavGroup { title: string; icon: NavIcon; items: NavItem[] }
export type NavIcon = 'home' | 'sales' | 'ecf' | 'bank' | 'ledger' | 'tax' | 'chart' | 'audit' | 'gear' | 'help';

/**
 * Menú lateral por secciones (acordeón: se abre una a la vez y la de la pantalla actual se abre sola).
 * `roles` limita quién lo ve (si falta, lo ven todos). Las rutas no cambian; solo los nombres y la agrupación.
 * El manual cita las rutas del menú como «Sección › Opción»: si se mueve una opción, actualizar public/manual.
 */
export const NAV: NavGroup[] = [
  { title: '', icon: 'home', items: [{ label: 'Panel', path: '/' }] },
  { title: 'Ventas y compras', icon: 'sales', items: [
    { label: 'Clientes y proveedores', path: '/partners' },
    { label: 'Facturas', path: '/invoices' },
    { label: 'Cobros y pagos', path: '/payments' },
    { label: 'Lo que me deben y lo que debo', path: '/receivables' },
  ] },
  { title: 'Factura electrónica', icon: 'ecf', items: [
    { label: 'Facturas electrónicas (e-CF)', path: '/ecf/inbox' },
    { label: 'Importar facturas electrónicas', path: '/ecf/import' },
    { label: 'Conexión con el proveedor', path: '/ecf/connection', roles: ['ADMIN'] },
  ] },
  { title: 'Bancos y caja', icon: 'bank', items: [
    { label: 'Bancos y cajas', path: '/bank-accounts' },
    { label: 'Conciliación bancaria', path: '/reconciliations' },
  ] },
  { title: 'Contabilidad', icon: 'ledger', items: [
    { label: 'Asientos', path: '/entries' },
    { label: 'Plan de cuentas', path: '/accounts' },
    { label: 'Cierre de mes guiado', path: '/period-close' },
    { label: 'Períodos fiscales', path: '/fiscal-periods' },
    { label: 'Años fiscales y cierre', path: '/fiscal-years' },
    { label: 'Saldos iniciales', path: '/opening-balances', roles: ['ADMIN', 'ACCOUNTANT'] },
  ] },
  { title: 'Impuestos y DGII', icon: 'tax', items: [
    { label: 'DGII 606 · 607 · 608', path: '/dgii' },
    { label: 'Revisión del mes', path: '/dgii/review' },
    { label: 'Declaraciones (IT-1, IR-17, 609)', path: '/dgii/it1' },
    { label: 'Calendario fiscal', path: '/fiscal-calendar' },
    { label: 'Comprobantes fiscales (NCF)', path: '/ncf' },
    { label: 'Impuestos', path: '/tax-rates' },
    { label: 'Valores fiscales', path: '/fiscal-values' },
  ] },
  { title: 'Reportes', icon: 'chart', items: [
    { label: 'Estados financieros', path: '/reports' },
    { label: 'Semáforo financiero', path: '/analysis' },
    { label: 'Presupuestos', path: '/budgets' },
  ] },
  { title: 'Auditoría', icon: 'audit', items: [
    { label: 'Encargos de auditoría', path: '/auditing', roles: ['ADMIN', 'AUDITOR'] },
  ] },
  { title: 'Configuración', icon: 'gear', items: [
    { label: 'Configuración inicial', path: '/setup' },
    { label: 'Empresa', path: '/company' },
    { label: 'Datos fiscales', path: '/company/fiscal' },
    { label: 'Usuarios', path: '/users', roles: ['ADMIN'] },
    { label: 'Seguridad de mi cuenta', path: '/security' },
    { label: 'Cuentas automáticas', path: '/accounting-settings' },
    { label: 'Clasificación de cuentas', path: '/account-classification' },
    { label: 'Libros diarios', path: '/journals' },
    { label: 'Numeración de documentos', path: '/document-sequences' },
    { label: 'Conexiones con sistemas', path: '/service-keys', roles: ['ADMIN'] },
    { label: 'Exportar todos mis datos', path: '/data-export', roles: ['ADMIN'] },
  ] },
  { title: 'Ayuda', icon: 'help', items: [
    { label: 'Manual de usuario', path: '/help' },
    { label: 'Novedades', path: '/help/novedades' },
    { label: 'Mis comentarios', path: '/feedback/mine' },
    { label: 'Comentarios recibidos', path: '/feedback', roles: ['ADMIN'] },
  ] },
];

/** Trazos de los iconos (24×24, línea de 1.75). Dibujados para este sistema. */
export const NAV_ICONS: Record<NavIcon | 'chevron' | 'sun' | 'moon' | 'menu' | 'help-circle' | 'message' | 'logout' | 'user' | 'eye-off', string> = {
  home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
  sales: 'M4 4h2l2.4 11.2a1 1 0 0 0 1 .8h8.2a1 1 0 0 0 1-.8L20 8H7M10 20.5h.01M17 20.5h.01',
  ecf: 'M14 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8zM14 3v5h5M9 13h6M9 17h4',
  bank: 'M3 10 12 4l9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 21h18',
  ledger: 'M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6',
  tax: 'M7 3h10v18l-2.5-1.5L12 21l-2.5-1.5L7 21zM9.5 14.5l5-5M9.75 9.75h.01M14.25 14.25h.01',
  chart: 'M4 20V4M4 20h16M8 16v-4M12 16V8M16 16v-6',
  audit: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20.5 20.5 16 16M8 11l2 2 4-4',
  gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z',
  help: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17.5h.01',
  'help-circle': 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4M12 17.5h.01',
  chevron: 'm9 6 6 6-6 6',
  sun: 'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4',
  moon: 'M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z',
  menu: 'M4 6h16M4 12h16M4 18h16',
  message: 'M21 12a8 8 0 0 1-11.8 7L4 20l1-4.6A8 8 0 1 1 21 12z',
  logout: 'M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 17l5-5-5-5M15 12H4',
  user: 'M12 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8zM4 21a8 8 0 0 1 16 0',
  'eye-off': 'M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.2A10 10 0 0 1 12 5c5 0 9 5 10 7a17 17 0 0 1-3 3.8M6.6 6.6C4.4 8 2.8 10.2 2 12c1 2 5 7 10 7a10 10 0 0 0 4.2-.9',
};
