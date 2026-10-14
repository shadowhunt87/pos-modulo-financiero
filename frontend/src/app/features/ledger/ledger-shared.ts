import { HttpErrorResponse } from '@angular/common/http';
import type { Decimal } from 'decimal.js';
import { Observable } from 'rxjs';
import { dec, sumDec } from '../../shared/format';

/** Tipos del área contable (los Decimal llegan como string). */
export interface EntryLine {
  id: string; accountId: string; debit: string; credit: string; description: string | null;
  partnerId: string | null; costCenterId: string | null; account?: { code: string; name: string };
}
export interface Entry {
  id: string; number: string | null; journalId: string | null; fiscalPeriodId: string | null; type: string; date: string;
  description: string; reference: string | null; sourceType: string; sourceId: string | null; currency: string; status: string;
  reconciled: boolean; createdById: string; postedAt: string | null; approvedById: string | null; approvedAt: string | null;
  rejectReason: string | null; rejectedAt: string | null; voidedById: string | null; voidedAt: string | null; voidReason: string | null;
  reversalOfId: string | null; reversedBy?: { id: string; number: string | null } | null; lines: EntryLine[];
}
export interface FiscalYear {
  id: string; name: string; startDate: string; endDate: string; status: string; closingEntryId: string | null;
  closedAt: string | null; _count?: { periods: number };
}
export interface FiscalPeriod {
  id: string; fiscalYearId: string | null; name: string; startDate: string; endDate: string; status: string; closedAt: string | null;
}

/** Una cuenta en la vista previa de cierre. */
export interface ClosingAccount { accountId: string; code: string; name: string; balance: string }
export interface ClosingPreview {
  year: { id: string; name: string; status: string; startDate: string; endDate: string };
  canClose: boolean; issues: string[];
  retainedEarningsAccount: { id: string; code: string; name: string } | null;
  income: ClosingAccount[]; expenses: ClosingAccount[];
  totalIncome: string; totalExpenses: string; netResult: string;
  entryLines: { accountId: string; code: string; name: string; debit: string; credit: string }[];
}

export interface Balance { debit: Decimal; credit: Decimal; diff: Decimal; balanced: boolean }

/** Débitos, créditos y diferencia con decimal.js (nunca Number para sumar dinero). */
export function balanceOf(lines: { debit: string | number | null | undefined; credit: string | number | null | undefined }[]): Balance {
  const debit = sumDec(lines.map((l) => l.debit));
  const credit = sumDec(lines.map((l) => l.credit));
  const diff = debit.minus(credit);
  return { debit, credit, diff, balanced: diff.isZero() && debit.gt(0) };
}

/** ¿El monto tiene más de 4 decimales? (el backend no los acepta). */
export function tooManyDecimals(v: string | number | null | undefined): boolean {
  return dec(v).decimalPlaces() > 4;
}

/** Convierte un Observable de escritura en promesa (para usar con await). */
export function send<T = unknown>(obs: Observable<T>): Promise<T> {
  return new Promise<T>((ok, bad) => obs.subscribe({ next: (v) => ok(v), error: bad }));
}

/** Lista de problemas que el backend manda en `issues` al rechazar un cierre (422). */
export function issuesOf(err: unknown): string[] {
  if (err instanceof HttpErrorResponse) {
    const issues = (err.error as { issues?: unknown } | null)?.issues;
    if (Array.isArray(issues)) return issues.filter((i): i is string => typeof i === 'string');
  }
  return [];
}
