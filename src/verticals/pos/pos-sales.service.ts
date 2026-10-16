import { randomUUID } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import {
  AuditAction, InvoiceStatus, InvoiceType, PartnerType, PaymentDirection, PaymentMethod, PosPayMethod, PosSaleStatus, PosShiftStatus,
} from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../../common/audit.js';
import { DocumentSequencesService } from '../../masters/sequences/document-sequences.service.js';
import { PartnersService } from '../../masters/partners/partners.service.js';
import { InvoicingService } from '../../invoicing/invoicing.service.js';
import { PaymentsService } from '../../receivables-payables/payments.service.js';
import { FiscalParametersService } from '../../fiscal/fiscal-parameters.service.js';
import type { CreatePartnerDto } from '../../masters/dto/partner.dto.js';
import { CreateSaleDto, ListSalesQuery, ParkSaleDto, ReportQuery, ReturnSaleDto, VoidSaleDto } from './dto.js';
import { PosConfigService } from './pos-config.service.js';
import { PosShiftsService } from './pos-shifts.service.js';
import { priceCart, type PromoRule } from './pricing.js';
import { D, SOURCE, ZERO, drToday, posError, r2, type Dec, type Tx } from './pos-common.js';

const CORE_METHOD: Record<PosPayMethod, PaymentMethod> = { CASH: PaymentMethod.CASH, CARD: PaymentMethod.CARD, TRANSFER: PaymentMethod.BANK_TRANSFER };
const METHOD_LABEL: Record<PosPayMethod, string> = { CASH: 'Efectivo', CARD: 'Tarjeta', TRANSFER: 'Transferencia' };
const PARKED_LIMIT = 20;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: Dec) => Number(d.toFixed(4));

/**
 * Ventas del POS (fase 2 de docs/PLAN-POS.md). Cada venta es una FACTURA DEL NÚCLEO (origen pos.venta): el núcleo asigna
 * el NCF, calcula el ITBIS vigente, mueve el inventario y hace los asientos. El cobro es un COBRO DEL NÚCLEO por forma de
 * pago. Todo en una transacción: si algo falla, no queda ni factura ni cobro ni ticket.
 */
