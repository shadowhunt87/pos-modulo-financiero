import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction, InvoiceStatus, InvoiceType, JournalEntryStatus } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { startOfDay, endOfDay } from '../reports/accounting-nature.utils.js';
import { AccountingSettingsService, type SettingsKey } from '../masters/accounting-settings/accounting-settings.service.js';
import { AgingQuery, ApplyCreditDto, StatementQuery } from './dto/receivables.dto.js';
import { OPEN_STATUSES, applyToInvoice } from './invoice-balance.js';

type Dec = Prisma.Decimal;
const D = (v?: Dec | number | string | null): Dec => new Prisma.Decimal(v ?? 0);
const ZERO = D(0);
const r2 = (d: Dec): Dec => d.toDecimalPlaces(2, 4);
const DAY = 86_400_000;

@Injectable()
export class ReceivablesPayablesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AccountingSettingsService,
  ) {}

  /** ¿La factura/nota pertenece a cuentas por cobrar (true) o por pagar (false)? */
  private isReceivable(inv: { type: InvoiceType; relatedInvoice?: { type: InvoiceType } | null }) {
    if (inv.type === InvoiceType.SALE) return true;
    if (inv.type === InvoiceType.PURCHASE) return false;
    return inv.relatedInvoice?.type === InvoiceType.SALE;
  }

  // ------------------------------------------------------------------
  // Estado de cuenta (mayor auxiliar de un cliente o proveedor)
  // ------------------------------------------------------------------
  async statement(partnerId: string, q: StatementQuery, user: AuthUser) {
    const partner = await this.prisma.partner.findFirst({
      where: { id: partnerId, companyId: user.companyId },
      select: { id: true, name: true, taxId: true },
    });
    if (!partner) throw new NotFoundException('Tercero no encontrado');

    const receivable = q.scope === 'RECEIVABLE';
    const keys: SettingsKey[] = receivable ? ['receivableAccountId', 'customerAdvanceAccountId'] : ['payableAccountId', 'supplierAdvanceAccountId'];
    const row = await this.prisma.accountingSettings.findUnique({ where: { companyId: user.companyId } });
    const accountIds = keys.map((k) => row?.[k]).filter((x): x is string => !!x);
    if (!accountIds.length) throw new UnprocessableEntityException('Configura las cuentas de CxC/CxP en Configuración contable');

    const base: Prisma.JournalEntryLineWhereInput = {
      accountId: { in: accountIds }, partnerId,
      journalEntry: { companyId: user.companyId, status: JournalEntryStatus.POSTED },
    };
    // CxC: débito aumenta lo que nos deben. CxP: crédito aumenta lo que debemos.
    const signed = (debit: Dec, credit: Dec) => (receivable ? debit.minus(credit) : credit.minus(debit));

    let opening = ZERO;
    if (q.from) {
      const o = await this.prisma.journalEntryLine.aggregate({
        where: { ...base, journalEntry: { ...(base.journalEntry as object), date: { lt: startOfDay(q.from) } } },
        _sum: { debit: true, credit: true },
      });
      opening = signed(D(o._sum.debit), D(o._sum.credit));
    }

    const lines = await this.prisma.journalEntryLine.findMany({
      where: {
        ...base,
        journalEntry: {
          ...(base.journalEntry as object),
          ...(q.from || q.to ? { date: { ...(q.from && { gte: startOfDay(q.from) }), ...(q.to && { lte: endOfDay(q.to) }) } } : {}),
        },
      },
      include: { journalEntry: { select: { id: true, number: true, date: true, description: true, reference: true, sourceType: true, sourceId: true } } },
      orderBy: [{ journalEntry: { date: 'asc' } }, { journalEntry: { createdAt: 'asc' } }],
    });

    let running = opening;
    const movements = lines.map((l) => {
      const amount = signed(l.debit, l.credit);
      running = running.plus(amount);
      return {
        date: l.journalEntry.date, entryId: l.journalEntry.id, entryNumber: l.journalEntry.number,
        description: l.description ?? l.journalEntry.description, reference: l.journalEntry.reference,
        sourceType: l.journalEntry.sourceType, sourceId: l.journalEntry.sourceId,
        debit: l.debit, credit: l.credit, balance: running,
      };
    });
    // Saldo positivo = el tercero nos debe (CxC) / le debemos (CxP). Negativo = anticipo a favor.
    return { partner, scope: q.scope, openingBalance: opening, movements, closingBalance: running };
  }

  // ------------------------------------------------------------------
  // Antigüedad de saldos (en moneda base)
  // ------------------------------------------------------------------
  async aging(q: AgingQuery, user: AuthUser) {
    const asOf = q.asOf ? startOfDay(q.asOf) : startOfDay(new Date().toISOString());
    const receivable = q.scope === 'RECEIVABLE';
    const open = await this.prisma.invoice.findMany({
      where: { companyId: user.companyId, status: { in: OPEN_STATUSES }, issueDate: { lte: endOfDay(asOf.toISOString()) } },
      include: {
        partner: { select: { id: true, name: true, taxId: true } },
        relatedInvoice: { select: { type: true } },
      },
    });

    const empty = () => ({ current: ZERO, d1_30: ZERO, d31_60: ZERO, d61_90: ZERO, over90: ZERO, total: ZERO });
    type Bucket = ReturnType<typeof empty>;
    const add = (b: Bucket, key: keyof Bucket, v: Dec) => { b[key] = b[key].plus(v); b.total = b.total.plus(v); };
    const byPartner = new Map<string, { partnerId: string; name: string; taxId: string | null } & Bucket>();
    const totals = empty();

    for (const inv of open) {
      if (this.isReceivable(inv) !== receivable) continue;
      // Notas de crédito sin aplicar restan
      const sign = inv.type === InvoiceType.CREDIT_NOTE ? -1 : 1;
      const amount = r2(inv.balance.times(inv.exchangeRate)).times(sign);
      const due = inv.dueDate ?? inv.issueDate;
      const days = Math.floor((asOf.getTime() - due.getTime()) / DAY);
      const key: keyof Bucket = days <= 0 ? 'current' : days <= 30 ? 'd1_30' : days <= 60 ? 'd31_60' : days <= 90 ? 'd61_90' : 'over90';

      let row = byPartner.get(inv.partnerId);
      if (!row) { row = { partnerId: inv.partnerId, name: inv.partner.name, taxId: inv.partner.taxId, ...empty() }; byPartner.set(inv.partnerId, row); }
      add(row, key, amount);
      add(totals, key, amount);
    }
    const partners = [...byPartner.values()].sort((a, b) => b.total.comparedTo(a.total));
    return { scope: q.scope, asOf, partners, totals };
  }

  // ------------------------------------------------------------------
  // Marca como vencidas las facturas pendientes con fecha pasada
  // ------------------------------------------------------------------
  async markOverdue(user: AuthUser) {
    const today = startOfDay(new Date().toISOString());
    const res = await this.prisma.invoice.updateMany({
      where: {
        companyId: user.companyId, status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID] },
        type: { not: InvoiceType.CREDIT_NOTE }, dueDate: { lt: today },
      },
      data: { status: InvoiceStatus.OVERDUE },
    });
    return { updated: res.count };
  }

  // ------------------------------------------------------------------
  // Aplicar una nota de crédito contra una factura (solo auxiliar:
  // el asiento ya se hizo al emitir la nota, el mayor general no cambia)
  // ------------------------------------------------------------------
  async applyCredit(dto: ApplyCreditDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const { companyId } = user;
      const [note, inv] = await Promise.all([
        tx.invoice.findFirst({ where: { id: dto.creditNoteId, companyId }, include: { relatedInvoice: { select: { type: true } } } }),
        tx.invoice.findFirst({ where: { id: dto.invoiceId, companyId }, include: { relatedInvoice: { select: { type: true } } } }),
      ]);
      if (!note || !inv) throw new NotFoundException('Nota de crédito o factura no encontrada');
      if (note.type !== InvoiceType.CREDIT_NOTE) throw new UnprocessableEntityException('creditNoteId no es una nota de crédito');
      if (inv.type === InvoiceType.CREDIT_NOTE) throw new UnprocessableEntityException('No se aplica una nota de crédito contra otra');
      if (note.partnerId !== inv.partnerId) throw new UnprocessableEntityException('La nota y la factura son de terceros distintos');
      if (this.isReceivable(note) !== this.isReceivable(inv)) throw new UnprocessableEntityException('La nota y la factura son de lados distintos (CxC/CxP)');
      if (note.currency !== inv.currency) throw new UnprocessableEntityException('La nota y la factura están en monedas distintas');
      for (const d of [note, inv]) {
        if (!OPEN_STATUSES.includes(d.status)) throw new UnprocessableEntityException(`${d.number} no está pendiente (${d.status})`);
      }
      const amount = D(dto.amount);
      if (amount.gt(note.balance)) throw new UnprocessableEntityException(`La nota solo tiene ${note.balance} disponible`);
      if (amount.gt(inv.balance)) throw new UnprocessableEntityException(`La factura solo tiene saldo ${inv.balance}`);

      await applyToInvoice(tx, note.id, amount);
      await applyToInvoice(tx, inv.id, amount);
      await writeAudit(tx, user, 'Invoice', inv.id, AuditAction.UPDATE, {
        creditApplied: amount.toString(), creditNote: note.number, creditNoteId: note.id,
      });
      return tx.invoice.findUniqueOrThrow({ where: { id: inv.id }, select: { id: true, number: true, status: true, balance: true, amountPaid: true } });
    });
  }
}