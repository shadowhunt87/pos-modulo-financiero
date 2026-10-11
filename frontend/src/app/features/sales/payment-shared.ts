import Decimal from 'decimal.js';
import { Api } from '../../core/api';
import { dec, isoDate } from '../../shared/format';

/** Factura abierta (con saldo) de un tercero, tal como la devuelve GET /invoices. */
export interface OpenInvoice {
  id: string; number: string; ncf: string | null; type: string; status: string; currency: string;
  issueDate: string; dueDate: string | null; total: string; balance: string;
}

/** Facturas con saldo del tercero que corresponden a un cobro (ventas) o a un pago (compras), en la moneda dada. */
export async function loadOpenInvoices(api: Api, partnerId: string, direction: 'RECEIVED' | 'MADE', currency: string): Promise<OpenInvoice[]> {
  const type = direction === 'RECEIVED' ? 'SALE' : 'PURCHASE';
  const lists = await Promise.all(
    ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].map((status) => api.getAll<OpenInvoice>('/invoices', { partnerId, type, status })),
  );
  return lists.flat()
    .filter((i) => (!currency || i.currency === currency) && dec(i.balance).gt(0))
    .sort((a, b) => (isoDate(a.dueDate ?? a.issueDate)).localeCompare(isoDate(b.dueDate ?? b.issueDate)));
}

/** Reparte `amount` entre las facturas, de la más antigua a la más reciente, sin pasar del saldo de cada una. */
export function autoDistribute(rows: OpenInvoice[], amount: Decimal.Value): Record<string, string> {
  let left = dec(String(amount));
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (left.lte(0)) break;
    const take = Decimal.min(left, dec(r.balance));
    if (take.gt(0)) { out[r.id] = take.toFixed(2); left = left.minus(take); }
  }
  return out;
}

/** Convierte lo digitado en el formato del DTO (solo montos > 0). */
export function toAllocations(values: Record<string, string>): { invoiceId: string; amount: number }[] {
  return Object.entries(values)
    .filter(([, v]) => dec(v).gt(0))
    .map(([invoiceId, v]) => ({ invoiceId, amount: Number(dec(v).toFixed(4)) }));
}