@Injectable()
export class PosSalesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PosConfigService,
    private readonly shifts: PosShiftsService,
    private readonly sequences: DocumentSequencesService,
    private readonly invoicing: InvoicingService,
    private readonly payments: PaymentsService,
    private readonly partners: PartnersService,
    private readonly fiscal: FiscalParametersService,
  ) {}

  // ------------------------------------------------------------------
  // Lo que la caja necesita para trabajar
  // ------------------------------------------------------------------
  /** Catálogo de la caja: productos del núcleo que se venden, con precio, impuesto vigente, existencia y códigos. */
  async catalog(user: AuthUser) {
    const { companyId } = user;
    const settings = await this.config.require(this.prisma, companyId);
    const [products, metas, barcodes, categories, promotions, partner] = await Promise.all([
      this.prisma.product.findMany({
        where: { companyId, active: true, salePrice: { not: null } },
        select: { id: true, code: true, name: true, unit: true, kind: true, salePrice: true, saleTaxRateId: true, tracksInventory: true, stockQty: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.posProductSetting.findMany({ where: { companyId } }),
      this.prisma.posBarcode.findMany({ where: { companyId } }),
      this.prisma.posCategory.findMany({ where: { companyId, active: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.posPromotion.findMany({ where: { companyId, active: true } }),
      this.prisma.partner.findFirst({ where: { id: settings.defaultPartnerId, companyId }, select: { id: true, name: true } }),
    ]);
    // Impuesto: la tasa vigente hoy (si está enlazado a un valor fiscal, la de ese valor; R9)
    const taxIds = [...new Set(products.map((p) => p.saleTaxRateId).filter((x): x is string => !!x))];
    const taxes = await this.prisma.taxRate.findMany({ where: { companyId, id: { in: taxIds } } });
    const today = drToday();
    const rate = new Map<string, { name: string; rate: string }>();
    for (const t of taxes) {
      const linked = t.parameterKey ? await this.fiscal.tryValueAt(t.parameterKey, today) : null;
      rate.set(t.id, { name: t.name, rate: (linked?.value ?? t.rate).toString() });
    }
    const meta = new Map(metas.map((m) => [m.productId, m]));
    const codes = new Map<string, string[]>();
    for (const b of barcodes) codes.set(b.productId, [...(codes.get(b.productId) ?? []), b.code]);
    return {
      settings: {
        defaultNcfType: settings.defaultNcfType, fiscalCreditNcfType: settings.fiscalCreditNcfType, maxDiscountPct: settings.maxDiscountPct.toString(),
        receiptFooter: settings.receiptFooter, defaultPartner: partner,
      },
      categories,
      products: products
        .filter((p) => meta.get(p.id)?.showInPos !== false)
        .map((p) => ({
          ...p, salePrice: p.salePrice!.toString(), stockQty: p.stockQty.toString(),
          categoryId: meta.get(p.id)?.categoryId ?? null, sortOrder: meta.get(p.id)?.sortOrder ?? 0, barcodes: codes.get(p.id) ?? [],
          tax: p.saleTaxRateId ? rate.get(p.saleTaxRateId) ?? null : null,
        })),
      promotions: promotions.map((p) => ({ ...p, value: p.value?.toString() ?? null })),
      serverTime: new Date().toISOString(),
    };
  }

  /** Clientes para la caja (el cajero no entra a «Clientes y proveedores» del núcleo). */
  async customers(q: string | undefined, user: AuthUser) {
    const text = q?.trim();
    return this.prisma.partner.findMany({
      where: {
        companyId: user.companyId, active: true, type: { not: PartnerType.SUPPLIER },
        ...(text ? { OR: [{ name: { contains: text, mode: 'insensitive' } }, { taxId: { contains: text.replace(/[\s-]/g, '') } }] } : {}),
      },
      select: { id: true, name: true, taxId: true, taxIdType: true, defaultNcfType: true, creditLimit: true },
      orderBy: { name: 'asc' }, take: 25,
    });
  }

  /** Alta rápida de cliente desde la caja: es un cliente del núcleo. */
  createCustomer(dto: Pick<CreatePartnerDto, 'name' | 'taxId' | 'taxIdType' | 'phone' | 'email' | 'defaultNcfType'>, user: AuthUser) {
    return this.partners.create({ ...dto, type: PartnerType.CUSTOMER } as CreatePartnerDto, user);
  }

  // ------------------------------------------------------------------
  // Vender
  // ------------------------------------------------------------------
  async create(dto: CreateSaleDto, user: AuthUser) {
    const { companyId } = user;
    const existing = await this.prisma.posSale.findFirst({ where: { companyId, clientUuid: dto.clientUuid } });
    if (existing) return this.get(existing.id, user); // reintento de la caja: la misma venta
    let id: string;
    try {
      id = await this.prisma.$transaction((tx) => this.createTx(tx, dto, user), { timeout: 20_000 });
    } catch (e) {
      if (isUniqueViolation(e)) {
        const again = await this.prisma.posSale.findFirst({ where: { companyId, clientUuid: dto.clientUuid } });
        if (again) return this.get(again.id, user);
      }
      throw e;
    }
    return this.get(id, user);
  }

  private async createTx(tx: Tx, dto: CreateSaleDto, user: AuthUser): Promise<string> {
    const { companyId } = user;
    const shift = await this.shifts.requireOpen(tx, user, dto.shiftId);
    const settings = await this.config.require(tx, companyId);
    const partnerId = dto.partnerId ?? settings.defaultPartnerId;
    const partner = await tx.partner.findFirst({ where: { id: partnerId, companyId } });
    if (!partner || !partner.active || partner.type === PartnerType.SUPPLIER) throw new NotFoundException('Cliente no encontrado o inactivo');
    const ncfType = dto.ncfType ?? partner.defaultNcfType ?? settings.defaultNcfType;

    // Productos del núcleo, con su precio de venta (el precio lo pone el servidor, no la caja)
    const ids = [...new Set(dto.lines.map((l) => l.productId))];
    const products = await tx.product.findMany({ where: { companyId, id: { in: ids } } });
    if (products.length !== ids.length) throw posError('TOTAL_MISMATCH', 'Algún producto ya no existe: actualiza el catálogo de la caja');
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const p of products) {
      if (!p.active) throw posError('TOTAL_MISMATCH', `${p.name} está desactivado: actualiza el catálogo de la caja`);
      if (p.salePrice === null) throw new UnprocessableEntityException(`${p.name} no tiene precio de venta`);
    }
    const metas = await tx.posProductSetting.findMany({ where: { companyId, productId: { in: ids } } });
    const category = new Map(metas.map((m) => [m.productId, m.categoryId]));
    const promos = (await tx.posPromotion.findMany({ where: { companyId, active: true } })) as unknown as PromoRule[];
    const cart = dto.lines.map((l) => ({ productId: l.productId, categoryId: category.get(l.productId) ?? null, quantity: D(l.quantity), unitPrice: byId.get(l.productId)!.salePrice! }));
    const priced = priceCart(promos, cart, new Date());

    // Descuento manual: sobre lo que queda después de la promoción; si pasa el % permitido, PIN de supervisor
    let needsDiscountApproval = false;
    const lines = dto.lines.map((l, i) => {
      const p = byId.get(l.productId)!;
      const gross = priced[i].gross;
      const manual = r2(D(l.discount));
      const afterPromo = gross.minus(priced[i].promoDiscount);
      if (manual.gt(afterPromo)) throw new UnprocessableEntityException(`El descuento de ${p.name} es mayor que su importe`);
      if (manual.gt(0) && manual.div(gross).times(100).gt(settings.maxDiscountPct)) needsDiscountApproval = true;
      return { p, gross, manual, promo: priced[i].promoDiscount, promotionId: priced[i].promotionId, quantity: D(l.quantity) };
    });
    if (needsDiscountApproval) await this.config.consumeApproval(tx, user, 'DISCOUNT', dto.approvalId);

    const saleId = randomUUID();
    const number = await this.sequences.nextFor(tx, companyId, SOURCE.SALE, 'TK');
    const invoiceId = await this.invoicing.createInTx(tx, {
      type: InvoiceType.SALE, partnerId: partner.id, issueDate: iso(drToday()), ncfType, issueNow: true,
      sourceModule: SOURCE.SALE, sourceId: saleId, notes: `Ticket ${number}${dto.notes ? ` · ${dto.notes}` : ''}`,
      lines: lines.map((l) => ({
        description: l.p.name, quantity: num(l.quantity), unitPrice: num(l.p.salePrice!), discount: num(l.promo.plus(l.manual)),
        taxRateId: l.p.saleTaxRateId ?? undefined, productId: l.p.id,
      })),
    }, user);
    // La factura recién emitida (en esta misma transacción): montos y NCF que van en el ticket
    const inv = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId, companyId }, select: { number: true, ncf: true, subtotal: true, discountTotal: true, taxTotal: true, total: true },
    });
    const total = inv.total;
    if (dto.expectedTotal !== undefined && !r2(D(dto.expectedTotal)).eq(r2(total))) {
      throw new ConflictException({ code: 'TOTAL_MISMATCH', message: `El total cambió: la caja mostraba ${dto.expectedTotal}, el sistema calcula ${total.toFixed(2)}. Actualiza el catálogo y revisa el carrito`, total: total.toFixed(2) });
    }

    // Cobro por forma de pago: tarjeta y transferencia primero; el efectivo cubre el resto y lo que sobra es el cambio
    const sumOf = (m: PosPayMethod) => dto.payments.filter((p) => p.method === m).reduce((a, p) => a.plus(r2(D(p.amount))), ZERO);
    const card = sumOf(PosPayMethod.CARD), transfer = sumOf(PosPayMethod.TRANSFER), tendered = sumOf(PosPayMethod.CASH);
    const nonCash = card.plus(transfer);
    if (nonCash.gt(total)) throw new UnprocessableEntityException('Lo pagado con tarjeta o transferencia pasa del total: el cambio solo se da en efectivo');
    const cashApplied = Prisma_min(tendered, total.minus(nonCash));
    const change = tendered.minus(cashApplied);
    const paid = nonCash.plus(cashApplied);
    if (paid.lt(total)) {
      if (!dto.allowCredit) throw posError('PAYMENT_SHORT', `Falta cobrar ${total.minus(paid).toFixed(2)}`, { pending: total.minus(paid).toFixed(2) });
      if (partner.id === settings.defaultPartnerId) throw new UnprocessableEntityException('Para vender a crédito elige el cliente (no «Consumidor final»)');
      await this.config.consumeApproval(tx, user, 'CREDIT_SALE', dto.approvalId);
    }
    const t = shift.terminal;
    const ref = (m: PosPayMethod) => dto.payments.find((p) => p.method === m && p.reference)?.reference;
    const applied: { method: PosPayMethod; amount: Dec; tendered?: Dec; paymentId: string }[] = [];
    for (const [method, amount] of [[PosPayMethod.CASH, cashApplied], [PosPayMethod.CARD, card], [PosPayMethod.TRANSFER, transfer]] as const) {
      if (amount.lte(0)) continue;
      const bankAccountId = method === PosPayMethod.CARD ? t.cardBankAccountId : method === PosPayMethod.TRANSFER ? t.transferBankAccountId : null;
      if (method !== PosPayMethod.CASH && !bankAccountId) throw new UnprocessableEntityException(`La terminal ${t.name} no tiene cuenta bancaria para ${METHOD_LABEL[method].toLowerCase()}`);
      const paymentId = await this.payments.createInTx(tx, {
        direction: PaymentDirection.RECEIVED, partnerId: partner.id, date: iso(drToday()), amount: num(amount), method: CORE_METHOD[method],
        reference: ref(method) ?? `Ticket ${number}`, externalRef: `pos:${saleId}:${method}`,
        ...(method === PosPayMethod.CASH ? { cashRegisterId: t.cashRegisterId } : { bankAccountId: bankAccountId! }),
        allocations: [{ invoiceId, amount: num(amount) }],
      }, user);
      applied.push({ method, amount, tendered: method === PosPayMethod.CASH ? tendered : undefined, paymentId });
    }

    await tx.posSale.create({
      data: {
        id: saleId, companyId, shiftId: shift.id, terminalId: shift.terminalId, number, clientUuid: dto.clientUuid, invoiceId,
        invoiceNumber: inv.number, ncf: inv.ncf, partnerId: partner.id, ncfType,
        subtotal: inv.subtotal, discountTotal: lines.reduce((a, l) => a.plus(l.manual), ZERO), promoTotal: lines.reduce((a, l) => a.plus(l.promo), ZERO),
        taxTotal: inv.taxTotal, total, paidTotal: paid, changeGiven: change, createdById: user.id,
        lines: {
          create: lines.map((l) => ({
            productId: l.p.id, description: l.p.name, quantity: l.quantity, unitPrice: l.p.salePrice!, discount: l.manual, promoDiscount: l.promo,
            promotionId: l.promotionId, taxRateId: l.p.saleTaxRateId,
          })),
        },
        payments: {
          create: applied.map((a) => ({ method: a.method, amount: a.amount, tendered: a.tendered ?? null, reference: ref(a.method) ?? null, paymentId: a.paymentId })),
        },
      },
    });
    await writeAudit(tx, user, 'PosSale', saleId, AuditAction.CREATE, { number, invoice: inv.number, ncf: inv.ncf, total: total.toString(), shift: shift.number });
    return saleId;
  }

  // ------------------------------------------------------------------
  // Anular (mismo turno) y devolver
  // ------------------------------------------------------------------
  /** Anula una venta del turno abierto: anula sus cobros y su factura en el núcleo (revierte inventario y asientos). */
  async void(saleId: string, dto: VoidSaleDto, user: AuthUser) {
    const { companyId } = user;
    await this.prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.findFirst({ where: { id: saleId, companyId }, include: { payments: true, returns: true, shift: true } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== PosSaleStatus.COMPLETED) throw new ConflictException('La venta ya está anulada');
      if (sale.shift.status !== PosShiftStatus.OPEN) throw posError('SHIFT_CLOSED', 'Ese turno ya cerró: en lugar de anular, registra una devolución');
      if (sale.returns.length) throw new UnprocessableEntityException('La venta tiene devoluciones: no se anula');
      await this.shifts.requireOpen(tx, user, sale.shiftId);
      const approvedById = await this.config.consumeApproval(tx, user, 'VOID', dto.approvalId);
      for (const p of sale.payments) if (p.paymentId) await this.payments.voidInTx(tx, p.paymentId, { reason: `Anulación ticket ${sale.number}: ${dto.reason}` }, user);
      await this.invoicing.voidInTx(tx, sale.invoiceId, { reason: `Anulación ticket ${sale.number}: ${dto.reason}`, reasonCode: dto.reasonCode }, user);
      const res = await tx.posSale.updateMany({
        where: { id: sale.id, companyId, status: PosSaleStatus.COMPLETED },
        data: { status: PosSaleStatus.VOIDED, voidedAt: new Date(), voidedById: user.id, voidReason: dto.reason },
      });
      if (res.count === 0) throw new ConflictException('La venta cambió; reintenta');
      await writeAudit(tx, user, 'PosSale', sale.id, AuditAction.VOID, { reason: dto.reason, reasonCode: dto.reasonCode, approvedById });
    }, { timeout: 20_000 });
    return this.get(saleId, user);
  }

  /** Devolución: nota de crédito del núcleo por lo devuelto y reembolso al cliente desde la caja del turno abierto. */
  async return(saleId: string, dto: ReturnSaleDto, user: AuthUser) {
    const { companyId } = user;
    const returnId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      const sale = await tx.posSale.findFirst({ where: { id: saleId, companyId }, include: { lines: true } });
      if (!sale) throw new NotFoundException('Venta no encontrada');
      if (sale.status !== PosSaleStatus.COMPLETED) throw new UnprocessableEntityException('La venta está anulada');
      const shift = await this.shifts.requireOpen(tx, user, dto.shiftId);
      const approvedById = await this.config.consumeApproval(tx, user, 'RETURN', dto.approvalId);
      const inv = await tx.invoice.findFirstOrThrow({ where: { id: sale.invoiceId, companyId }, select: { status: true, balance: true } });
      if (inv.status === InvoiceStatus.VOIDED) throw new UnprocessableEntityException('La factura de esta venta está anulada');
      if (inv.balance.gt(0)) throw new UnprocessableEntityException('Esta venta tiene saldo pendiente: cóbralo antes de devolver, o haz la nota de crédito desde Facturas');

      const byLine = new Map(sale.lines.map((l) => [l.id, l]));
      const picked = dto.lines.map((r) => {
        const l = byLine.get(r.saleLineId);
        if (!l) throw new NotFoundException('Una línea no es de esta venta');
        const qty = D(r.quantity);
        const left = l.quantity.minus(l.returnedQty);
        if (qty.gt(left)) throw new UnprocessableEntityException(`De ${l.description} solo quedan ${left.toString()} por devolver`);
        // El descuento se prorratea: se devuelve lo que se cobró por esas unidades
        const discount = r2(l.discount.plus(l.promoDiscount).times(qty).div(l.quantity));
        return { l, qty, discount };
      });
      const number = await this.sequences.nextFor(tx, companyId, SOURCE.RETURN, 'DV');
      const creditNoteId = await this.invoicing.createInTx(tx, {
        type: InvoiceType.CREDIT_NOTE, partnerId: sale.partnerId, issueDate: iso(drToday()), relatedInvoiceId: sale.invoiceId, issueNow: true,
        sourceModule: SOURCE.RETURN, sourceId: returnId, notes: `Devolución ${number} del ticket ${sale.number}: ${dto.reason}`,
        lines: picked.map((x) => ({
          description: x.l.description, quantity: num(x.qty), unitPrice: num(x.l.unitPrice), discount: num(x.discount),
          taxRateId: x.l.taxRateId ?? undefined, productId: x.l.productId,
        })),
      }, user);
      const cn = await tx.invoice.findFirstOrThrow({ where: { id: creditNoteId, companyId }, select: { total: true, balance: true } });

      const t = shift.terminal;
      if (dto.refundMethod === PosPayMethod.CASH) {
        const totals = await this.shifts.totals(tx, companyId, shift.id);
        if (cn.balance.gt(totals.expectedCash)) throw new UnprocessableEntityException(`En la gaveta debería haber ${totals.expectedCash.toFixed(2)}: no alcanza para devolver ${cn.balance.toFixed(2)} en efectivo`);
      }
      const bankAccountId = dto.refundMethod === PosPayMethod.CARD ? t.cardBankAccountId : dto.refundMethod === PosPayMethod.TRANSFER ? t.transferBankAccountId : null;
      if (dto.refundMethod !== PosPayMethod.CASH && !bankAccountId) throw new UnprocessableEntityException(`La terminal ${t.name} no tiene cuenta bancaria para ${METHOD_LABEL[dto.refundMethod].toLowerCase()}`);
      const refundPaymentId = await this.payments.createInTx(tx, {
        direction: PaymentDirection.MADE, partnerId: sale.partnerId, date: iso(drToday()), amount: num(cn.balance), method: CORE_METHOD[dto.refundMethod],
        reference: `Devolución ${number}`, externalRef: `pos:${returnId}:REFUND`,
        ...(dto.refundMethod === PosPayMethod.CASH ? { cashRegisterId: t.cashRegisterId } : { bankAccountId: bankAccountId! }),
        allocations: [{ invoiceId: creditNoteId, amount: num(cn.balance) }],
      }, user);

      for (const x of picked) await tx.posSaleLine.update({ where: { id: x.l.id, sale: { companyId } }, data: { returnedQty: { increment: x.qty } } });
      await tx.posReturn.create({
        data: {
          id: returnId, companyId, saleId: sale.id, shiftId: shift.id, number, creditNoteId, refundPaymentId, method: dto.refundMethod,
          total: cn.total, reason: dto.reason, createdById: user.id, approvedById,
          lines: picked.map((x) => ({ saleLineId: x.l.id, productId: x.l.productId, description: x.l.description, quantity: x.qty.toString() })) as Prisma.InputJsonValue,
        },
      });
      await writeAudit(tx, user, 'PosReturn', returnId, AuditAction.CREATE, { number, sale: sale.number, total: cn.total.toString(), approvedById });
    }, { timeout: 20_000 });
    return this.get(saleId, user);
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------
  async get(id: string, user: AuthUser) {
    const sale = await this.prisma.posSale.findFirst({
      where: { id, companyId: user.companyId },
      include: { lines: true, payments: true, returns: { orderBy: { createdAt: 'asc' } }, shift: { select: { number: true, status: true } } },
    });
    if (!sale) throw new NotFoundException('Venta no encontrada');
    // Estado de la factura: se lee del núcleo, no se copia (contrato §3.3)
    const [invoice] = await this.invoicing.findBySource(this.prisma, user.companyId, SOURCE.SALE, [sale.id]);
    const partner = await this.prisma.partner.findFirst({ where: { id: sale.partnerId, companyId: user.companyId }, select: { id: true, name: true, taxId: true } });
    return { ...sale, partner, invoice: invoice ?? null };
  }

  /** Datos para imprimir el ticket: empresa, venta, factura (NCF y vencimiento) y e-CF si aplica. */
  async ticket(id: string, user: AuthUser) {
    const sale = await this.get(id, user);
    const [company, inv, settings] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true, legalName: true, taxId: true, address: true, phone: true } }),
      this.prisma.invoice.findFirst({
        where: { id: sale.invoiceId, companyId: user.companyId },
        select: { ncfType: true, issuedAt: true, ecfDocument: { select: { securityCode: true, status: true } } },
      }),
      this.prisma.posSettings.findUnique({ where: { companyId: user.companyId }, select: { receiptFooter: true } }),
    ]);
    const cashier = await this.prisma.user.findFirst({ where: { id: sale.createdById, companyId: user.companyId }, select: { name: true } });
    return { company, sale, cashier: cashier?.name ?? null, ncfType: inv?.ncfType ?? sale.ncfType, issuedAt: inv?.issuedAt ?? sale.createdAt, ecf: inv?.ecfDocument ?? null, footer: settings?.receiptFooter ?? null };
  }

  async list(q: ListSalesQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 30;
    const text = q.q?.trim();
    const where: Prisma.PosSaleWhereInput = {
      companyId: user.companyId, shiftId: q.shiftId, terminalId: q.terminalId,
      ...(q.from || q.to ? { createdAt: { ...(q.from && { gte: new Date(`${q.from}T04:00:00Z`) }), ...(q.to && { lt: new Date(new Date(`${q.to}T04:00:00Z`).getTime() + 86_400_000) }) } } : {}),
      ...(text ? { OR: [{ number: { contains: text, mode: 'insensitive' } }, { ncf: { contains: text, mode: 'insensitive' } }, { invoiceNumber: { contains: text, mode: 'insensitive' } }] } : {}),
    };
    // Un cajero ve las ventas de su turno abierto; de otros turnos, solo el ticket que busca por su número o NCF exacto
    // (para una devolución), no la lista completa
    if (user.role === 'CASHIER') {
      if (text) {
        delete where.OR;
        where.shiftId = undefined;
        where.OR = [{ number: text.toUpperCase() }, { ncf: text.toUpperCase() }];
      } else {
        const own = await this.prisma.posShift.findMany({ where: { companyId: user.companyId, openedById: user.id, status: PosShiftStatus.OPEN }, select: { id: true } });
        where.shiftId = { in: own.map((s) => s.id).filter((s) => !q.shiftId || s === q.shiftId) };
      }
    }
    const [data, total] = await this.prisma.$transaction([
      this.prisma.posSale.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { payments: { select: { method: true, amount: true } } } }),
      this.prisma.posSale.count({ where }),
    ]);
    const partners = await this.prisma.partner.findMany({ where: { companyId: user.companyId, id: { in: [...new Set(data.map((x) => x.partnerId))] } }, select: { id: true, name: true, taxId: true } });
    return { data: data.map((x) => ({ ...x, partner: partners.find((p) => p.id === x.partnerId) ?? null })), total, page, limit };
  }

  // ------------------------------------------------------------------
  // Ventas suspendidas
  // ------------------------------------------------------------------
  listParked(terminalId: string, user: AuthUser) {
    return this.prisma.posParkedSale.findMany({ where: { companyId: user.companyId, terminalId }, orderBy: { createdAt: 'asc' } });
  }

  async park(dto: ParkSaleDto, user: AuthUser) {
    const { companyId } = user;
    const t = await this.prisma.posTerminal.findFirst({ where: { id: dto.terminalId, companyId } });
    if (!t) throw new NotFoundException('Terminal no encontrada');
    const n = await this.prisma.posParkedSale.count({ where: { companyId, terminalId: t.id } });
    if (n >= PARKED_LIMIT) throw posError('PARKED_LIMIT', `Esta terminal ya tiene ${PARKED_LIMIT} ventas suspendidas: recupera o descarta alguna`);
    return this.prisma.posParkedSale.create({
      data: { companyId, terminalId: t.id, label: dto.label, payload: dto.payload as Prisma.InputJsonValue, createdById: user.id },
    });
  }

  /** Recuperar: se borra al leerla, así dos cajas no recuperan la misma. */
  async resume(id: string, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const p = await tx.posParkedSale.findFirst({ where: { id, companyId: user.companyId } });
      if (!p) throw new NotFoundException('La venta suspendida ya no existe (otra caja la recuperó o se descartó)');
      const res = await tx.posParkedSale.deleteMany({ where: { id, companyId: user.companyId } });
      if (res.count !== 1) throw new NotFoundException('La venta suspendida ya no existe');
      return p;
    });
  }

  async discardParked(id: string, user: AuthUser) {
    const res = await this.prisma.posParkedSale.deleteMany({ where: { id, companyId: user.companyId } });
    if (res.count !== 1) throw new NotFoundException('La venta suspendida ya no existe');
    return { deleted: true };
  }

  // ------------------------------------------------------------------
  // Reportes
  // ------------------------------------------------------------------
  /** Ventas por día, terminal y cajero, y los productos más vendidos. */
  async report(q: ReportQuery, user: AuthUser) {
    const where: Prisma.PosSaleWhereInput = {
      companyId: user.companyId, status: PosSaleStatus.COMPLETED, terminalId: q.terminalId,
      createdAt: { gte: new Date(`${q.from}T04:00:00Z`), lt: new Date(new Date(`${q.to}T04:00:00Z`).getTime() + 86_400_000) },
    };
    const sales = await this.prisma.posSale.findMany({ where, include: { lines: true } });
    const returns = await this.prisma.posReturn.findMany({ where: { companyId: user.companyId, createdAt: where.createdAt as Prisma.DateTimeFilter } });
    const dayOf = (d: Date) => iso(new Date(d.getTime() - 4 * 3_600_000));
    const group = <K extends string>(key: (s: (typeof sales)[number]) => K) => {
      const m = new Map<K, { key: K; count: number; total: Dec; tax: Dec; discounts: Dec }>();
      for (const s of sales) {
        const k = key(s);
        const cur = m.get(k) ?? { key: k, count: 0, total: ZERO, tax: ZERO, discounts: ZERO };
        cur.count++; cur.total = cur.total.plus(s.total); cur.tax = cur.tax.plus(s.taxTotal); cur.discounts = cur.discounts.plus(s.discountTotal).plus(s.promoTotal);
        m.set(k, cur);
      }
      return [...m.values()].sort((a, b) => (a.key < b.key ? -1 : 1));
    };
    const products = new Map<string, { productId: string; description: string; quantity: Dec; amount: Dec }>();
    for (const s of sales) for (const l of s.lines) {
      const cur = products.get(l.productId) ?? { productId: l.productId, description: l.description, quantity: ZERO, amount: ZERO };
      cur.quantity = cur.quantity.plus(l.quantity.minus(l.returnedQty));
      cur.amount = cur.amount.plus(l.quantity.times(l.unitPrice).minus(l.discount).minus(l.promoDiscount));
      products.set(l.productId, cur);
    }
    const userIds = [...new Set(sales.map((s) => s.createdById))];
    const users = await this.prisma.user.findMany({ where: { companyId: user.companyId, id: { in: userIds } }, select: { id: true, name: true } });
    const terminals = await this.prisma.posTerminal.findMany({ where: { companyId: user.companyId }, select: { id: true, name: true } });
    return {
      totals: { count: sales.length, total: sales.reduce((a, s) => a.plus(s.total), ZERO), returns: returns.reduce((a, r) => a.plus(r.total), ZERO) },
      byDay: group((s) => dayOf(s.createdAt)),
      byTerminal: group((s) => s.terminalId).map((g) => ({ ...g, name: terminals.find((t) => t.id === g.key)?.name ?? g.key })),
      byCashier: group((s) => s.createdById).map((g) => ({ ...g, name: users.find((u) => u.id === g.key)?.name ?? g.key })),
      topProducts: [...products.values()].sort((a, b) => b.amount.cmp(a.amount)).slice(0, 20),
    };
  }
}

const Prisma_min = (a: Dec, b: Dec) => (a.lt(b) ? a : b);
