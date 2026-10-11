/**
 * Traductor de errores de validación (class-validator, en inglés) a español de negocio.
 * Un solo archivo; el backend no se toca. `errorMessage()` / `errorList()` (core/errors.ts) lo llaman,
 * así todas las pantallas mejoran sin editarlas. Si no reconoce un mensaje, devuelve el original.
 */

/** Nombre de cada campo en lenguaje de negocio (clave = propiedad del DTO del backend). */
const FIELDS: Record<string, string> = {
  partnerId: 'Cliente o proveedor', accountId: 'Cuenta', costCenterId: 'Centro de costo', parentId: 'Cuenta padre',
  invoiceId: 'Factura', paymentId: 'Pago', creditNoteId: 'Nota de crédito', relatedInvoiceId: 'Factura relacionada',
  bankAccountId: 'Cuenta de banco', cashRegisterId: 'Caja', custodianId: 'Responsable de la caja', glAccountId: 'Cuenta contable',
  taxRateId: 'Impuesto', journalEntryId: 'Asiento', journalEntryLineIds: 'Líneas del asiento', reconciliationId: 'Conciliación',
  fromId: 'Origen', toId: 'Destino', fromType: 'Tipo de origen', toType: 'Tipo de destino',
  date: 'Fecha', issueDate: 'Fecha de emisión', dueDate: 'Fecha de vencimiento', expirationDate: 'Fecha de vencimiento',
  startDate: 'Fecha de inicio', endDate: 'Fecha de fin', periodStart: 'Inicio del período', statementDate: 'Fecha del extracto',
  openingBalanceDate: 'Fecha del saldo inicial', asOf: 'Fecha de corte', from: 'Desde', to: 'Hasta', period: 'Período',
  month: 'Mes', year: 'Año', fromMonth: 'Mes inicial', toMonth: 'Mes final', fiscalYearStartMonth: 'Mes en que inicia el año fiscal',
  description: 'Descripción', notes: 'Notas', reason: 'Motivo', reference: 'Referencia', message: 'Mensaje', name: 'Nombre',
  legalName: 'Razón social', tradeName: 'Nombre comercial', code: 'Código', email: 'Correo', phone: 'Teléfono', address: 'Dirección',
  city: 'Ciudad', country: 'País', taxId: 'RNC o cédula', taxIdType: 'Tipo de documento', logoUrl: 'Dirección del logo',
  ncf: 'Comprobante fiscal (NCF)', ncfType: 'Tipo de comprobante fiscal', defaultNcfType: 'Tipo de comprobante por defecto',
  reasonCode: 'Motivo de la nota', dgiiCode: 'Código DGII', dgiiExpenseType: 'Tipo de gasto (DGII)', dgiiIncomeType: 'Tipo de ingreso (DGII)',
  amount: 'Monto', quantity: 'Cantidad', unitPrice: 'Precio unitario', discount: 'Descuento', rate: 'Tasa', base: 'Base',
  debit: 'Débito', credit: 'Crédito', balance: 'Saldo', balanceAfter: 'Saldo después', openingBalance: 'Saldo inicial',
  statementBalance: 'Saldo del extracto', plannedAmount: 'Monto presupuestado', creditLimit: 'Límite de crédito',
  currency: 'Moneda', baseCurrency: 'Moneda base', exchangeRate: 'Tasa de cambio', paymentTermsDays: 'Días de crédito',
  method: 'Forma de pago', direction: 'Cobro o pago', status: 'Estado', type: 'Tipo', category: 'Categoría', scope: 'Alcance',
  role: 'Rol', password: 'Clave', newPassword: 'Clave nueva', currentPassword: 'Clave actual',
  bankName: 'Banco', accountNumber: 'Número de cuenta', iban: 'IBAN', swift: 'SWIFT', active: 'Activo',
  prefix: 'Prefijo', padding: 'Cantidad de dígitos', nextNumber: 'Próximo número', lastUsedNumber: 'Último número usado', rangeEnd: 'Número final',
  warningThreshold: 'Aviso cuando queden', issueNow: 'Emitir ahora', isContra: 'Cuenta de naturaleza contraria',
  isWithholdingAgent: 'Agente de retención', requireEntryApproval: 'Exigir aprobación de asientos', cashFlowCategory: 'Categoría de flujo de efectivo',
  matchText: 'Texto a buscar', priority: 'Prioridad', applyRules: 'Aplicar reglas', apply: 'Aplicar',
  q: 'Búsqueda', page: 'Página', limit: 'Cantidad por página', format: 'Formato', days: 'Días', overdue: 'Solo vencidos',
  csv: 'Archivo CSV', delimiter: 'Separador', decimalSeparator: 'Separador decimal', dateFormat: 'Formato de fecha',
  hasHeader: 'Tiene encabezado', columns: 'Columnas', rows: 'Filas', externalId: 'Identificador externo', subledger: 'Auxiliar',
  appliesTo: 'Se aplica a', replace: 'Reemplazar', generatePeriods: 'Generar períodos',
  lines: 'Líneas', items: 'Líneas', allocations: 'Aplicaciones', withholdings: 'Retenciones',
  receivableAccountId: 'Cuentas por cobrar', payableAccountId: 'Cuentas por pagar', salesIncomeAccountId: 'Ingresos por ventas',
  purchaseExpenseAccountId: 'Gastos de compras', salesDiscountAccountId: 'Descuentos en ventas', salesAccountId: 'Cuenta de ventas',
  purchaseAccountId: 'Cuenta de compras', customerAdvanceAccountId: 'Anticipos de clientes', supplierAdvanceAccountId: 'Anticipos a proveedores',
  retainedEarningsAccountId: 'Utilidades retenidas', currentYearResultAccountId: 'Resultado del ejercicio',
  fxGainAccountId: 'Ganancia cambiaria', fxLossAccountId: 'Pérdida cambiaria', roundingAccountId: 'Redondeo',
  itbisPayableAccountId: 'ITBIS por pagar', itbisReceivableAccountId: 'ITBIS adelantado',
};

