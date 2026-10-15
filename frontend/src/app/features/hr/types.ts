/** P3: tipos y etiquetas de RRHH y nómina (respuestas de /hr). */
export interface Department { id: string; name: string; active: boolean; _count?: { employees: number } }
export interface Employee {
  id: string; code: string; firstName: string; lastName: string; documentType: 'CEDULA' | 'PASSPORT'; documentNumber: string; nss: string | null;
  sex: 'M' | 'F' | null; birthDate: string | null; email: string | null; phone: string | null; address: string | null;
  departmentId: string | null; position: string | null; hireDate: string; terminationDate: string | null; terminationReason: string | null;
  status: 'ACTIVE' | 'SUSPENDED' | 'TERMINATED'; payFrequency: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY'; baseSalary: string;
  paymentMethod: 'TRANSFER' | 'CHECK' | 'CASH'; bankName: string | null; bankAccountNumber: string | null; costCenterId: string | null;
  department?: { id: string; name: string } | null;
}
export interface PayrollConcept {
  id: string; code: string; name: string; kind: 'EARNING' | 'DEDUCTION'; affectsTss: boolean; affectsIsr: boolean; accountId: string | null; active: boolean;
  account?: { id: string; code: string; name: string } | null;
}
export interface PayrollItem { id: string; conceptId: string; amount: string; description: string | null; concept: { id: string; code: string; name: string; kind: 'EARNING' | 'DEDUCTION' } }
export interface PayrollLine {
  id: string; employeeId: string; baseSalary: string; periodDays: number; daysWorked: number; salary: string; otherEarnings: string; grossTotal: string;
  tssBase: string; afpEmployee: string; sfsEmployee: string; isrBase: string; isr: string; otherDeductions: string; netPay: string;
  afpEmployer: string; sfsEmployer: string; srlEmployer: string; infotepEmployer: string;
  employee: { id: string; code: string; firstName: string; lastName: string; documentNumber: string; position: string | null; paymentMethod: string };
  items: PayrollItem[];
}
export interface PayrollRun {
  id: string; number: string; type: 'REGULAR' | 'CHRISTMAS_BONUS'; frequency: 'MONTHLY' | 'BIWEEKLY' | 'WEEKLY';
  periodStart: string; periodEnd: string; payDate: string; status: 'DRAFT' | 'POSTED' | 'PAID' | 'VOIDED'; notes: string | null;
  grossTotal: string; employeeTssTotal: string; isrTotal: string; otherDeductionsTotal: string; netTotal: string; employerTotal: string;
  parameters: { key: string; value?: string; status?: string; source?: string }[] | null;
  voidReason: string | null;
  journalEntry?: { id: string; number: string | null; status: string } | null;
  paymentEntry?: { id: string; number: string | null; status: string } | null;
  bankAccount?: { id: string; bankName: string; accountNumber: string } | null;
  lines?: PayrollLine[];
  _count?: { lines: number };
}

export const EMPLOYEE_STATUS: Record<string, string> = { ACTIVE: 'Activo', SUSPENDED: 'Suspendido', TERMINATED: 'Salió de la empresa' };
export const PAY_FREQUENCY: Record<string, string> = { MONTHLY: 'Mensual', BIWEEKLY: 'Quincenal', WEEKLY: 'Semanal' };
export const PAYMENT_METHOD_HR: Record<string, string> = { TRANSFER: 'Transferencia', CHECK: 'Cheque', CASH: 'Efectivo' };
export const DOC_TYPE: Record<string, string> = { CEDULA: 'Cédula', PASSPORT: 'Pasaporte' };
export const CONCEPT_KIND: Record<string, string> = { EARNING: 'Ingreso', DEDUCTION: 'Descuento' };
export const RUN_TYPE: Record<string, string> = { REGULAR: 'Nómina', CHRISTMAS_BONUS: 'Regalía pascual' };
export const RUN_STATUS: Record<string, string> = { DRAFT: 'Borrador', POSTED: 'Contabilizada', PAID: 'Pagada', VOIDED: 'Anulada' };

export const fullName = (e: { firstName: string; lastName: string }) => `${e.firstName} ${e.lastName}`;
/** Cédula con guiones: 001-1234567-8. */
export const fmtDoc = (type: string, n: string) => (type === 'CEDULA' && /^\d{11}$/.test(n) ? `${n.slice(0, 3)}-${n.slice(3, 10)}-${n.slice(10)}` : n);
