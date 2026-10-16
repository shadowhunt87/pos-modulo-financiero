import { BadRequestException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { InvoiceStatus, InvoiceType, PartnerType, PaymentDirection, PaymentMethod, TaxApplies, TaxType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { InvoicingService } from '../../invoicing/invoicing.service.js';
import { InventoryService } from '../../inventory/inventory.service.js';
import { PartnersService } from '../../masters/partners/partners.service.js';
import { ProductsService } from '../../masters/products/products.service.js';
import { PaymentsService } from '../../receivables-payables/payments.service.js';
import { FiscalParametersService } from '../../fiscal/fiscal-parameters.service.js';
import type { CreatePartnerDto, UpdatePartnerDto } from '../../masters/dto/partner.dto.js';
import type { CreateProductDto, UpdateProductDto } from '../../masters/dto/product.dto.js';
import { PosConfigService } from './pos-config.service.js';
import { D, ZERO, drToday, posError, r2 } from './pos-common.js';
import {
  StoreAdjustmentDto, StoreCollectDto, StoreDateRangeQuery, StoreInvoiceDto, StoreInvoicesQuery, StorePartnerDto, StorePartnersQuery,
  StoreProductDto, StoreProductsQuery, StorePurchaseDto, StoreStockQuery, StoreVoidDto,
} from './store.dto.js';

const iso = (d: Date) => d.toISOString().slice(0, 10);
const num = (d: Prisma.Decimal) => Number(d.toFixed(4));
const OPEN: InvoiceStatus[] = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE];
const METHOD: Record<StoreCollectDto['method'], PaymentMethod> = {
  CASH: PaymentMethod.CASH, CARD: PaymentMethod.CARD, TRANSFER: PaymentMethod.BANK_TRANSFER, CHECK: PaymentMethod.CHECK,
};
/** Orígenes de los documentos que crea la tienda (contrato de verticales §3.2). */
export const STORE_SOURCE = { INVOICE: 'pos.factura', PURCHASE: 'pos.compra' } as const;

/**
 * POS completo (tienda): productos, inventario, compras, clientes, proveedores y facturas. No duplica lógica: cada
 * operación usa el servicio del núcleo (productos, inventario, facturación, cobros, terceros), que asigna el NCF, calcula
 * el ITBIS vigente, mueve el inventario y hace los asientos.
 */
@Injectable()
export class PosStoreService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PosConfigService,
    private readonly products: ProductsService,
    private readonly inventory: InventoryService,
    private readonly invoicing: InvoicingService,
    private readonly payments: PaymentsService,
    private readonly partners: PartnersService,
    private readonly fiscal: FiscalParametersService,
  ) {}

  // ------------------------------------------------------------------
  // Impuestos y fondos (para los formularios)
  // ------------------------------------------------------------------
  /** Impuestos de venta y compra (no retenciones), con la tasa vigente hoy (R9: si está enlazado, la del parámetro). */
  async taxRates(user: AuthUser) {
    const rows = await this.prisma.taxRate.findMany({
      where: { companyId: user.companyId, active: true, isWithholding: false, type: { in: [TaxType.ITBIS, TaxType.ISC, TaxType.PROPINA_LEGAL] } },
      select: { id: true, name: true, rate: true, type: true, appliesTo: true, parameterKey: true }, orderBy: [{ type: 'asc' }, { rate: 'desc' }],
    });
    const today = drToday();
    const out = [];
    for (const t of rows) {
      const linked = t.parameterKey ? await this.fiscal.tryValueAt(t.parameterKey, today) : null;
      out.push({
        id: t.id, name: t.name, type: t.type, rate: (linked?.value ?? t.rate).toString(),
        sales: t.appliesTo !== TaxApplies.PURCHASES, purchases: t.appliesTo !== TaxApplies.SALES,
      });
    }
    return out;
  }

  /** Cajas y bancos donde puede entrar un cobro (solo los que tienen cuenta contable). */
  async funds(user: AuthUser) {
    const [cash, banks] = await Promise.all([
      this.prisma.cashRegister.findMany({ where: { companyId: user.companyId, active: true, glAccountId: { not: null } }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
      this.prisma.bankAccount.findMany({ where: { companyId: user.companyId, active: true, glAccountId: { not: null } }, select: { id: true, bankName: true, accountNumber: true }, orderBy: { bankName: 'asc' } }),
    ]);
    return { cashRegisters: cash, bankAccounts: banks };
  }

  // ------------------------------------------------------------------
  // Productos
  // ------------------------------------------------------------------
  private async withPosMeta(companyId: string, products: { id: string }[]) {
    const ids = products.map((p) => p.id);
    const [metas, codes] = await Promise.all([
      this.prisma.posProductSetting.findMany({ where: { companyId, productId: { in: ids } } }),
      this.prisma.posBarcode.findMany({ where: { companyId, productId: { in: ids } } }),
    ]);
    const meta = new Map(metas.map((m) => [m.productId, m]));
    return (p: { id: string }) => ({
      categoryId: meta.get(p.id)?.categoryId ?? null, showInPos: meta.get(p.id)?.showInPos ?? true,
      barcodes: codes.filter((c) => c.productId === p.id).map((c) => c.code),
    });
  }

  private readonly productSelect = {
    id: true, code: true, name: true, description: true, kind: true, unit: true, salePrice: true, purchasePrice: true,
    saleTaxRateId: true, purchaseTaxRateId: true, tracksInventory: true, stockQty: true, avgCost: true, active: true,
    saleTaxRate: { select: { name: true, rate: true } },
  } as const;

  async listProducts(q: StoreProductsQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const text = q.q?.trim();
    let byBarcode: string[] = [];
    if (text) byBarcode = (await this.prisma.posBarcode.findMany({ where: { companyId: user.companyId, code: text }, select: { productId: true } })).map((b) => b.productId);
    const inCategory = q.categoryId
      ? (await this.prisma.posProductSetting.findMany({ where: { companyId: user.companyId, categoryId: q.categoryId }, select: { productId: true } })).map((m) => m.productId)
      : null;
    const where: Prisma.ProductWhereInput = {
      companyId: user.companyId, active: q.active,
      ...(inCategory ? { id: { in: inCategory } } : {}),
      ...(q.outOfStock ? { tracksInventory: true, stockQty: { lte: 0 } } : {}),
      ...(text ? { OR: [{ code: { contains: text, mode: 'insensitive' } }, { name: { contains: text, mode: 'insensitive' } }, { id: { in: byBarcode } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, select: this.productSelect, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.product.count({ where }),
    ]);
    const meta = await this.withPosMeta(user.companyId, data);
    return { data: data.map((p) => ({ ...p, ...meta(p) })), total, page, limit };
  }

  async getProduct(id: string, user: AuthUser) {
    const p = await this.prisma.product.findFirst({ where: { id, companyId: user.companyId }, select: this.productSelect });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return { ...p, ...(await this.withPosMeta(user.companyId, [p]))(p) };
  }

  /** Alta o cambio del producto en el núcleo y, en la misma operación, cómo se ve en la caja. */
  async saveProduct(id: string | null, dto: StoreProductDto, user: AuthUser) {
    const { categoryId, showInPos, barcodes, ...core } = dto;
    if (categoryId) {
      const cat = await this.prisma.posCategory.findFirst({ where: { id: categoryId, companyId: user.companyId } });
      if (!cat) throw new NotFoundException('Categoría no encontrada');
    }
    let productId: string;
    if (id) {
      productId = (await this.products.update(id, core as UpdateProductDto, user)).id;
    } else {
      if (!core.code || !core.name) throw new BadRequestException('El producto necesita código y nombre');
      const clean = Object.fromEntries(Object.entries(core).filter(([, v]) => v !== null)) as unknown as CreateProductDto;
      productId = (await this.products.create(clean, user)).id;
    }
    if (categoryId !== undefined || showInPos !== undefined || barcodes !== undefined) {
      await this.config.saveProductSettings([{ productId, ...(categoryId !== undefined ? { categoryId } : {}), ...(showInPos !== undefined ? { showInPos } : {}), ...(barcodes ? { barcodes } : {}) }], user);
    }
    return this.getProduct(productId, user);
  }

  // ------------------------------------------------------------------
  // Inventario
  // ------------------------------------------------------------------
  stock(q: StoreStockQuery, user: AuthUser) {
    return this.inventory.stock(q, user);
  }

  movements(productId: string, q: StoreDateRangeQuery, user: AuthUser) {
    return this.inventory.movements(productId, q, user);
  }

  listAdjustments(q: StoreDateRangeQuery, user: AuthUser) {
    return this.inventory.listAdjustments(q, user);
  }

  getAdjustment(id: string, user: AuthUser) {
    return this.inventory.getAdjustment(id, user);
  }

  /** Conteo físico, mermas, daños o existencia inicial. La contrapartida es la de Configuración contable. */
  createAdjustment(dto: StoreAdjustmentDto, user: AuthUser) {
    return this.inventory.createAdjustment(dto, user);
  }

  voidAdjustment(id: string, dto: StoreVoidDto, user: AuthUser) {
    return this.inventory.voidAdjustment(id, { reason: dto.reason }, user);
  }

  // ------------------------------------------------------------------
  // Compras: la factura del proveedor entra la mercancía al costo (y queda la cuenta por pagar en el núcleo)
  // ------------------------------------------------------------------
  async createPurchase(dto: StorePurchaseDto, user: AuthUser) {
    const { companyId } = user;
    const existing = await this.prisma.invoice.findFirst({ where: { companyId, sourceModule: STORE_SOURCE.PURCHASE, sourceId: dto.clientUuid } });
    if (existing) return this.invoicing.get(existing.id, user); // reintento: la misma compra
    const supplier = await this.prisma.partner.findFirst({ where: { id: dto.supplierId, companyId } });
    if (!supplier || !supplier.active || supplier.type === PartnerType.CUSTOMER) throw new NotFoundException('Proveedor no encontrado o inactivo');
    if (!dto.ncf && !dto.ncfType) throw new UnprocessableEntityException('Escribe el NCF de la factura del proveedor, o elige B11 si es un proveedor informal');
    const ids = [...new Set(dto.lines.map((l) => l.productId))];
    const products = await this.prisma.product.findMany({ where: { companyId, id: { in: ids } } });
    if (products.length !== ids.length) throw new NotFoundException('Algún producto no existe');
    const byId = new Map(products.map((p) => [p.id, p]));
    const due = new Date(new Date(`${dto.issueDate.slice(0, 10)}T00:00:00Z`).getTime() + supplier.paymentTermsDays * 86_400_000);
    const inv = await this.invoicing.create({
      type: InvoiceType.PURCHASE, partnerId: supplier.id, issueDate: dto.issueDate.slice(0, 10), dueDate: iso(due),
      ...(dto.ncf ? { ncf: dto.ncf } : { ncfType: dto.ncfType }), issueNow: true,
      sourceModule: STORE_SOURCE.PURCHASE, sourceId: dto.clientUuid, notes: dto.notes,
      lines: dto.lines.map((l) => {
        const p = byId.get(l.productId)!;
        const taxRateId = l.taxRateId === undefined ? p.purchaseTaxRateId ?? undefined : l.taxRateId ?? undefined;
        return { description: p.name, quantity: l.quantity, unitPrice: l.unitCost, productId: p.id, ...(taxRateId ? { taxRateId } : {}) };
      }),
    }, user);
    return inv;
  }

  listPurchases(q: StoreInvoicesQuery, user: AuthUser) {
    return this.listInvoicesOf(InvoiceType.PURCHASE, q, user);
  }

  // ------------------------------------------------------------------
  // Clientes y proveedores (terceros del núcleo)
  // ------------------------------------------------------------------
  private partnerTypes(kind: 'CUSTOMER' | 'SUPPLIER'): PartnerType[] {
    return kind === 'CUSTOMER' ? [PartnerType.CUSTOMER, PartnerType.BOTH] : [PartnerType.SUPPLIER, PartnerType.BOTH];
  }

  /** Lista con el saldo pendiente (lo que me deben los clientes; lo que debo a los proveedores). */
  async listPartners(kind: 'CUSTOMER' | 'SUPPLIER', q: StorePartnersQuery, user: AuthUser) {
    const { companyId } = user;
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const text = q.q?.trim();
    const invType = kind === 'CUSTOMER' ? [InvoiceType.SALE, InvoiceType.DEBIT_NOTE] : [InvoiceType.PURCHASE];
    const withBalance = q.withBalance
      ? (await this.prisma.invoice.groupBy({ by: ['partnerId'], where: { companyId, status: { in: OPEN }, type: { in: invType }, balance: { gt: 0 } } })).map((g) => g.partnerId)
      : null;
    const where: Prisma.PartnerWhereInput = {
      companyId, type: { in: this.partnerTypes(kind) }, active: q.active,
      ...(withBalance ? { id: { in: withBalance } } : {}),
      ...(text ? { OR: [{ name: { contains: text, mode: 'insensitive' } }, { tradeName: { contains: text, mode: 'insensitive' } }, { taxId: { contains: text.replace(/[\s-]/g, '') } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partner.findMany({
        where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit,
        select: { id: true, type: true, name: true, tradeName: true, taxId: true, taxIdType: true, email: true, phone: true, address: true, city: true, creditLimit: true, paymentTermsDays: true, defaultNcfType: true, active: true },
      }),
      this.prisma.partner.count({ where }),
    ]);
    const balances = await this.prisma.invoice.groupBy({
      by: ['partnerId'], where: { companyId, partnerId: { in: data.map((p) => p.id) }, status: { in: OPEN }, type: { in: invType } }, _sum: { balance: true },
    });
    const bal = new Map(balances.map((b) => [b.partnerId, D(b._sum.balance)]));
    return { data: data.map((p) => ({ ...p, balance: (bal.get(p.id) ?? ZERO).toFixed(2) })), total, page, limit };
  }

  async getPartner(kind: 'CUSTOMER' | 'SUPPLIER', id: string, user: AuthUser) {
    const { companyId } = user;
    const p = await this.prisma.partner.findFirst({ where: { id, companyId, type: { in: this.partnerTypes(kind) } } });
    if (!p) throw new NotFoundException(kind === 'CUSTOMER' ? 'Cliente no encontrado' : 'Proveedor no encontrado');
    const invType = kind === 'CUSTOMER' ? [InvoiceType.SALE, InvoiceType.DEBIT_NOTE, InvoiceType.CREDIT_NOTE] : [InvoiceType.PURCHASE];
    const invoices = await this.prisma.invoice.findMany({
      where: { companyId, partnerId: id, type: { in: invType }, status: { not: InvoiceStatus.DRAFT } },
      select: { id: true, number: true, type: true, ncf: true, issueDate: true, dueDate: true, total: true, balance: true, status: true, sourceModule: true },
      orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], take: 50,
    });
    const balance = invoices.filter((i) => OPEN.includes(i.status) && i.type !== InvoiceType.CREDIT_NOTE).reduce((a, i) => a.plus(i.balance), ZERO);
    return { ...p, balance: balance.toFixed(2), invoices };
  }

  async savePartner(kind: 'CUSTOMER' | 'SUPPLIER', id: string | null, dto: StorePartnerDto, user: AuthUser) {
    if (id) {
      const cur = await this.prisma.partner.findFirst({ where: { id, companyId: user.companyId, type: { in: this.partnerTypes(kind) } } });
      if (!cur) throw new NotFoundException(kind === 'CUSTOMER' ? 'Cliente no encontrado' : 'Proveedor no encontrado');
      await this.partners.update(id, dto as UpdatePartnerDto, user);
      return this.getPartner(kind, id, user);
    }
    if (!dto.name) throw new BadRequestException('Falta el nombre');
    const { active: _a, ...rest } = dto;
    const p = await this.partners.create({ ...rest, name: dto.name, type: kind === 'CUSTOMER' ? PartnerType.CUSTOMER : PartnerType.SUPPLIER } as CreatePartnerDto, user);
    return this.getPartner(kind, p.id, user);
  }

  // ------------------------------------------------------------------
  // Facturas de venta (fuera de la caja: a crédito, a empresas, con su vendedor)
  // ------------------------------------------------------------------
  private async listInvoicesOf(type: InvoiceType, q: StoreInvoicesQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 30;
    const text = q.q?.trim();
    const where: Prisma.InvoiceWhereInput = {
      companyId: user.companyId, type, partnerId: q.partnerId, status: { not: InvoiceStatus.DRAFT },
      ...(q.status ? { status: q.status as InvoiceStatus } : {}),
      ...(q.pending ? { status: { in: OPEN }, balance: { gt: 0 } } : {}),
      ...(q.from || q.to ? { issueDate: { ...(q.from && { gte: new Date(`${q.from.slice(0, 10)}T00:00:00Z`) }), ...(q.to && { lte: new Date(`${q.to.slice(0, 10)}T23:59:59Z`) }) } } : {}),
      ...(text ? { OR: [{ number: { contains: text, mode: 'insensitive' } }, { ncf: { contains: text, mode: 'insensitive' } }, { partner: { name: { contains: text, mode: 'insensitive' } } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where, orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit,
        select: {
          id: true, number: true, type: true, ncf: true, ncfType: true, issueDate: true, dueDate: true, subtotal: true, taxTotal: true, total: true,
          balance: true, status: true, sourceModule: true, partner: { select: { id: true, name: true, taxId: true } },
        },
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  listInvoices(q: StoreInvoicesQuery, user: AuthUser) {
    return this.listInvoicesOf(InvoiceType.SALE, q, user);
  }

  /** Detalle con lo necesario para imprimirla: empresa, cliente, líneas, impuestos y cobros aplicados. */
  async getInvoice(id: string, user: AuthUser) {
    const inv = await this.invoicing.get(id, user);
    if (inv.type !== InvoiceType.SALE && inv.type !== InvoiceType.PURCHASE) throw new NotFoundException('Factura no encontrada');
    const [company, allocations] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true, legalName: true, taxId: true, address: true, phone: true } }),
      this.prisma.paymentAllocation.findMany({
        where: { invoiceId: id, payment: { companyId: user.companyId } },
        select: { amount: true, payment: { select: { id: true, number: true, date: true, method: true, reference: true, status: true } } },
        orderBy: { payment: { date: 'asc' } },
      }),
    ]);
    const { journalEntry: _j, ...rest } = inv;
    return {
      ...rest, company,
      payments: allocations.map((a) => ({ ...a.payment, amount: a.amount })),
    };
  }

  /**
   * Factura de venta desde la tienda: el precio lo pone el servidor (precio de venta del producto); el descuento manual
   * pasa por el mismo límite de la caja y, si lo excede, pide PIN de supervisor. Se emite al momento (NCF incluido).
   */
  async createInvoice(dto: StoreInvoiceDto, user: AuthUser) {
    const { companyId } = user;
    const prev = await this.invoicing.findBySource(this.prisma, companyId, STORE_SOURCE.INVOICE, [dto.clientUuid]);
    const same = prev.find((f) => f.status !== InvoiceStatus.VOIDED);
    if (same) return this.getInvoice(same.id, user); // reintento: la misma factura

    const id = await this.prisma.$transaction(async (tx) => {
      const settings = await this.config.require(tx, companyId);
      const partner = await tx.partner.findFirst({ where: { id: dto.partnerId, companyId } });
      if (!partner || !partner.active || partner.type === PartnerType.SUPPLIER) throw new NotFoundException('Cliente no encontrado o inactivo');
      const ids = [...new Set(dto.lines.map((l) => l.productId))];
      const products = await tx.product.findMany({ where: { companyId, id: { in: ids } } });
      if (products.length !== ids.length) throw new NotFoundException('Algún producto no existe');
      const byId = new Map(products.map((p) => [p.id, p]));
      let needsApproval = false;
      const lines = dto.lines.map((l) => {
        const p = byId.get(l.productId)!;
        if (!p.active) throw new UnprocessableEntityException(`${p.name} está desactivado`);
        if (p.salePrice === null) throw new UnprocessableEntityException(`${p.name} no tiene precio de venta`);
        const gross = r2(D(l.quantity).times(p.salePrice));
        const discount = r2(D(l.discount));
        if (discount.gt(gross)) throw new UnprocessableEntityException(`El descuento de ${p.name} es mayor que su importe`);
        if (discount.gt(0) && gross.gt(0) && discount.div(gross).times(100).gt(settings.maxDiscountPct)) needsApproval = true;
        return {
          description: p.name, quantity: l.quantity, unitPrice: num(p.salePrice), productId: p.id,
          ...(discount.gt(0) ? { discount: num(discount) } : {}), ...(p.saleTaxRateId ? { taxRateId: p.saleTaxRateId } : {}),
        };
      });
      if (needsApproval) await this.config.consumeApproval(tx, user, 'DISCOUNT', dto.approvalId);
      const ncfType = dto.ncfType ?? partner.defaultNcfType ?? settings.defaultNcfType;
      const today = drToday();
      const due = dto.dueDate ? dto.dueDate.slice(0, 10) : iso(new Date(today.getTime() + partner.paymentTermsDays * 86_400_000));
      if (due < iso(today)) throw new UnprocessableEntityException('El vencimiento no puede ser anterior a hoy');
      return this.invoicing.createInTx(tx, {
        type: InvoiceType.SALE, partnerId: partner.id, issueDate: iso(today), dueDate: due, ncfType, issueNow: true,
        sourceModule: STORE_SOURCE.INVOICE, sourceId: dto.clientUuid, notes: dto.notes, lines,
      }, user);
    }, { timeout: 20_000 });
    return this.getInvoice(id, user);
  }

  /**
   * Anular una factura de la tienda o del sistema contable. Las ventas de la caja se anulan desde la caja (su ticket y sus
   * cobros van juntos). Un cajero o vendedor no anula; un supervisor sí.
   */
  async voidInvoice(id: string, dto: StoreVoidDto, user: AuthUser) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, companyId: user.companyId }, select: { sourceModule: true, type: true } });
    if (!inv || (inv.type !== InvoiceType.SALE && inv.type !== InvoiceType.PURCHASE)) throw new NotFoundException('Factura no encontrada');
    if (inv.sourceModule === 'pos.venta') throw new UnprocessableEntityException('Es una venta de la caja: anúlala desde la caja («Ventas y devoluciones»)');
    if (inv.sourceModule && inv.sourceModule !== STORE_SOURCE.INVOICE && inv.sourceModule !== STORE_SOURCE.PURCHASE) {
      throw new UnprocessableEntityException('Esta factura la creó otro sistema: anúlala allí');
    }
    if (inv.type === InvoiceType.SALE && !dto.reasonCode) throw new BadRequestException('Elige el motivo de anulación de la DGII');
    await this.invoicing.void(id, { reason: dto.reason, ...(dto.reasonCode ? { reasonCode: dto.reasonCode } : {}) }, user);
    return this.getInvoice(id, user);
  }

  /** Cobrar una factura pendiente: un cobro del núcleo aplicado a esa factura. No se cobra más que el saldo. */
  async collect(id: string, dto: StoreCollectDto, user: AuthUser) {
    const inv = await this.prisma.invoice.findFirst({ where: { id, companyId: user.companyId, type: InvoiceType.SALE } });
    if (!inv) throw new NotFoundException('Factura no encontrada');
    if (!OPEN.includes(inv.status) || inv.balance.lte(0)) throw new UnprocessableEntityException('Esta factura no tiene saldo pendiente');
    if (D(dto.amount).gt(inv.balance)) throw posError('AMOUNT_OVER_BALANCE', `El saldo es ${inv.balance.toFixed(2)}: no se puede cobrar más`, { balance: inv.balance.toFixed(2) });
    const cash = dto.method === 'CASH';
    if (cash && !dto.cashRegisterId) throw new BadRequestException('Elige la caja donde entra el efectivo');
    if (!cash && !dto.bankAccountId) throw new BadRequestException('Elige el banco donde entra el dinero');
    await this.payments.create({
      direction: PaymentDirection.RECEIVED, partnerId: inv.partnerId, date: iso(drToday()), amount: dto.amount, method: METHOD[dto.method],
      reference: dto.reference ?? `Cobro ${inv.number}`, ...(cash ? { cashRegisterId: dto.cashRegisterId } : { bankAccountId: dto.bankAccountId }),
      allocations: [{ invoiceId: inv.id, amount: dto.amount }],
    }, user);
    return this.getInvoice(id, user);
  }

  /** Resumen para el inicio de la tienda: lo que más pide atención por área. */
  async summary(user: AuthUser) {
    const { companyId } = user;
    const today = drToday();
    const [receivable, overdue, outOfStock, salesToday] = await Promise.all([
      this.prisma.invoice.aggregate({ where: { companyId, type: InvoiceType.SALE, status: { in: OPEN } }, _sum: { balance: true }, _count: true }),
      this.prisma.invoice.count({ where: { companyId, type: InvoiceType.SALE, status: { in: OPEN }, dueDate: { lt: today } } }),
      this.prisma.product.count({ where: { companyId, active: true, tracksInventory: true, stockQty: { lte: 0 } } }),
      this.prisma.invoice.aggregate({ where: { companyId, type: InvoiceType.SALE, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOIDED] }, issueDate: today }, _sum: { total: true }, _count: true }),
    ]);
    return {
      receivable: { count: receivable._count, total: D(receivable._sum.balance).toFixed(2), overdue },
      outOfStock,
      salesToday: { count: salesToday._count, total: D(salesToday._sum.total).toFixed(2) },
    };
  }
}