/** Cómo se llama cada elemento de una lista (para "línea 2"). */
const ITEM_NOUN: Record<string, string> = {
  lines: 'línea', items: 'línea', allocations: 'aplicación', withholdings: 'retención', rows: 'fila', columns: 'columna',
};

/** Nombre en español de un campo; admite rutas anidadas: "items.0.quantity" -> "Cantidad (línea 1)". */
export function fieldLabel(path: string): string {
  const parts = path.split('.').filter(Boolean);
  if (!parts.length) return path;
  let noun = '';
  let index = '';
  let leaf = parts[parts.length - 1];
  for (let i = 0; i < parts.length - 1; i++) {
    if (/^\d+$/.test(parts[i + 1] ?? '') && ITEM_NOUN[parts[i]]) { noun = ITEM_NOUN[parts[i]]; index = String(Number(parts[i + 1]) + 1); }
  }
  if (/^\d+$/.test(leaf)) { leaf = parts[parts.length - 2] ?? leaf; }
  const base = FIELDS[leaf] ?? leaf;
  return noun ? `${base} (${noun} ${index})` : base;
}

type Rule = [RegExp, (field: string, m: RegExpMatchArray) => string];
const q = (f: string): string => `«${fieldLabel(f)}»`;
const PATH = '([\\w.]+)';

