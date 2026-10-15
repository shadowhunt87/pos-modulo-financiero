import type { Prisma } from '../generated/prisma/client.js';

/**
 * Registro de la exportación completa (ANEXO-S0 §4.2). CADA modelo de Prisma aparece aquí una vez, con su clase.
 * Todo paquete (o vertical) que cree un modelo lo registra en su propio PR; si no, la prueba de cobertura falla.
 * Nombres fijos: una columna con archivo se llama `fileUrl`/`…FileUrl` (o se declara en `files`); una cifrada termina en `Enc`.
 */
export type ExportClass = 'SELF' | 'COMPANY' | 'CHILD' | 'ROW_FILTERED' | 'EXCLUDED_ROLE' | 'GLOBAL_PUBLIC' | 'SECRET';

export interface FileColumn {
  column: string;
  /** Carpeta dentro del ZIP: `adjuntos` o `xml/<Modelo>` */
  folder: 'adjuntos' | 'xml';
  /** Patrón EXACTO de la clave, con el companyId de la empresa que exporta (§4.9) */
  pattern: (companyId: string) => RegExp;
  /** Columna con el nombre original del archivo (si existe) */
  nameColumn?: string;
}

export interface ExportEntry {
  model: string;
  cls: ExportClass;
  /** Filtro por empresa (COMPANY, CHILD, ROW_FILTERED); para CHILD, por la relación con su padre */
  where?: (companyId: string) => Record<string, unknown>;
  excludedColumns?: { column: string; reason: string }[];
  jsonColumns?: string[];
  files?: FileColumn[];
  /** Motivo (SECRET, EXCLUDED_ROLE, ROW_FILTERED) */
  reason?: string;
}

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const byCompany = (companyId: string) => ({ companyId });
const company = (model: string, extra: Omit<ExportEntry, 'model' | 'cls' | 'where'> = {}): ExportEntry => ({ model, cls: 'COMPANY', where: byCompany, ...extra });
const child = <W>(model: string, where: (companyId: string) => W): ExportEntry => ({ model, cls: 'CHILD', where: where as (c: string) => Record<string, unknown> });
const ecfXml: FileColumn['pattern'] = (c) => new RegExp(`^${esc(c)}/ecf-xml/${UUID}\\.xml$`);

