import { ConflictException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { InvoiceStatus } from '../generated/prisma/enums.js';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;

export const OPEN_STATUSES: InvoiceStatus[] = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE];

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

/** Estado que corresponde a una factura según su saldo y vencimiento. */
export function statusFor(balance: Dec, amountPaid: Dec, dueDate: Date | null, now = new Date()): InvoiceStatus {
  if (balance.lte(0)) return InvoiceStatus.PAID;
  if (dueDate && dueDate < startOfUtcDay(now)) return InvoiceStatus.OVERDUE;
  return amountPaid.gt(0) ? InvoiceStatus.PARTIALLY_PAID : InvoiceStatus.ISSUED;
}

/**
 * Descuenta `amount` del saldo. El UPDATE condicional es atómico: si dos
 * cobros simultáneos intentan consumir el mismo saldo, solo pasa el que cabe.
 */
export async function applyToInvoice(tx: Tx, invoiceId: string, amount: Dec) {
  const res = await tx.invoice.updateMany({
    where: { id: invoiceId, status: { in: OPEN_STATUSES }, balance: { gte: amount } },
    data: { balance: { decrement: amount }, amountPaid: { increment: amount } },
  });
  if (res.count === 0) throw new ConflictException('El saldo de la factura cambió; reintenta');
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  await tx.invoice.update({ where: { id: invoiceId }, data: { status: statusFor(inv.balance, inv.amountPaid, inv.dueDate) } });
}

/** Revierte una aplicación (anulación de pago). */
export async function releaseFromInvoice(tx: Tx, invoiceId: string, amount: Dec) {
  const res = await tx.invoice.updateMany({
    where: { id: invoiceId, status: { not: InvoiceStatus.VOIDED } },
    data: { balance: { increment: amount }, amountPaid: { decrement: amount } },
  });
  if (res.count === 0) return;
  const inv = await tx.invoice.findUniqueOrThrow({ where: { id: invoiceId } });
  await tx.invoice.update({ where: { id: invoiceId }, data: { status: statusFor(inv.balance, inv.amountPaid, inv.dueDate) } });
}