/** Reglas, de más específica a más general. El orden importa. */
const RULES: Rule[] = [
  [new RegExp(`^(?:property )?${PATH} should not exist$`), (f) => `El dato ${q(f)} no corresponde a esta pantalla. Recarga la página; si sigue, avisa a soporte.`],
  [new RegExp(`^${PATH} must be a UUID$`), (f) => `Elige una opción de la lista en ${q(f)}.`],
  [new RegExp(`^${PATH} should not be empty$`), (f) => `${q(f)} es obligatorio.`],
  [new RegExp(`^${PATH} must be longer than or equal to (\\d+) characters?$`), (f, m) => `${q(f)} debe tener al menos ${m[2]} caracteres.`],
  [new RegExp(`^${PATH} must be shorter than or equal to (\\d+) characters?$`), (f, m) => `${q(f)} no puede pasar de ${m[2]} caracteres.`],
  [new RegExp(`^${PATH} must not be less than (-?[\\d.]+)$`), (f, m) => `${q(f)} no puede ser menor que ${m[2]}.`],
  [new RegExp(`^${PATH} must not be greater than (-?[\\d.]+)$`), (f, m) => `${q(f)} no puede ser mayor que ${m[2]}.`],
  [new RegExp(`^${PATH} must be a positive number$`), (f) => `${q(f)} debe ser mayor que cero.`],
  [new RegExp(`^${PATH} must be a negative number$`), (f) => `${q(f)} debe ser un número negativo.`],
  [new RegExp(`^${PATH} must be an integer number$`), (f) => `${q(f)} debe ser un número entero, sin decimales.`],
  [new RegExp(`^${PATH} must be a number(?: conforming to the specified constraints| string)?$`), (f) => `${q(f)} debe ser un número válido.`],
  [new RegExp(`^${PATH} must be an email$`), (f) => `${q(f)} no es un correo válido. Escríbelo así: nombre@empresa.com.`],
  [new RegExp(`^${PATH} must be a valid ISO 8601 date string$`), (f) => `${q(f)} debe ser una fecha válida.`],
  [new RegExp(`^${PATH} must be a Date instance$`), (f) => `${q(f)} debe ser una fecha válida.`],
  [new RegExp(`^${PATH} must be one of the following values: .+$`), (f) => `${q(f)} tiene un valor que no está permitido. Elige una opción de la lista.`],
  [new RegExp(`^${PATH} must be a boolean value$`), (f) => `${q(f)} debe ser sí o no.`],
  [new RegExp(`^${PATH} must contain at least (\\d+) elements?$`), (f, m) => `Agrega al menos ${m[2]} en ${q(f)}.`],
  [new RegExp(`^${PATH} must be an array$`), (f) => `${q(f)} debe ser una lista.`],
  [new RegExp(`^${PATH} must be a string$`), (f) => `${q(f)} debe ser texto.`],
  [new RegExp(`^${PATH} must be a URL address$`), (f) => `${q(f)} debe ser una dirección web válida (empieza con https://).`],
  [new RegExp(`^${PATH} must match .+ regular expression$`), (f) => `${q(f)} no tiene el formato correcto.`],
  [new RegExp(`^nested property ${PATH} must be either object or array$`), (f) => `Falta completar ${q(f)}.`],
];

/** Traduce un mensaje de validación; si no lo reconoce, lo devuelve igual. */
export function translateValidation(msg: string): string {
  const text = msg.trim();
  for (const [re, fn] of RULES) {
    const m = text.match(re);
    if (m) return fn(m[1], m);
  }
  return msg;
}

/** Cómo arreglar los errores de validación más comunes (se usa cuando ayuda.json no trae una explicación). */
export interface FixHint { pattern: RegExp; explanation: string; link?: { texto: string; ruta: string } }
export const FIX_HINTS: FixHint[] = [
  { pattern: /must be a UUID/, explanation: 'Falta elegir un cliente, proveedor, cuenta u otro dato de una lista. Abre la lista y escoge uno; si no existe, créalo desde el mismo lugar.' },
  { pattern: /should not be empty/, explanation: 'Completa el campo marcado y vuelve a guardar.' },
  { pattern: /should not exist/, explanation: 'La pantalla quedó desactualizada. Recarga la página (Ctrl+R) y vuelve a intentar.' },
  { pattern: /must (not be (less|greater) than|be a positive)/, explanation: 'Corrige el valor para que esté dentro del rango permitido y guarda de nuevo.' },
  { pattern: /must be an email/, explanation: 'Revisa que el correo tenga @ y un dominio, por ejemplo nombre@empresa.com.' },
  { pattern: /valid ISO 8601 date/, explanation: 'Elige la fecha con el calendario o escríbela completa (día, mes y año).' },
  { pattern: /must contain at least/, explanation: 'Agrega al menos una línea antes de guardar.' },
];