export const EXPORT_REGISTRY: ExportEntry[] = [
  { model: 'Company', cls: 'SELF', where: (companyId) => ({ id: companyId }) },
  company('AccountingSettings'), company('DocumentSequence'),
  company('User', { excludedColumns: [{ column: 'password', reason: 'Hash de la clave: nunca sale (R12)' }] }),
  company('Account'), company('FiscalYear'), company('FiscalPeriod'), company('Journal'), company('JournalEntry'),
  company('CostCenter'), company('ExchangeRate'), company('Partner'), company('TaxRate'), company('NcfSequence'),
  company('Invoice'), company('Payment'),
  company('BankConnection', { excludedColumns: [{ column: 'credentialsEnc', reason: 'Credenciales bancarias cifradas: nunca salen (R12)' }] }),
  company('BankAccount'), company('BankReconciliation'), company('BankRule'), company('CashRegister'), company('Budget'),
  company('FinancialRatioSnapshot', { jsonColumns: ['ratios'] }),
  company('Attachment', { files: [{ column: 'fileUrl', folder: 'adjuntos', nameColumn: 'fileName', pattern: (c) => new RegExp(`^${esc(c)}/${UUID}$`) }] }),
  company('AuditLog', { jsonColumns: ['changes'] }), // writeAudit garantiza que `changes` no trae secretos (§3.12)
  company('Feedback'),
  company('EcfDocument', { files: [{ column: 'xmlFileUrl', folder: 'xml', pattern: ecfXml }] }),
  company('EcfImport', { jsonColumns: ['preview'], files: [{ column: 'storageKey', folder: 'xml', nameColumn: 'fileName', pattern: ecfXml }] }),
  company('ServiceKey', { excludedColumns: [{ column: 'keyHash', reason: 'Hash de la llave de servicio: nunca sale' }] }),
  company('RatioThreshold'), company('CompanyFiscalProfile'), company('SampleRecord'),
  company('FiscalFiling', { jsonColumns: ['snapshot'] }), company('BContingency'),
  company('EcfConnection', { jsonColumns: ['settings'], excludedColumns: [{ column: 'credentialsEnc', reason: 'Credenciales del proveedor de e-CF cifradas: nunca salen (R12)' }] }),
  company('EcfEvent'),
  company('Product'), company('InventoryMovement'), company('InventoryAdjustment'),
  company('Department'), company('Employee'), company('PayrollConcept'), company('PayrollSettings'),
  company('PayrollRun', { jsonColumns: ['parameters'] }),

  child('JournalEntryLine', (c): Prisma.JournalEntryLineWhereInput => ({ journalEntry: { companyId: c } })),
  child('InvoiceLine', (c): Prisma.InvoiceLineWhereInput => ({ invoice: { companyId: c } })),
  child('InvoiceWithholding', (c): Prisma.InvoiceWithholdingWhereInput => ({ invoice: { companyId: c } })),
  child('PaymentAllocation', (c): Prisma.PaymentAllocationWhereInput => ({ payment: { companyId: c } })),
  child('BankTransaction', (c): Prisma.BankTransactionWhereInput => ({ bankAccount: { companyId: c } })),
  child('BankMatch', (c): Prisma.BankMatchWhereInput => ({ bankTransaction: { bankAccount: { companyId: c } } })),
  child('BudgetLine', (c): Prisma.BudgetLineWhereInput => ({ budget: { companyId: c } })),
  child('InventoryAdjustmentLine', (c): Prisma.InventoryAdjustmentLineWhereInput => ({ adjustment: { companyId: c } })),
  child('PayrollLine', (c): Prisma.PayrollLineWhereInput => ({ run: { companyId: c } })),
  child('PayrollItem', (c): Prisma.PayrollItemWhereInput => ({ line: { run: { companyId: c } } })),

  // Auditoría (D47): el dueño recibe el encargo, los hallazgos comunicados y sus archivos; nunca los papeles de la auditora
  { model: 'AuditEngagement', cls: 'ROW_FILTERED', where: byCompany, reason: 'Encargo completo: lo crea y lo ve el ADMIN' },
  { model: 'AuditFinding', cls: 'ROW_FILTERED', where: (c) => ({ companyId: c, status: { not: 'DRAFT' } }), reason: 'Solo hallazgos comunicados en adelante (los borradores son de la auditora, D3)' },
  {
    model: 'AuditFile', cls: 'ROW_FILTERED', where: (c) => ({ companyId: c, finding: { status: { not: 'DRAFT' } } }), reason: 'Solo archivos de hallazgos comunicados',
    files: [{ column: 'fileUrl', folder: 'adjuntos', nameColumn: 'fileName', pattern: (c) => new RegExp(`^${esc(c)}/auditing/${UUID}$`) }],
  },
  { model: 'AuditWorkpaper', cls: 'EXCLUDED_ROLE', reason: 'Papeles de trabajo de la auditora: el ADMIN no los ve (PLAN-v0.2 §13.1, D3, D47)' },
  { model: 'AuditProcedure', cls: 'EXCLUDED_ROLE', reason: 'Procedimientos de la auditora: el ADMIN no los ve (D3, D47)' },
  { model: 'AuditCheckmark', cls: 'EXCLUDED_ROLE', reason: 'Marcas de revisión de la auditora: el ADMIN no las ve (D3, D47)' },

  // Tablas globales y públicas (valores de la DGII con su fuente): salen enteras
  { model: 'FiscalParameter', cls: 'GLOBAL_PUBLIC', jsonColumns: ['valueJson'] },
  { model: 'FiscalParameterValidation', cls: 'GLOBAL_PUBLIC' },
  { model: 'FiscalParameterLoad', cls: 'GLOBAL_PUBLIC', jsonColumns: ['summary'] },
  { model: 'FiscalObligation', cls: 'GLOBAL_PUBLIC', jsonColumns: ['appliesWhen'] },
  { model: 'Holiday', cls: 'GLOBAL_PUBLIC' },

  { model: 'UserTwoFactor', cls: 'SECRET', reason: 'Secreto de la verificación en dos pasos (cifrado) y sus contadores' },
  { model: 'UserRecoveryCode', cls: 'SECRET', reason: 'Huellas de los códigos de emergencia' },
];

/** Columnas que parecen secretas o de archivo, pero no lo son (con motivo). */
export const ALLOWED_LOOKALIKES: Record<string, string> = {
  'User.passwordChangedAt': 'Fecha del último cambio de clave; no es un secreto',
  'Attachment.fileName': 'Solo el nombre original del archivo',
  'EcfImport.fileName': 'Solo el nombre original del archivo',
  'EcfImport.sha256': 'Huella del XML importado (pública, sirve para comprobarlo)',
  'FiscalParameterLoad.sha256': 'Huella del archivo de la carga (pública)',
  'AuditFile.fileName': 'Solo el nombre original del archivo',
};

export const FILE_NAME_PATTERN = /fileurl|filekey|storagekey|xmlfile|archivo|adjunto|ruta/i;
