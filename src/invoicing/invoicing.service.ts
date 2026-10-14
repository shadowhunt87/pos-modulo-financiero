import { randomUUID } from 'node:crypto';
import {
  BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AuditAction, InvoiceStatus, InvoiceType, JournalType, PartnerType, SourceDocumentType,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { startOfDay, endOfDay } from '../reports/accounting-nature.utils.js';
import { NcfService, isValidNcfFormat } from '../masters/ncf/ncf.service.js';
import { NCF_TYPE_REGEX } from '../masters/dto/ncf.dto.js';
import { DocumentSequencesService, type DocType } from '../masters/sequences/document-sequences.service.js';
import { AccountingSettingsService } from '../masters/accounting-settings/accounting-settings.service.js';
import { PostingService, type PostLine } from '../posting/posting.service.js';
import { FiscalParametersService } from '../fiscal/fiscal-parameters.service.js';
import { FiscalCalendarService } from '../fiscal/fiscal-calendar.service.js';
import { TaxLinksService } from '../fiscal/tax-links.service.js';
import { CreateInvoiceDto, IssueInvoiceDto, ListInvoicesQuery, UpdateInvoiceDto, VoidInvoiceDto } from './dto/invoice.dto.js';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;
const D = (v?: Dec | number | string | null): Dec => new Prisma.Decimal(v === null || v === undefined ? 0 : v);
const ZERO = D(0);
// Montos fiscales a 2 decimales, redondeo half-up (modo 4 de decimal.js)
const r2 = (d: Dec): Dec => d.toDecimalPlaces(2, 4);

type Side = 'SALES' | 'PURCHASES';
const OPEN_STATUSES: InvoiceStatus[] = [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE];
const DOC_TYPE: Record<InvoiceType, DocType> = {
  SALE: 'INVOICE_SALE', PURCHASE: 'INVOICE_PURCHASE', CREDIT_NOTE: 'CREDIT_NOTE', DEBIT_NOTE: 'DEBIT_NOTE',
};
const LABEL: Record<InvoiceType, string> = {
  SALE: 'Factura de venta', PURCHASE: 'Factura de compra', CREDIT_NOTE: 'Nota de crédito', DEBIT_NOTE: 'Nota de débito',
};
// Comprobantes que la empresa puede emitir según el documento (Norma 06-2018 y e-CF).
// Sin esto una venta podía gastar la secuencia de compras (B11) o una nota de crédito la de B01.
const SALES_NCF = ['B01', 'B02', 'B12', 'B14', 'B15', 'B16', 'E31', 'E32', 'E44', 'E45', 'E46'];
const SALES_CREDIT_NOTE_NCF = ['B04', 'E34'];
const SALES_DEBIT_NOTE_NCF = ['B03', 'E33'];
// Compras donde el comprobante lo emite la empresa (proveedor informal, gasto menor, pago al exterior)
const SELF_ISSUED_PURCHASE_NCF = ['B11', 'B13', 'B17', 'E41', 'E43', 'E47'];
/**
 * Los e-NCF (serie E) los firma y envía a la DGII el proveedor de facturación electrónica. Sin
 * conexión con él no se toma un e-NCF de la secuencia local: sería un número que la DGII nunca
 * recibió (PLAN-v0.3 §7.1). Se emite en el portal del proveedor y se importa el XML.
 */
const isElectronic = (ncfType: string | null | undefined) => !!ncfType && ncfType.startsWith('E');
/** Opciones internas, nunca del cliente: la importación de XML trae el e-NCF ya emitido por el proveedor. */
export interface IssueOptions {
  assignedNcf?: string;
}
const ECF_NOT_CONNECTED =
  'Para emitir e-CF desde el sistema falta conectar tu proveedor de facturación electrónica. ' +
  'Mientras tanto, emítelo en su portal e importa el XML aquí.';

/**
 * Montos de entrada: number (viene del JSON del cliente) o Decimal (viene de la BD).
 * Un borrador guardado NUNCA se pasa por Number(): un double pierde precisión desde ~16 dígitos
 * y editar o emitir cambiaría centavos en silencio.
 */
type Amount = Dec | number | string;
interface DocLine {
  description: string;
  quantity: Amount;
  unitPrice: Amount;
  discount?: Amount | null;
  taxRateId?: string;
  accountId?: string;
  costCenterId?: string;
}
interface DocWithholding {
  taxRateId: string;
  base?: Amount | null;
}

/** Estado de entrada (de un DTO o de un borrador guardado) para calcular el documento. */
interface DocInput {
  type: InvoiceType;
  partnerId: string;
  issueDate: Date;
  dueDate?: Date | null;
  currency?: string | null;
  exchangeRate?: Amount | null;
  ncfType?: string | null;
  ncf?: string | null;
  relatedInvoiceId?: string | null;
  dgiiExpenseType?: string | null;
  dgiiIncomeType?: string | null;
  notes?: string | null;
  lines: DocLine[];
  withholdings: DocWithholding[];
}

@Injectable()
export class InvoicingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ncf: NcfService,
    private readonly sequences: DocumentSequencesService,
    private readonly settings: AccountingSettingsService,
    private readonly posting: PostingService,
    private readonly fiscal: FiscalParametersService,
    private readonly calendar: FiscalCalendarService,
  ) {}

  // ------------------------------------------------------------------
  // Cálculo y validación del documento (compartido por crear/editar)
  // ------------------------------------------------------------------
  private async build(tx: Tx, user: AuthUser, input: DocInput) {
    const { companyId } = user;
    const company = await tx.company.findUniqueOrThrow({ where: { id: companyId } });

    const partner = await tx.partner.findFirst({ where: { id: input.partnerId, companyId } });
    if (!partner) throw new NotFoundException('Tercero no encontrado');
    if (!partner.active) throw new UnprocessableEntityException('El tercero está inactivo');

    // Lado del documento: ventas o compras (las notas heredan el de la factura que modifican)
    let side: Side;
    // N2: fecha de los parámetros fiscales; las notas heredan la de la factura que modifican (PLAN-v0.3 §5.2)
    let taxDate = input.issueDate;
    if (input.type === InvoiceType.SALE) side = 'SALES';
    else if (input.type === InvoiceType.PURCHASE) side = 'PURCHASES';
    else {
      if (!input.relatedInvoiceId) throw new BadRequestException('Las notas de crédito/débito requieren relatedInvoiceId');
      const related = await tx.invoice.findFirst({ where: { id: input.relatedInvoiceId, companyId } });
      if (!related) throw new NotFoundException('Factura relacionada no encontrada');
      if (related.type !== InvoiceType.SALE && related.type !== InvoiceType.PURCHASE) {
        throw new UnprocessableEntityException('Una nota solo puede modificar una factura de venta o compra');
      }
      if (related.status === InvoiceStatus.DRAFT || related.status === InvoiceStatus.VOIDED) {
        throw new UnprocessableEntityException('La factura relacionada debe estar emitida y no anulada');
      }
      if (related.partnerId !== partner.id) throw new UnprocessableEntityException('La nota debe ser del mismo tercero que la factura relacionada');
      // El tope "la nota no excede la factura" compara totales: solo tiene sentido en la misma moneda
      if ((input.currency ?? company.baseCurrency) !== related.currency) {
        throw new UnprocessableEntityException(`La nota debe estar en la misma moneda que la factura que modifica (${related.currency})`);
      }
      side = related.type === InvoiceType.SALE ? 'SALES' : 'PURCHASES';
      taxDate = related.issueDate;
    }
    const okPartner = side === 'SALES'
      ? partner.type !== PartnerType.SUPPLIER
      : partner.type !== PartnerType.CUSTOMER;
    if (!okPartner) throw new UnprocessableEntityException(side === 'SALES' ? 'El tercero no es cliente' : 'El tercero no es proveedor');

    // Moneda y tasa
    const currency = input.currency ?? company.baseCurrency;
    let exchangeRate = D(1);
    if (currency !== company.baseCurrency) {
      if (input.exchangeRate) exchangeRate = D(input.exchangeRate);
      else {
        const found = await tx.exchangeRate.findFirst({
          where: { companyId, fromCurrency: currency, toCurrency: company.baseCurrency, date: { lte: input.issueDate } },
          orderBy: { date: 'desc' },
        });
        if (!found) throw new UnprocessableEntityException(`Falta la tasa de cambio ${currency}→${company.baseCurrency}`);
        exchangeRate = found.rate;
      }
    }

    if (input.ncf && !isValidNcfFormat(input.ncf)) throw new UnprocessableEntityException('Formato de NCF inválido');
    if (input.ncfType && !NCF_TYPE_REGEX.test(input.ncfType)) throw new UnprocessableEntityException(`Tipo de comprobante inválido: ${input.ncfType}`);

    // Cuentas y centros de costo de las líneas: de esta empresa y utilizables. Antes solo se
    // revisaban al emitir (las cuentas) o nunca (los centros de costo, que podían ser de otra empresa).
    const accountIds = [...new Set(input.lines.map((l) => l.accountId).filter((x): x is string => !!x))];
    if (accountIds.length) {
      const accounts = await tx.account.findMany({ where: { companyId, id: { in: accountIds } } });
      if (accounts.length !== accountIds.length) throw new NotFoundException('Alguna cuenta contable de las líneas no existe');
      const bad = accounts.filter((a) => !a.active || !a.isPostable);
      if (bad.length) throw new UnprocessableEntityException(`Cuentas inactivas o que no admiten movimientos: ${bad.map((a) => a.code).join(', ')}`);
    }
    const costCenterIds = [...new Set(input.lines.map((l) => l.costCenterId).filter((x): x is string => !!x))];
    if (costCenterIds.length) {
      const found = await tx.costCenter.count({ where: { companyId, id: { in: costCenterIds }, active: true } });
      if (found !== costCenterIds.length) throw new NotFoundException('Centro de costo no encontrado o inactivo');
    }

    // Impuestos usados
    const taxIds = [...new Set([...input.lines.map((l) => l.taxRateId), ...input.withholdings.map((w) => w.taxRateId)].filter((x): x is string => !!x))];
    const taxes = await tx.taxRate.findMany({ where: { companyId, id: { in: taxIds } } });
    const taxById = new Map(taxes.map((t) => [t.id, t]));
    const appliesOk = (a: string) => a === 'BOTH' || (side === 'SALES' ? a === 'SALES' : a === 'PURCHASES');
    for (const id of taxIds) {
      const t = taxById.get(id);
      if (!t) throw new NotFoundException('Impuesto no encontrado');
      if (!t.active) throw new UnprocessableEntityException(`El impuesto "${t.name}" está inactivo`);
      if (!appliesOk(t.appliesTo)) throw new UnprocessableEntityException(`El impuesto "${t.name}" no aplica a ${side === 'SALES' ? 'ventas' : 'compras'}`);
    }
    // N2 (R9): un impuesto enlazado toma la tasa y la base del parámetro vigente en la fecha del documento
    const linked = new Map<string, { rate: Prisma.Decimal; base: 'ITBIS' | 'SUBTOTAL' | 'TOTAL' | null; parameterId: string }>();
    for (const t of taxes.filter((x) => x.parameterKey)) {
      const p = await this.fiscal.numberAt(t.parameterKey!, taxDate, tx);
      TaxLinksService.assertCompatible(t, p);
      linked.set(t.id, { rate: p.value, base: p.base, parameterId: p.id });
    }
    const rateOf = (t: { id: string; rate: Prisma.Decimal }) => linked.get(t.id)?.rate ?? t.rate;

    // Líneas
    let subtotal = ZERO, discountTotal = ZERO, taxTotal = ZERO;
    const lines = input.lines.map((l) => {
      const gross = D(l.quantity).times(D(l.unitPrice));
      const discount = D(l.discount);
      if (discount.gt(gross)) throw new UnprocessableEntityException(`El descuento de "${l.description}" excede el monto de la línea`);
      const net = r2(gross.minus(discount));
      let taxAmount = ZERO;
      if (l.taxRateId) {
        const t = taxById.get(l.taxRateId)!;
        if (t.isWithholding) throw new UnprocessableEntityException('Las retenciones van en `withholdings`, no en las líneas');
        taxAmount = r2(net.times(rateOf(t)).div(100));
      }
      subtotal = subtotal.plus(net); discountTotal = discountTotal.plus(discount); taxTotal = taxTotal.plus(taxAmount);
      return {
        description: l.description, quantity: D(l.quantity), unitPrice: D(l.unitPrice), discount: r2(discount),
        taxRateId: l.taxRateId ?? null, taxAmount, total: net, // total = neto sin impuesto
        appliedRate: l.taxRateId ? rateOf(taxById.get(l.taxRateId)!) : null, fiscalParameterId: l.taxRateId ? (linked.get(l.taxRateId)?.parameterId ?? null) : null,
        accountId: l.accountId ?? null, costCenterId: l.costCenterId ?? null,
      };
    });

    // Retenciones
    let withholdingTotal = ZERO;
    const withholdings = input.withholdings.map((w) => {
      const t = taxById.get(w.taxRateId)!;
      if (!t.isWithholding) throw new UnprocessableEntityException(`"${t.name}" no es una retención`);
      const link = linked.get(t.id);
      // Enlazado: la base la manda el parámetro (se ignora la que envía el cliente o guardó el borrador)
      const base = link?.base === 'ITBIS' ? taxTotal : link?.base === 'SUBTOTAL' ? subtotal : link?.base === 'TOTAL' ? subtotal.plus(taxTotal)
        : w.base !== undefined ? D(w.base) : t.type === 'ITBIS_WITHHOLDING' ? taxTotal : subtotal;
      const amount = r2(base.times(rateOf(t)).div(100));
      withholdingTotal = withholdingTotal.plus(amount);
      return { taxRateId: t.id, base: r2(base), amount, appliedRate: rateOf(t), fiscalParameterId: link?.parameterId ?? null };
    });

    subtotal = r2(subtotal); taxTotal = r2(taxTotal);
    const total = subtotal.plus(taxTotal);
    if (withholdingTotal.gt(total)) throw new UnprocessableEntityException('Las retenciones exceden el total del documento');
    if (total.lte(0)) throw new UnprocessableEntityException('El total del documento debe ser mayor a cero');

    const dueDate = input.dueDate ?? new Date(input.issueDate.getTime() + partner.paymentTermsDays * 86_400_000);

    return {
      side, partner, taxById, lines, withholdings,
      header: {
        partnerId: partner.id, type: input.type, issueDate: input.issueDate, dueDate,
        currency, exchangeRate,
        ncf: input.ncf ?? null, ncfType: input.ncfType ?? null,
        relatedInvoiceId: input.relatedInvoiceId ?? null,
        dgiiExpenseType: input.dgiiExpenseType ?? null, dgiiIncomeType: input.dgiiIncomeType ?? null,
        notes: input.notes ?? null,
        subtotal, discountTotal: r2(discountTotal), taxTotal, withholdingTotal, total,
        // Saldo pendiente = lo que realmente se cobra/paga (neto de retenciones)
        balance: total.minus(withholdingTotal), amountPaid: ZERO,
      },
    };
  }

  private async persistChildren(tx: Tx, invoiceId: string, built: Awaited<ReturnType<InvoicingService['build']>>) {
    await tx.invoiceLine.createMany({ data: built.lines.map((l) => ({ ...l, invoiceId })) });
    if (built.withholdings.length) {
      await tx.invoiceWithholding.createMany({ data: built.withholdings.map((w) => ({ ...w, invoiceId })) });
    }
  }

  // ------------------------------------------------------------------
  // Crear / editar / eliminar borradores
  // ------------------------------------------------------------------
  async create(dto: CreateInvoiceDto, user: AuthUser) {
    // Mismo origen ya facturado: 409 antes de validar nada (si algo cambió entre intentos, un 422 confundiría)
    if (dto.type === InvoiceType.SALE && dto.sourceModule && dto.sourceId) {
      const prev = (await this.findBySource(this.prisma, user.companyId, dto.sourceModule, [dto.sourceId]))
        .find((f) => f.type === InvoiceType.SALE && f.status !== InvoiceStatus.VOIDED);
      if (prev) throw new ConflictException({ message: `Ya existe la factura ${prev.number} para ese origen`, existingId: prev.id });
    }
    try {
      const id = await this.prisma.$transaction((tx) => this.createInTx(tx, dto, user));
      return this.get(id, user);
    } catch (e) {
      // Llave natural (INTEGRACION-TALLER §4.4): el mismo origen ya tiene una venta que no está anulada.
      // Se responde 409 con su id para que el otro sistema la lea y la tome como hecha.
      if (dto.sourceModule && dto.sourceId && isUniqueViolation(e)) {
        const existing = (await this.findBySource(this.prisma, user.companyId, dto.sourceModule, [dto.sourceId]))
          .find((f) => f.type === InvoiceType.SALE && f.status !== InvoiceStatus.VOIDED);
        if (existing) {
          throw new ConflictException({ message: `Ya existe la factura ${existing.number} para ese origen`, existingId: existing.id });
        }
      }
      throw e;
    }
  }

  /**
   * Crea (y si `issueNow`, emite) dentro de una transacción ajena: así quien llama puede guardar
   * algo más en la misma transacción (p. ej. el EcfDocument de una importación). Devuelve el id.
   */
  async createInTx(tx: Tx, dto: CreateInvoiceDto, user: AuthUser, opts: IssueOptions = {}) {
    if (!!dto.sourceModule !== !!dto.sourceId) throw new BadRequestException('sourceModule y sourceId van juntos');
    const built = await this.build(tx, user, {
      ...dto, issueDate: new Date(dto.issueDate), dueDate: dto.dueDate ? new Date(dto.dueDate) : null,
      withholdings: dto.withholdings ?? [],
    });
    const inv = await tx.invoice.create({
      data: {
        ...built.header, companyId: user.companyId, number: `BORR-${randomUUID().slice(0, 8)}`, status: InvoiceStatus.DRAFT, createdById: user.id,
        sourceModule: dto.sourceModule ?? null, sourceId: dto.sourceId ?? null,
      },
    });
    await this.persistChildren(tx, inv.id, built);
    await writeAudit(tx, user, 'Invoice', inv.id, AuditAction.CREATE, { type: inv.type, total: inv.total.toString() });
    if (dto.issueNow) await this.issueTx(tx, inv.id, {}, user, opts);
    return inv.id;
  }

  async update(id: string, dto: UpdateInvoiceDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const cur = await tx.invoice.findFirst({ where: { id, companyId: user.companyId }, include: { lines: true, withholdings: true } });
      if (!cur) throw new NotFoundException('Factura no encontrada');
      if (cur.status !== InvoiceStatus.DRAFT) throw new UnprocessableEntityException('Solo se pueden editar borradores');

      const built = await this.build(tx, user, {
        type: cur.type,
        partnerId: dto.partnerId ?? cur.partnerId,
        issueDate: dto.issueDate ? new Date(dto.issueDate) : cur.issueDate,
        dueDate: dto.dueDate ? new Date(dto.dueDate) : dto.issueDate || dto.partnerId ? null : cur.dueDate,
        currency: dto.currency ?? cur.currency,
        exchangeRate: dto.exchangeRate ?? (dto.currency ? null : cur.exchangeRate),
        ncfType: dto.ncfType ?? cur.ncfType, ncf: dto.ncf ?? cur.ncf,
        relatedInvoiceId: dto.relatedInvoiceId ?? cur.relatedInvoiceId,
        dgiiExpenseType: dto.dgiiExpenseType ?? cur.dgiiExpenseType,
        dgiiIncomeType: dto.dgiiIncomeType ?? cur.dgiiIncomeType,
        notes: dto.notes ?? cur.notes,
        lines: dto.lines ?? cur.lines.map((l) => ({
          description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount,
          taxRateId: l.taxRateId ?? undefined, accountId: l.accountId ?? undefined, costCenterId: l.costCenterId ?? undefined,
        })),
        withholdings: dto.withholdings ?? cur.withholdings.map((w) => ({ taxRateId: w.taxRateId, base: w.base })),
      });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceWithholding.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.update({ where: { id, companyId: user.companyId }, data: built.header });
      await this.persistChildren(tx, id, built);
      await writeAudit(tx, user, 'Invoice', id, AuditAction.UPDATE, { total: built.header.total.toString() });
    });
    return this.get(id, user);
  }

  async remove(id: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.invoice.findFirst({ where: { id, companyId: user.companyId } });
      if (!res) throw new NotFoundException('Factura no encontrada');
      if (res.status !== InvoiceStatus.DRAFT) throw new UnprocessableEntityException('Solo se eliminan borradores; una emitida se anula');
      await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
      await tx.invoiceWithholding.deleteMany({ where: { invoiceId: id } });
      await tx.invoice.delete({ where: { id, companyId: user.companyId } });
      await writeAudit(tx, user, 'Invoice', id, AuditAction.DELETE, { number: res.number });
    });
    return { deleted: true };
  }

  // ------------------------------------------------------------------
  // Emitir: número + NCF + asiento contable, todo en una transacción
  // ------------------------------------------------------------------
  async issue(id: string, dto: IssueInvoiceDto, user: AuthUser) {
    await this.prisma.$transaction((tx) => this.issueTx(tx, id, dto, user));
    return this.get(id, user);
  }

  private async issueTx(tx: Tx, id: string, dto: IssueInvoiceDto, user: AuthUser, opts: IssueOptions = {}) {
    const { companyId } = user;
    // Si dos usuarios emiten a la vez, solo uno pasa de DRAFT a ISSUED
    const claimed = await tx.invoice.updateMany({ where: { id, companyId, status: InvoiceStatus.DRAFT }, data: { status: InvoiceStatus.ISSUED } });
    if (claimed.count === 0) {
      const exists = await tx.invoice.findFirst({ where: { id, companyId } });
      if (!exists) throw new NotFoundException('Factura no encontrada');
      throw new ConflictException(`La factura ya está ${exists.status}`);
    }

    const inv = await tx.invoice.findUniqueOrThrow({
      where: { id }, include: { lines: true, withholdings: true, partner: true, relatedInvoice: true },
    });
    // Se recalcula contra el estado actual de maestros (impuestos, tercero, tasas)
    const built = await this.build(tx, user, {
      type: inv.type, partnerId: inv.partnerId, issueDate: inv.issueDate, dueDate: inv.dueDate,
      currency: inv.currency, exchangeRate: inv.exchangeRate, ncfType: dto.ncfType ?? inv.ncfType, ncf: dto.ncf ?? inv.ncf,
      relatedInvoiceId: inv.relatedInvoiceId, dgiiExpenseType: inv.dgiiExpenseType, dgiiIncomeType: inv.dgiiIncomeType, notes: inv.notes,
      lines: inv.lines.map((l) => ({
        description: l.description, quantity: l.quantity, unitPrice: l.unitPrice, discount: l.discount,
        taxRateId: l.taxRateId ?? undefined, accountId: l.accountId ?? undefined, costCenterId: l.costCenterId ?? undefined,
      })),
      withholdings: inv.withholdings.map((w) => ({ taxRateId: w.taxRateId, base: w.base })),
    });
    const { side, partner } = built;
    const reversed = inv.type === InvoiceType.CREDIT_NOTE;

    // --- Comprobante fiscal ---
    let ncf = built.header.ncf;
    let ncfType = built.header.ncfType;
    if (side === 'SALES') {
      const isNote = inv.type === InvoiceType.CREDIT_NOTE || inv.type === InvoiceType.DEBIT_NOTE;
      const relatedNcf = inv.relatedInvoice?.ncf ?? null;
      const electronic = relatedNcf?.startsWith('E');
      ncfType ??= isNote
        ? (inv.type === InvoiceType.CREDIT_NOTE ? (electronic ? 'E34' : 'B04') : (electronic ? 'E33' : 'B03'))
        : partner.defaultNcfType;
      if (!ncfType) throw new UnprocessableEntityException('Indica el tipo de comprobante (ncfType): B01, B02...');
      const allowed = inv.type === InvoiceType.CREDIT_NOTE ? SALES_CREDIT_NOTE_NCF
        : inv.type === InvoiceType.DEBIT_NOTE ? SALES_DEBIT_NOTE_NCF : SALES_NCF;
      if (!allowed.includes(ncfType)) {
        throw new UnprocessableEntityException(`El comprobante ${ncfType} no corresponde a ${LABEL[inv.type].toLowerCase()}; usa ${allowed.join(', ')}`);
      }
      // Un e-CF solo se corrige con nota electrónica (E33/E34). Al revés sí se puede: pasado el fin de
      // las B, una E34 corrige una B01 (PLAN-v0.3 §4.2, N1)
      if (isNote && relatedNcf?.startsWith('E') && !isElectronic(ncfType)) {
        throw new UnprocessableEntityException(`La factura original tiene ${relatedNcf}: la nota debe ser de la serie E`);
      }
      if ((ncfType === 'B01' || ncfType === 'E31') && !partner.taxId) {
        throw new UnprocessableEntityException('El crédito fiscal requiere que el cliente tenga RNC/cédula');
      }
      // N5 (D24): pasado el último día de las B de la clasificación (fecha de la factura o de hoy) → solo e-CF
      if (!isElectronic(ncfType)) await this.calendar.assertBAllowed(tx, companyId, ncfType, inv.issueDate);
      ncf = isElectronic(ncfType)
        ? await this.electronicNcf(tx, companyId, ncfType, inv.issueDate, opts)
        : (await this.ncf.consumeNext(tx, companyId, ncfType, inv.issueDate)).ncf;
    } else if (ncf) {
      ncfType = ncf.slice(0, 3);
      if (SELF_ISSUED_PURCHASE_NCF.includes(ncfType)) {
        throw new UnprocessableEntityException(isElectronic(ncfType) ? ECF_NOT_CONNECTED : `El ${ncfType} lo emites tú: elige el tipo y deja el NCF vacío`);
      }
      const dup = await tx.invoice.findFirst({
        where: { companyId, partnerId: partner.id, ncf, id: { not: id }, status: { not: InvoiceStatus.VOIDED } },
      });
      if (dup) throw new ConflictException(`El NCF ${ncf} ya está registrado para este proveedor (${dup.number})`);
    } else if (ncfType && SELF_ISSUED_PURCHASE_NCF.includes(ncfType)) {
      // Proveedor informal / gasto menor / pago al exterior: el comprobante lo emite la empresa
      ncf = isElectronic(ncfType)
        ? await this.electronicNcf(tx, companyId, ncfType, inv.issueDate, opts)
        : (await this.ncf.consumeNext(tx, companyId, ncfType, inv.issueDate)).ncf;
    } else {
      throw new UnprocessableEntityException('Las compras requieren el NCF del proveedor (o ncfType B11/B13/B17 si lo emites tú)');
    }

    // --- Límite de crédito (ventas a crédito) ---
    if (side === 'SALES' && !reversed && partner.creditLimit) {
      // El límite está en moneda base: cada saldo se convierte con su tasa (antes se sumaban USD con DOP)
      const open = await tx.invoice.findMany({
        where: { companyId, partnerId: partner.id, id: { not: id }, status: { in: OPEN_STATUSES }, type: { in: [InvoiceType.SALE, InvoiceType.DEBIT_NOTE] } },
        select: { balance: true, exchangeRate: true },
      });
      const openBase = open.reduce((s, o) => s.plus(o.balance.times(o.exchangeRate)), ZERO);
      if (openBase.plus(built.header.balance.times(built.header.exchangeRate)).gt(partner.creditLimit)) {
        throw new UnprocessableEntityException(`Excede el límite de crédito de ${partner.name} (${partner.creditLimit.toString()})`);
      }
    }

    // --- Una nota de crédito no puede exceder la factura original ---
    if (reversed && inv.relatedInvoice) {
      const others = await tx.invoice.aggregate({
        where: { companyId, relatedInvoiceId: inv.relatedInvoiceId, type: InvoiceType.CREDIT_NOTE, id: { not: id }, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOIDED] } },
        _sum: { total: true },
      });
      if (D(others._sum.total).plus(built.header.total).gt(inv.relatedInvoice.total)) {
        throw new UnprocessableEntityException('Las notas de crédito exceden el total de la factura original');
      }
    }

    // --- Número interno ---
    const number = await this.sequences.next(tx, companyId, DOC_TYPE[inv.type]);

    // --- Asiento contable ---
    const entry = await this.postEntry(tx, user, { inv: { ...inv, number }, built, reversed });

    await tx.invoice.update({
      where: { id, companyId: user.companyId },
      data: { ...built.header, number, ncf, ncfType, status: InvoiceStatus.ISSUED, issuedAt: new Date(), journalEntryId: entry.id },
    });
    // Los renglones calculados al emitir reemplazan a los del borrador (misma data, impuestos actualizados)
    await tx.invoiceLine.deleteMany({ where: { invoiceId: id } });
    await tx.invoiceWithholding.deleteMany({ where: { invoiceId: id } });
    await this.persistChildren(tx, id, built);
    // N7 (A9): e-CF emitido desde el sistema → documento PENDING_SEND en la MISMA transacción; lo envía la cola
    if (ncfType && isElectronic(ncfType) && !opts.assignedNcf) {
      const company = await tx.company.findUniqueOrThrow({ where: { id: companyId }, select: { taxId: true } });
      const conn = await tx.ecfConnection.findUnique({ where: { companyId }, select: { providerCode: true } });
      await tx.ecfDocument.create({
        data: {
          companyId, invoiceId: id, ecfType: ncfType.slice(1), eNcf: ncf ?? `PEND-${id}`, status: 'PENDING_SEND', origin: 'EMITTED',
          verification: 'VERIFIED', issuerRnc: company.taxId, providerCode: conn?.providerCode ?? null,
        },
      });
    }
    await writeAudit(tx, user, 'Invoice', id, AuditAction.POST, { number, ncf, total: built.header.total.toString(), entry: entry.number });
  }

  /**
   * e-NCF propio: el que trae la importación (emitido en el portal) o, con conexión activa con el proveedor (N7), el de
   * nuestra secuencia E (numeración OURS) o ninguno todavía (numeración PROVIDER: llega con la respuesta).
   */
  private async electronicNcf(tx: Tx, companyId: string, ncfType: string, issueDate: Date, opts: IssueOptions): Promise<string | null> {
    if (opts.assignedNcf) return this.assigned(ncfType, opts);
    const conn = await tx.ecfConnection.findUnique({ where: { companyId } });
    if (!conn?.active || !conn.ecfTypes.includes(ncfType)) throw new UnprocessableEntityException(ECF_NOT_CONNECTED);
    if (conn.numbering === 'PROVIDER') return null;
    return (await this.ncf.consumeNext(tx, companyId, ncfType, issueDate)).ncf;
  }

  /**
   * Arma el asiento. Las líneas "de detalle" (ingreso/gasto, impuestos, retenciones)
   * se convierten a moneda base una por una; la línea de CxC/CxP se calcula por
   * diferencia, así el asiento siempre cuadra aunque el redondeo mueva centavos.
   */
  private async postEntry(
    tx: Tx, user: AuthUser,
    p: { inv: { id: string; number: string; type: InvoiceType; issueDate: Date; currency: string }; built: Awaited<ReturnType<InvoicingService['build']>>; reversed: boolean },
  ) {
    const { built, reversed, inv } = p;
    const sales = built.side === 'SALES';
    const cfg = await this.settings.require(user.companyId, [
      sales ? 'receivableAccountId' : 'payableAccountId',
      sales ? 'salesIncomeAccountId' : 'purchaseExpenseAccountId',
    ] as const);
    const control = sales ? cfg.receivableAccountId : cfg.payableAccountId;
    const defaultAccount = sales ? cfg.salesIncomeAccountId : cfg.purchaseExpenseAccountId;
    const rate = built.header.exchangeRate;
    const foreign = !rate.equals(1);

    // Montos en moneda del documento, agrupados por cuenta (orientación "normal")
    type Item = { accountId: string; amount: Dec; dr: boolean; costCenterId?: string; description: string };
    const items = new Map<string, Item>();
    const add = (accountId: string, amount: Dec, dr: boolean, description: string, costCenterId?: string) => {
      if (amount.lte(0)) return;
      const key = `${accountId}|${costCenterId ?? ''}|${dr}`;
      const cur = items.get(key);
      if (cur) cur.amount = cur.amount.plus(amount);
      else items.set(key, { accountId, amount, dr, costCenterId, description });
    };
    const detailDr = !sales; // ventas: ingreso al crédito; compras: gasto al débito

    for (const l of built.lines) add(l.accountId ?? defaultAccount, l.total, detailDr, 'Detalle', l.costCenterId ?? undefined);
    for (const l of built.lines) {
      if (!l.taxRateId || l.taxAmount.lte(0)) continue;
      const t = built.taxById.get(l.taxRateId)!;
      const acc = sales ? t.salesAccountId : t.purchaseAccountId;
      if (!acc) throw new UnprocessableEntityException(`Configura la cuenta contable del impuesto "${t.name}"`);
      add(acc, l.taxAmount, detailDr, t.name);
    }
    for (const w of built.withholdings) {
      const t = built.taxById.get(w.taxRateId)!;
      const acc = sales ? t.salesAccountId : t.purchaseAccountId;
      if (!acc) throw new UnprocessableEntityException(`Configura la cuenta contable de la retención "${t.name}"`);
      add(acc, w.amount, !detailDr, t.name); // la retención va al lado opuesto del detalle
    }

    const lines: PostLine[] = [];
    let netDr = ZERO; // Σ débitos − Σ créditos de las líneas de detalle (en base)
    for (const it of items.values()) {
      const dr = reversed ? !it.dr : it.dr;
      const base = r2(it.amount.times(rate));
      netDr = dr ? netDr.plus(base) : netDr.minus(base);
      lines.push({
        accountId: it.accountId, debit: dr ? base : ZERO, credit: dr ? ZERO : base,
        costCenterId: it.costCenterId, description: it.description,
        ...(foreign ? { currency: inv.currency, exchangeRate: rate, amountForeign: dr ? it.amount : it.amount.neg() } : {}),
      });
    }
    // Línea de control (CxC/CxP) por diferencia
    const controlDr = netDr.lt(0);
    const controlBase = netDr.abs();
    const controlForeign = built.header.balance;
    lines.push({
      accountId: control, debit: controlDr ? controlBase : ZERO, credit: controlDr ? ZERO : controlBase,
      partnerId: built.partner.id, description: `${sales ? 'CxC' : 'CxP'} ${inv.number}`,
      ...(foreign ? { currency: inv.currency, exchangeRate: rate, amountForeign: controlDr ? controlForeign : controlForeign.neg() } : {}),
    });

    return this.posting.post(tx, user, {
      date: inv.issueDate,
      description: `${LABEL[inv.type]} ${inv.number} - ${built.partner.name}`,
      reference: inv.number,
      journalType: sales ? JournalType.SALES : JournalType.PURCHASES,
      sourceType: SourceDocumentType.INVOICE,
      sourceId: inv.id,
      currency: inv.currency,
      exchangeRate: rate,
      lines,
    });
  }

  // ------------------------------------------------------------------
  // Anular
  // ------------------------------------------------------------------
  async void(id: string, dto: VoidInvoiceDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const inv = await tx.invoice.findFirst({ where: { id, companyId: user.companyId } });
      if (!inv) throw new NotFoundException('Factura no encontrada');
      if (inv.status === InvoiceStatus.DRAFT) throw new UnprocessableEntityException('Un borrador se elimina, no se anula');
      if (inv.status === InvoiceStatus.VOIDED) throw new ConflictException('La factura ya está anulada');
      // R2/D34: un e-CF o una factura de un mes cerrado no se anulan; se corrigen con nota de crédito
      const ecf = inv.ncf?.startsWith('E') ? await tx.ecfDocument.findUnique({ where: { invoiceId: id }, select: { status: true } }) : null;
      // Un e-CF RECHAZADO por la DGII nunca tuvo validez: ese sí se anula (N7)
      if (inv.ncf?.startsWith('E') && ecf?.status !== 'REJECTED') {
        throw new UnprocessableEntityException(
          'Esta factura es electrónica (e-CF). No se anula: corrígela con una nota de crédito (Ley 32-23, art. 7)',
        );
      }
      try {
        await this.posting.assertPeriodOpen(tx, user.companyId, inv.issueDate);
      } catch (e) {
        if (!(e instanceof UnprocessableEntityException)) throw e;
        throw new UnprocessableEntityException('Esta factura es de un mes cerrado. No se anula: corrígela con una nota de crédito');
      }
      // N6 (§4.2): mes ya declarado (presentación marcada o vencimiento del 607 pasado): anularla cambiaría lo presentado
      if (inv.ncf && (await this.calendar.isMonthDeclared(user.companyId, inv.issueDate, tx))) {
        throw new UnprocessableEntityException('Esta factura es de un mes ya declarado a la DGII. No se anula: corrígela con una nota de crédito');
      }
      const allocations = await tx.paymentAllocation.count({ where: { invoiceId: id, payment: { status: { not: 'VOIDED' } } } });
      if (inv.amountPaid.gt(0) || allocations > 0) {
        throw new UnprocessableEntityException('Tiene pagos aplicados: anula primero los pagos');
      }
      const selfIssued = SELF_ISSUED_PURCHASE_NCF.includes(inv.ncfType ?? '');
      const ownNcf = !!inv.ncf && (selfIssued || (inv.type !== InvoiceType.PURCHASE && !(await this.isSupplierNcf(tx, inv))));
      if (ownNcf && !dto.reasonCode) throw new BadRequestException('reasonCode (01-10) es obligatorio para anular un comprobante emitido');

      const res = await tx.invoice.updateMany({
        where: { id, companyId: user.companyId, status: { in: OPEN_STATUSES } },
        data: { status: InvoiceStatus.VOIDED, voidedAt: new Date(), voidReason: dto.reason, voidReasonCode: dto.reasonCode ?? null, balance: ZERO },
      });
      if (res.count === 0) throw new ConflictException('El estado de la factura cambió; reintenta');
      if (inv.journalEntryId) await this.posting.voidEntry(tx, user, inv.journalEntryId, `Anulación ${inv.number}: ${dto.reason}`);
      await writeAudit(tx, user, 'Invoice', id, AuditAction.VOID, { reason: dto.reason, reasonCode: dto.reasonCode ?? null, ncf: inv.ncf });
    });
    return this.get(id, user);
  }

  /** e-NCF propio: solo existe si lo trae la importación (ya emitido en el portal del proveedor). */
  private assigned(ncfType: string, opts: IssueOptions): string {
    if (!opts.assignedNcf) throw new UnprocessableEntityException(ECF_NOT_CONNECTED);
    if (opts.assignedNcf.slice(0, 3) !== ncfType) throw new UnprocessableEntityException(`El e-NCF ${opts.assignedNcf} no es del tipo ${ncfType}`);
    return opts.assignedNcf;
  }

  /** Una nota/factura de venta siempre usa NCF propio; esto solo distingue compras con NCF del proveedor. */
  private async isSupplierNcf(tx: Tx, inv: { partnerId: string; relatedInvoiceId: string | null; type: InvoiceType }) {
    if (inv.type === InvoiceType.SALE) return false;
    if (!inv.relatedInvoiceId) return false;
    const rel = await tx.invoice.findUnique({ where: { id: inv.relatedInvoiceId }, select: { type: true } });
    return rel?.type === InvoiceType.PURCHASE;
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------
  /**
   * Facturas de un origen (contrato de verticales §4.4). `effective` = la factura vale: emitida, no
   * anulada y no cubierta por completo con notas de crédito. Así el otro sistema no guarda estado:
   * si deja de valer, vuelve a facturar con el siguiente intento.
   */
  async findBySource(db: Tx | PrismaService, companyId: string, sourceModule: string, sourceIds: string[]) {
    const rows = await db.invoice.findMany({
      where: { companyId, sourceModule, sourceId: { in: sourceIds } },
      select: {
        id: true, number: true, ncf: true, type: true, status: true, issueDate: true, total: true, balance: true,
        sourceModule: true, sourceId: true,
        relatedDocuments: { select: { id: true, number: true, ncf: true, type: true, status: true, total: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
    const live = (st: InvoiceStatus) => st !== InvoiceStatus.DRAFT && st !== InvoiceStatus.VOIDED;
    return rows.map(({ relatedDocuments, ...inv }) => {
      const notes = relatedDocuments.filter((n) => live(n.status));
      const creditedTotal = notes.filter((n) => n.type === InvoiceType.CREDIT_NOTE).reduce((acc, n) => acc.plus(n.total), ZERO);
      return { ...inv, creditedTotal, effective: live(inv.status) && creditedTotal.lt(inv.total), notes };
    });
  }

  async list(q: ListInvoicesQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.InvoiceWhereInput = {
      companyId: user.companyId, type: q.type, partnerId: q.partnerId,
      ...(q.overdue ? { status: { in: [InvoiceStatus.ISSUED, InvoiceStatus.PARTIALLY_PAID, InvoiceStatus.OVERDUE] }, dueDate: { lt: new Date() } } : { status: q.status }),
      ...(q.from || q.to ? { issueDate: { ...(q.from && { gte: startOfDay(q.from) }), ...(q.to && { lte: endOfDay(q.to) }) } } : {}),
      ...(q.q ? { OR: [{ number: { contains: q.q, mode: 'insensitive' } }, { ncf: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.invoice.findMany({
        where, include: { partner: { select: { id: true, name: true, taxId: true } } },
        orderBy: [{ issueDate: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.invoice.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string, user: AuthUser) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        partner: true, lines: { include: { taxRate: { select: { name: true, rate: true } } } },
        withholdings: { include: { taxRate: { select: { name: true, rate: true } } } },
        journalEntry: { select: { id: true, number: true, status: true } },
        relatedInvoice: { select: { id: true, number: true, ncf: true } },
        ecfDocument: { select: { status: true, origin: true, verification: true, eNcf: true, issuerRnc: true, createdAt: true } },
      },
    });
    if (!inv) throw new NotFoundException('Factura no encontrada');
    return inv;
  }
}