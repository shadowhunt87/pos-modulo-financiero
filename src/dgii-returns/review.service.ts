import { Injectable } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { InvoiceStatus, InvoiceType, JournalEntryStatus } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DgiiService } from '../dgii/dgii.service.js';

const D = (v: string | number | Prisma.Decimal) => new Prisma.Decimal(v);
const ZERO = D(0);
const r2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const money = (d: Prisma.Decimal) => r2(d).toFixed(2);

export interface ReviewCheck {
  key: string; title: string; ok: boolean; detail: string; route: string;
  expected?: string; ledger?: string; difference?: string;
  entries?: { id: string; number: string | null; date: string; description: string; amount: string }[];
  items?: string[];
}

/**
 * Revisión del mes antes de declarar (PLAN-v0.3 §9.3, N4): errores y avisos del 606/607/608 y cuadres netos contra el
 * mayor, con los asientos que explican cada diferencia. Solo lee. Tolerancia 0 (R7).
 */
@Injectable()
export class DgiiReviewService {
  constructor(private readonly prisma: PrismaService, private readonly dgii: DgiiService) {}

  private range(period: string) {
    const [y, m] = period.split('-').map(Number);
    return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1) - 1) };
  }

  /** ITBIS neto (en moneda base) de las facturas y notas de un lado, en el mes. */
  private async itbisOf(side: 'SALE' | 'PURCHASE', companyId: string, start: Date, end: Date) {
    const invs = await this.prisma.invoice.findMany({
      where: {
        companyId, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOIDED] }, issueDate: { gte: start, lte: end },
        OR: [{ type: side }, { type: { in: [InvoiceType.CREDIT_NOTE, InvoiceType.DEBIT_NOTE] }, relatedInvoice: { type: side } }],
      },
      select: { type: true, taxTotal: true, exchangeRate: true, withholdings: { select: { amount: true, taxRateId: true } } },
    });
    let itbis = ZERO;
    const withheld = new Map<string, Prisma.Decimal>();
    for (const i of invs) {
      const sign = i.type === InvoiceType.CREDIT_NOTE ? -1 : 1;
      itbis = itbis.plus(r2(i.taxTotal.times(i.exchangeRate)).times(sign));
      for (const w of i.withholdings) withheld.set(w.taxRateId, (withheld.get(w.taxRateId) ?? ZERO).plus(r2(w.amount.times(i.exchangeRate)).times(sign)));
    }
    return { itbis: r2(itbis), withheld };
  }

  /** Saldo neto del mes en el mayor (crédito − débito) de unas cuentas, y los asientos manuales que las tocaron. */
  private async ledger(companyId: string, accountIds: string[], start: Date, end: Date) {
    if (!accountIds.length) return { net: ZERO, manual: [] as ReviewCheck['entries'] };
    const lines = await this.prisma.journalEntryLine.findMany({
      where: { accountId: { in: accountIds }, journalEntry: { companyId, status: JournalEntryStatus.POSTED, date: { gte: start, lte: end } } },
      select: { debit: true, credit: true, journalEntry: { select: { id: true, number: true, date: true, description: true, sourceType: true } } },
    });
    let net = ZERO;
    const manual = new Map<string, { id: string; number: string | null; date: string; description: string; amount: Prisma.Decimal }>();
    for (const l of lines) {
      const delta = l.credit.minus(l.debit);
      net = net.plus(delta);
      const e = l.journalEntry;
      if (e.sourceType !== 'INVOICE' && e.sourceType !== 'PAYMENT') {
        const cur = manual.get(e.id) ?? { id: e.id, number: e.number, date: e.date.toISOString().slice(0, 10), description: e.description, amount: ZERO };
        cur.amount = cur.amount.plus(delta);
        manual.set(e.id, cur);
      }
    }
    return { net: r2(net), manual: [...manual.values()].map((m) => ({ ...m, amount: money(m.amount) })) };
  }

  private compare(key: string, title: string, expected: Prisma.Decimal, ledgerNet: Prisma.Decimal, manual: ReviewCheck['entries'], route: string, what: string): ReviewCheck {
    const diff = r2(ledgerNet.minus(expected));
    return {
      key, title, ok: diff.isZero(), route, expected: money(expected), ledger: money(ledgerNet), difference: money(diff),
      detail: diff.isZero() ? `${what} cuadra con la contabilidad.` : `Diferencia de RD$${money(diff.abs())}: ${manual?.length ? 'revisa los asientos manuales de la lista' : 'busca facturas registradas con otra cuenta o fecha'}.`,
      entries: diff.isZero() ? [] : manual,
    };
  }

  async review(period: string, user: AuthUser) {
    const { companyId } = user;
    const { start, end } = this.range(period);
    const [r606, r607, r608, taxes, unverified] = await Promise.all([
      this.dgii.report606(period, user), this.dgii.report607(period, user), this.dgii.report608(period, user),
      this.prisma.taxRate.findMany({ where: { companyId }, select: { id: true, type: true, isWithholding: true, salesAccountId: true, purchaseAccountId: true } }),
      this.prisma.ecfDocument.findMany({ where: { companyId, verification: 'UNVERIFIED', invoice: { issueDate: { gte: start, lte: end } } }, select: { eNcf: true, invoice: { select: { total: true } } } }),
    ]);
    const itbisTaxes = taxes.filter((t) => t.type === 'ITBIS' && !t.isWithholding);
    const salesAcc = [...new Set(itbisTaxes.map((t) => t.salesAccountId).filter((x): x is string => !!x))];
    const purchAcc = [...new Set(itbisTaxes.map((t) => t.purchaseAccountId).filter((x): x is string => !!x))];
    const shared = salesAcc.filter((a) => purchAcc.includes(a));
    const [sales, purchases] = await Promise.all([this.itbisOf('SALE', companyId, start, end), this.itbisOf('PURCHASE', companyId, start, end)]);

    const checks: ReviewCheck[] = [];
    const warnings: string[] = [];
    if (shared.length) {
      warnings.push('Usas la misma cuenta de ITBIS para ventas y compras: el cuadre se hace sobre el neto conjunto. Usa cuentas separadas para un cuadre exacto.');
      const l = await this.ledger(companyId, [...new Set([...salesAcc, ...purchAcc])], start, end);
      checks.push(this.compare('itbisNet', 'ITBIS neto (607 − 606) contra el mayor', sales.itbis.minus(purchases.itbis), l.net, l.manual, '/reports', 'El ITBIS neto'));
    } else {
      const ls = await this.ledger(companyId, salesAcc, start, end);
      checks.push(this.compare('607', '607: ITBIS facturado contra el mayor', sales.itbis, ls.net, ls.manual, '/dgii', 'El ITBIS del 607'));
      const lp = await this.ledger(companyId, purchAcc, start, end);
      // En compras el saldo natural es deudor: se compara débito − crédito
      checks.push(this.compare('606', '606: ITBIS por adelantar contra el mayor', purchases.itbis, lp.net.neg(), lp.manual?.map((m) => ({ ...m, amount: money(D(m.amount).neg()) })), '/dgii', 'El ITBIS del 606'));
    }

    // Retenciones hechas a proveedores (606) contra las cuentas de retenciones por pagar
    const whTaxes = taxes.filter((t) => t.isWithholding && t.purchaseAccountId);
    const whExpected = whTaxes.reduce((s, t) => s.plus(purchases.withheld.get(t.id) ?? ZERO), ZERO);
    const lw = await this.ledger(companyId, [...new Set(whTaxes.map((t) => t.purchaseAccountId!))], start, end);
    checks.push(this.compare('withholdings', 'Retenciones a proveedores contra las cuentas por pagar', r2(whExpected), lw.net, lw.manual, '/dgii', 'Lo retenido'));

    // Huecos en la secuencia de NCF propios (R8)
    checks.push(await this.ncfGaps(companyId));

    // e-CF importados sin verificar (PLAN-v0.3 §7.4)
    const unvTotal = unverified.reduce((s, u) => s.plus(u.invoice.total), ZERO);
    checks.push({
      key: 'ecfUnverified', title: 'e-CF importados sin verificar', ok: unverified.length === 0, route: '/invoices',
      detail: unverified.length ? `${unverified.length} comprobante(s) por RD$${money(unvTotal)}: compruébalos en el portal de la DGII antes de declarar.` : 'No hay e-CF importados sin verificar.',
      items: unverified.slice(0, 50).map((u) => u.eNcf),
    });

    const fmt = (r: { count: number; errors: unknown[]; warnings: unknown[]; canExport: boolean }) => ({ count: r.count, errors: r.errors.length, warnings: r.warnings.length, canExport: r.canExport });
    return {
      period, warnings,
      formats: { '606': fmt(r606), '607': { ...fmt(r607), notRequired: (r607 as { notRequired?: boolean }).notRequired ?? false }, '608': fmt(r608) },
      checks, ready: checks.every((c) => c.ok) && r606.canExport && r607.canExport && r608.canExport,
      assumptions: ['Tolerancia 0: cualquier diferencia, aunque sea de centavos, se muestra (R7). Los redondeos se registran en la cuenta de redondeo.', 'La comparación 607 ↔ IT-1 está en la hoja del IT-1.'],
    };
  }

  /** Números de NCF propios que faltan entre el inicio del rango y el último usado de cada secuencia. */
  private async ncfGaps(companyId: string): Promise<ReviewCheck> {
    const seqs = await this.prisma.ncfSequence.findMany({ where: { companyId }, select: { ncfType: true, rangeStart: true, currentNumber: true } });
    const missing: string[] = [];
    for (const s of seqs) {
      if (s.currentNumber < s.rangeStart) continue;
      const used = await this.prisma.invoice.findMany({ where: { companyId, ncf: { startsWith: s.ncfType } }, select: { ncf: true } });
      const nums = new Set(used.map((u) => Number(u.ncf!.slice(3))));
      const from = Math.max(s.rangeStart, s.currentNumber - 5000);
      for (let n = from; n <= s.currentNumber && missing.length < 50; n++) {
        if (!nums.has(n)) missing.push(`${s.ncfType}${String(n).padStart(s.ncfType.startsWith('E') ? 10 : 8, '0')}`);
      }
    }
    return {
      key: 'ncfGaps', title: 'Secuencia de comprobantes sin huecos', ok: missing.length === 0, route: '/ncf', items: missing,
      detail: missing.length ? `Falta${missing.length > 1 ? 'n' : ''} ${missing.slice(0, 3).join(', ')}${missing.length > 3 ? '…' : ''}. Un número sin factura se reporta como anulado en el 608.` : 'No faltan números.',
    };
  }
}
