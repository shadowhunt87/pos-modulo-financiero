import { HttpErrorResponse } from '@angular/common/http';
import { BankAccount, CashRegister } from '../../core/models';
import { errorMessage } from '../../core/errors';

/** Tipos de tesorería tal como los devuelve el backend (los Decimal llegan como string). */
export interface BankAccountRow extends BankAccount { lastSyncedAt?: string | null }
export interface BankAccountDetailData extends BankAccountRow {
  pendingTransactions: number;
  lastReconciliation: { id: string; statementDate: string; statementBalance: string } | null;
}
export interface CashRegisterRow extends CashRegister { glBalance?: string | null }
export interface BankRule {
  id: string; name: string; matchText: string; accountId: string; bankAccountId: string | null; priority: number; active: boolean;
  account?: { code: string; name: string };
}
export interface BankTx {
  id: string; bankAccountId: string; date: string; description: string; reference: string | null; amount: string; balanceAfter: string | null;
  currency: string; source: string; status: string; matches: { journalEntryLineId: string; amount: string }[];
}
export interface UserLite { id: string; name: string; email: string; role: string; active: boolean }
export interface TransferEntry {
  id: string; number: string | null; date: string; description: string; reference: string | null; status: string;
  lines: { accountId: string; debit: string; credit: string; description: string | null }[];
}

export interface ReconItem {
  journalEntryLineId: string; entryId: string; entryNumber: string; date: string; description: string | null; reference: string | null; amount: string;
}
export interface ReconSummary {
  statementDate: string; statementBalance: string; bookBalance: string; depositsInTransit: ReconItem[]; outstandingPayments: ReconItem[];
  outstandingNet: string; unmatchedTransactions: BankTx[]; unmatchedSum: string; expectedStatementBalance: string; difference: string;
  canComplete: boolean; blockers: string[];
}
export interface Reconciliation {
  id: string; bankAccountId: string; statementDate: string; statementBalance: string; bookBalance: string | null; difference: string | null;
  status: string; completedAt: string | null; notes: string | null;
  bankAccount: { id?: string; bankName: string; accountNumber: string; glAccountId?: string | null };
}
export interface ReconciliationFull extends Reconciliation { summary: ReconSummary }
export interface Suggestion {
  transaction: { id: string; date: string; description: string; reference: string | null; amount: string };
  candidates: (ReconItem & { score: number })[];
}

/** Opción de selector que combina banco o caja: el valor es "BANK:<id>" o "CASH:<id>". */
export function splitRef(v: string): { type: 'BANK' | 'CASH'; id: string } {
  const [type, id] = v.split(':');
  return { type: type === 'CASH' ? 'CASH' : 'BANK', id: id ?? '' };
}

/** Mensaje del error y, si el backend mandó una lista de filas inválidas, esa lista. */
export function errorLines(e: unknown): { message: string; lines: string[] } {
  if (e instanceof HttpErrorResponse) {
    const body = e.error as { errors?: unknown; blockers?: unknown; totalErrors?: number } | null;
    const raw = body?.errors ?? body?.blockers;
    const lines = Array.isArray(raw) ? raw.map(String) : [];
    if (body?.totalErrors && body.totalErrors > lines.length) lines.push(`… y ${body.totalErrors - lines.length} más.`);
    return { message: errorMessage(e), lines };
  }
  return { message: errorMessage(e), lines: [] };
}
