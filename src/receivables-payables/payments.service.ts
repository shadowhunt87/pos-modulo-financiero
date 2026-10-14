import {
  BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AuditAction, InvoiceType, JournalType, PartnerType, PaymentDirection, PaymentStatus, SourceDocumentType,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { startOfDay, endOfDay } from '../reports/accounting-nature.utils.js';
import { DocumentSequencesService } from '../masters/sequences/document-sequences.service.js';
import { AccountingSettingsService, type SettingsKey } from '../masters/accounting-settings/accounting-settings.service.js';
import { PostingService, type PostLine } from '../posting/posting.service.js';
import { AllocatePaymentDto, CreatePaymentDto, ListPaymentsQuery, VoidPaymentDto } from './dto/payment.dto.js';
import { OPEN_STATUSES, applyToInvoice, releaseFromInvoice } from './invoice-balance.js';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;
const D = (v?: Dec | number | string | null): Dec => new Prisma.Decimal(v ?? 0);
const ZERO = D(0);
const r2 = (d: Dec): Dec => d.toDecimalPlaces(2, 4);

interface Settle {
  inv: { id: string; number: string; exchangeRate: Dec };
  amount: Dec; // en moneda del pago
}

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: DocumentSequencesService,
    private readonly settings: AccountingSettingsService,
    private readonly posting: PostingService,
  ) {}

  // ------------------------------------------------------------------
  // Validaciones comunes
  // ------------------------------------------------------------------
  private async resolveRate(tx: Tx, companyId: string, base: string, currency: string, date: Date, given?: number) {
    if (currency === base) return D(1);
    if (given) return D(given);
    const found = await tx.exchangeRate.findFirst({
      where: { companyId, fromCurrency: currency, toCurrency: base, date: { lte: date } },
      orderBy: { date: 'desc' },
    });
    if (!found) throw new UnprocessableEntityException(`Falta la tasa de cambio ${currency}→${base}`);
    return found.rate;
  }

  private async validateAllocations(
    tx: Tx, user: AuthUser, direction: PaymentDirection, partnerId: string, currency: string,
    rows: { invoiceId: string; amount: number }[],
  ): Promise<Settle[]> {
    if (rows.length === 0) return [];
    const ids = rows.map((r) => r.invoiceId);
    if (new Set(ids).size !== ids.length) throw new BadRequestException('Una factura aparece más de una vez en allocations');
    const invs = await tx.invoice.findMany({
      where: { companyId: user.companyId, id: { in: ids } },
      include: { relatedInvoice: { select: { type: true } } },
    });
    if (invs.length !== ids.length) throw new NotFoundException('Alguna factura no existe');
    const byId = new Map(invs.map((i) => [i.id, i]));
    const wantSales = direction === PaymentDirection.RECEIVED;

    return rows.map((r) => {
      const inv = byId.get(r.invoiceId)!;
      if (inv.type === InvoiceType.CREDIT_NOTE) throw new UnprocessableEntityException(`${inv.number} es una nota de crédito: usa /receivables-payables/apply-credit`);
      const isSales = inv.type === InvoiceType.SALE || (inv.type === InvoiceType.DEBIT_NOTE && inv.relatedInvoice?.type === InvoiceType.SALE);
      if (isSales !== wantSales) throw new UnprocessableEntityException(`${inv.number} no corresponde a ${wantSales ? 'un cobro' : 'un pago'}`);
      if (inv.partnerId !== partnerId) throw new UnprocessableEntityException(`${inv.number} es de otro tercero`);
      if (!OPEN_STATUSES.includes(inv.status)) throw new UnprocessableEntityException(`${inv.number} no está pendiente (${inv.status})`);
      if (inv.currency !== currency) throw new UnprocessableEntityException(`${inv.number} está en ${inv.currency}; el pago es en ${currency}`);
      const amount = D(r.amount);
      if (amount.gt(inv.balance)) throw new UnprocessableEntityException(`El monto aplicado a ${inv.number} (${amount}) excede su saldo (${inv.balance})`);
      return { inv: { id: inv.id, number: inv.number, exchangeRate: inv.exchangeRate }, amount };
    });
  }

  /**
   * Líneas del asiento. Lado "fondos" (banco/caja o anticipo) contra lado "saldado"
   * (CxC/CxP por factura + anticipo nuevo). Cada factura se baja a la tasa con que
   * se emitió; la diferencia contra la tasa del pago va a ganancia/pérdida cambiaria.
   */
  private async settlementLines(user: AuthUser, p: {
    received: boolean; partnerId: string; foreign: boolean; currency: string; rate: Dec;
    funds: { accountId: string; description: string; amount: Dec; partnerId?: string };
    settles: Settle[]; controlAccountId?: string;
    advance?: { accountId: string; amount: Dec };
  }): Promise<PostLine[]> {
    const lines: PostLine[] = [];
    const fundsDr = p.received;
    const mk = (accountId: string, base: Dec, dr: boolean, extra: Partial<PostLine> = {}): PostLine =>
      ({ accountId, debit: dr ? base : ZERO, credit: dr ? ZERO : base, ...extra });
    const fx = (foreignAmount: Dec, rate: Dec, dr: boolean): Partial<PostLine> =>
      p.foreign ? { currency: p.currency, exchangeRate: rate, amountForeign: dr ? foreignAmount : foreignAmount.neg() } : {};

    let settled = ZERO;
    for (const s of p.settles) {
      const base = r2(s.amount.times(s.inv.exchangeRate));
      settled = settled.plus(base);
      lines.push(mk(p.controlAccountId!, base, !fundsDr, {
        partnerId: p.partnerId, description: `Aplicación a ${s.inv.number}`, ...fx(s.amount, s.inv.exchangeRate, !fundsDr),
      }));
    }
    if (p.advance && p.advance.amount.gt(0)) {
      const base = r2(p.advance.amount.times(p.rate));
      settled = settled.plus(base);
      lines.push(mk(p.advance.accountId, base, !fundsDr, {
        partnerId: p.partnerId, description: 'Anticipo', ...fx(p.advance.amount, p.rate, !fundsDr),
      }));
    }
    const fundsBase = r2(p.funds.amount.times(p.rate));
    lines.push(mk(p.funds.accountId, fundsBase, fundsDr, {
      partnerId: p.funds.partnerId, description: p.funds.description, ...fx(p.funds.amount, p.rate, fundsDr),
    }));

    // diff > 0 = ganancia cambiaria
    const diff = fundsDr ? fundsBase.minus(settled) : settled.minus(fundsBase);
    if (!diff.isZero()) {
      const key = diff.gt(0) ? 'fxGainAccountId' : 'fxLossAccountId';
      const cfg = await this.settings.require(user.companyId, [key] as const);
      lines.push(mk(cfg[key], diff.abs(), !diff.gt(0), { description: 'Diferencia cambiaria' }));
    }
    return lines;
  }

  // ------------------------------------------------------------------
  // Registrar cobro / pago
  // ------------------------------------------------------------------
  async create(dto: CreatePaymentDto, user: AuthUser) {
    // Reintento del otro sistema con la misma referencia: 409 con el id del cobro que ya existe. Se mira
    // ANTES de validar: la factura ya quedó pagada y un 422 haría creer al otro sistema que se rechazó.
    const existing = () => dto.externalRef
      ? this.prisma.payment.findFirst({ where: { companyId: user.companyId, externalRef: dto.externalRef }, select: { id: true, number: true } })
      : Promise.resolve(null);
    const conflict = (p: { id: string; number: string | null }) =>
      new ConflictException({ message: `Ya existe el cobro o pago ${p.number} con esa referencia`, existingId: p.id });
    const before = await existing();
    if (before) throw conflict(before);
    try {
      return await this.createTx(dto, user);
    } catch (e) {
      // Dos pedidos simultáneos: el índice único deja pasar uno
      const after = isUniqueViolation(e) ? await existing() : null;
      if (after) throw conflict(after);
      throw e;
    }
  }

  private async createTx(dto: CreatePaymentDto, user: AuthUser) {
    const id = await this.prisma.$transaction(async (tx) => {
      const { companyId } = user;
      if (!!dto.bankAccountId === !!dto.cashRegisterId) {
        throw new BadRequestException('Indica bankAccountId o cashRegisterId (solo uno)');
      }
      const received = dto.direction === PaymentDirection.RECEIVED;
      const date = new Date(dto.date);

      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const partner = await tx.partner.findFirst({ where: { id: dto.partnerId, companyId } });
      if (!partner) throw new NotFoundException('Tercero no encontrado');
      if (!partner.active) throw new UnprocessableEntityException('El tercero está inactivo');
      if (received ? partner.type === PartnerType.SUPPLIER : partner.type === PartnerType.CUSTOMER) {
        throw new UnprocessableEntityException(received ? 'El tercero no es cliente' : 'El tercero no es proveedor');
      }

      const currency = dto.currency ?? company.baseCurrency;
      const src = dto.bankAccountId
        ? await tx.bankAccount.findFirst({ where: { id: dto.bankAccountId, companyId } })
        : await tx.cashRegister.findFirst({ where: { id: dto.cashRegisterId!, companyId } });
      if (!src) throw new NotFoundException('Cuenta de banco o caja no encontrada');
      if (!src.active) throw new UnprocessableEntityException('La cuenta de banco/caja está inactiva');
      if (!src.glAccountId) throw new UnprocessableEntityException('La cuenta de banco/caja no tiene cuenta contable asociada');
      if (src.currency !== currency) throw new UnprocessableEntityException(`La cuenta es en ${src.currency}; el pago es en ${currency}`);

      const rate = await this.resolveRate(tx, companyId, company.baseCurrency, currency, date, dto.exchangeRate);
      const amount = D(dto.amount);
      const settles = await this.validateAllocations(tx, user, dto.direction, partner.id, currency, dto.allocations ?? []);
      const allocated = settles.reduce((s, x) => s.plus(x.amount), ZERO);
      if (allocated.gt(amount)) throw new UnprocessableEntityException('Lo aplicado a facturas excede el monto del pago');
      const remainder = amount.minus(allocated);

      const keys: SettingsKey[] = [];
      if (settles.length) keys.push(received ? 'receivableAccountId' : 'payableAccountId');
      if (remainder.gt(0)) keys.push(received ? 'customerAdvanceAccountId' : 'supplierAdvanceAccountId');
      const cfg = (await this.settings.require(companyId, keys)) as Partial<Record<SettingsKey, string>>;

      const number = await this.sequences.next(tx, companyId, received ? 'PAYMENT_RECEIVED' : 'PAYMENT_MADE');
      const pay = await tx.payment.create({
        data: {
          companyId, number, partnerId: partner.id, direction: dto.direction, amount, currency, exchangeRate: rate,
          date, method: dto.method, reference: dto.reference, notes: dto.notes, status: PaymentStatus.POSTED, externalRef: dto.externalRef,
          bankAccountId: dto.bankAccountId, cashRegisterId: dto.cashRegisterId, createdById: user.id,
        },
      });

      if (settles.length) {
        await tx.paymentAllocation.createMany({ data: settles.map((s) => ({ paymentId: pay.id, invoiceId: s.inv.id, amount: s.amount })) });
        for (const s of settles) await applyToInvoice(tx, companyId, s.inv.id, s.amount);
      }

      const lines = await this.settlementLines(user, {
        received, partnerId: partner.id, foreign: currency !== company.baseCurrency, currency, rate,
        funds: { accountId: src.glAccountId, description: `${received ? 'Cobro' : 'Pago'} ${number}`, amount },
        settles, controlAccountId: received ? cfg.receivableAccountId : cfg.payableAccountId,
        advance: remainder.gt(0) ? { accountId: (received ? cfg.customerAdvanceAccountId : cfg.supplierAdvanceAccountId)!, amount: remainder } : undefined,
      });
      const entry = await this.posting.post(tx, user, {
        date, description: `${received ? 'Cobro' : 'Pago'} ${number} - ${partner.name}`, reference: dto.reference ?? number,
        journalType: dto.bankAccountId ? JournalType.BANK : JournalType.CASH,
        sourceType: SourceDocumentType.PAYMENT, sourceId: pay.id,
        currency, exchangeRate: rate, lines,
      });
      await tx.payment.update({ where: { id: pay.id, companyId }, data: { journalEntryId: entry.id } });
      await writeAudit(tx, user, 'Payment', pay.id, AuditAction.CREATE, {
        number, direction: dto.direction, amount: amount.toString(), allocated: allocated.toString(), advance: remainder.toString(),
      });
      return pay.id;
    });
    return this.get(id, user);
  }

  // ------------------------------------------------------------------
  // Aplicar el anticipo pendiente de un pago a facturas
  // ------------------------------------------------------------------
  async allocate(id: string, dto: AllocatePaymentDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const { companyId } = user;
      const pay = await tx.payment.findFirst({ where: { id, companyId }, include: { partner: true } });
      if (!pay) throw new NotFoundException('Pago no encontrado');
      if (pay.status !== PaymentStatus.POSTED) throw new UnprocessableEntityException('El pago está anulado');
      const received = pay.direction === PaymentDirection.RECEIVED;

      const used = await tx.paymentAllocation.aggregate({ where: { paymentId: id }, _sum: { amount: true } });
      const unapplied = pay.amount.minus(D(used._sum.amount));
      const settles = await this.validateAllocations(tx, user, pay.direction, pay.partnerId, pay.currency, dto.allocations);
      const total = settles.reduce((s, x) => s.plus(x.amount), ZERO);
      if (total.gt(unapplied)) throw new UnprocessableEntityException(`Solo quedan ${unapplied} sin aplicar en este pago`);

      const cfg = await this.settings.require(companyId, [
        received ? 'receivableAccountId' : 'payableAccountId',
        received ? 'customerAdvanceAccountId' : 'supplierAdvanceAccountId',
      ] as const) as Partial<Record<SettingsKey, string>>;
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });
      const date = dto.date ? new Date(dto.date) : new Date();

      await tx.paymentAllocation.createMany({ data: settles.map((s) => ({ paymentId: id, invoiceId: s.inv.id, amount: s.amount })) });
      for (const s of settles) await applyToInvoice(tx, companyId, s.inv.id, s.amount);

      const lines = await this.settlementLines(user, {
        received, partnerId: pay.partnerId, foreign: pay.currency !== company.baseCurrency, currency: pay.currency, rate: pay.exchangeRate,
        funds: { accountId: (received ? cfg.customerAdvanceAccountId : cfg.supplierAdvanceAccountId)!, description: `Anticipo aplicado ${pay.number}`, amount: total, partnerId: pay.partnerId },
        settles, controlAccountId: received ? cfg.receivableAccountId : cfg.payableAccountId,
      });
      const entry = await this.posting.post(tx, user, {
        date, description: `Aplicación de anticipo ${pay.number} - ${pay.partner.name}`, reference: pay.number ?? undefined,
        journalType: JournalType.GENERAL, sourceType: SourceDocumentType.PAYMENT, sourceId: id,
        currency: pay.currency, exchangeRate: pay.exchangeRate, lines,
      });
      await writeAudit(tx, user, 'Payment', id, AuditAction.UPDATE, { allocated: total.toString(), entry: entry.number });
    });
    return this.get(id, user);
  }

  // ------------------------------------------------------------------
  // Anular: revierte todos los asientos del pago y restaura los saldos
  // ------------------------------------------------------------------
  async void(id: string, dto: VoidPaymentDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const { companyId } = user;
      const pay = await tx.payment.findFirst({ where: { id, companyId }, include: { allocations: true } });
      if (!pay) throw new NotFoundException('Pago no encontrado');
      const claimed = await tx.payment.updateMany({ where: { id, companyId, status: PaymentStatus.POSTED }, data: { status: PaymentStatus.VOIDED } });
      if (claimed.count === 0) throw new ConflictException('El pago ya está anulado');

      const entries = await tx.journalEntry.findMany({
        where: { companyId, sourceType: SourceDocumentType.PAYMENT, sourceId: id, status: 'POSTED' },
        orderBy: { createdAt: 'desc' },
      });
      for (const e of entries) await this.posting.voidEntry(tx, user, e.id, `Anulación de pago ${pay.number}: ${dto.reason}`);

      const byInvoice = new Map<string, Dec>();
      for (const a of pay.allocations) byInvoice.set(a.invoiceId, (byInvoice.get(a.invoiceId) ?? ZERO).plus(a.amount));
      for (const [invoiceId, amount] of byInvoice) await releaseFromInvoice(tx, companyId, invoiceId, amount);

      await writeAudit(tx, user, 'Payment', id, AuditAction.VOID, { reason: dto.reason, entries: entries.length });
    });
    return this.get(id, user);
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------
  async list(q: ListPaymentsQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.PaymentWhereInput = {
      companyId: user.companyId, direction: q.direction, status: q.status, partnerId: q.partnerId,
      ...(q.from || q.to ? { date: { ...(q.from && { gte: startOfDay(q.from) }), ...(q.to && { lte: endOfDay(q.to) }) } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payment.findMany({
        where, include: { partner: { select: { id: true, name: true } } },
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.payment.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string, user: AuthUser) {
    const pay = await this.prisma.payment.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        partner: { select: { id: true, name: true, taxId: true } },
        allocations: { include: { invoice: { select: { id: true, number: true, ncf: true, type: true } } } },
        bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
        cashRegister: { select: { id: true, name: true } },
        journalEntry: { select: { id: true, number: true, status: true } },
      },
    });
    if (!pay) throw new NotFoundException('Pago no encontrado');
    const applied = pay.allocations.reduce((s, a) => s.plus(a.amount), ZERO);
    return { ...pay, unapplied: pay.status === PaymentStatus.VOIDED ? ZERO : pay.amount.minus(applied) };
  }
}