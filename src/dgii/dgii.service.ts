import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { InvoiceStatus, InvoiceType, PaymentMethod, PaymentStatus } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { ZERO } from '../reports/accounting-nature.utils.js';
import {
  CONSUMER_NCF, EXPENSE_TYPES, FIELD_SEPARATOR, GOODS_EXPENSE_TYPES, INCOME_TYPES,
  ISR_RETENTION_TYPES, LINE_BREAK, MAX_ROWS, MINOR_EXPENSE_NCF, PAYMENT_FORMS, SELF_ISSUED_PURCHASE_NCF,
  VOID_TYPES, code2, ymd,
} from './dgii.codes.js';
import { FiscalParametersService } from '../fiscal/fiscal-parameters.service.js';

type Dec = Prisma.Decimal;
type Side = 'SALES' | 'PURCHASES';
export type DgiiFormat = '606' | '607' | '608';

export interface DgiiIssue {
  invoiceId: string;
  invoiceNumber: string;
  ncf: string | null;
  message: string;
}

interface Period {
  label: string; // AAAAMM
  start: Date;
  end: Date;
}

const INVOICE_INCLUDE = {
  partner: true,
  relatedInvoice: { select: { id: true, ncf: true, dgiiExpenseType: true, dgiiIncomeType: true } },
  lines: { include: { taxRate: { select: { type: true } } } },
  withholdings: { include: { taxRate: { select: { type: true, dgiiCode: true } } } },
  paymentAllocations: { include: { payment: { select: { date: true, method: true, status: true } } } },
} satisfies Prisma.InvoiceInclude;
type Inv = Prisma.InvoiceGetPayload<{ include: typeof INVOICE_INCLUDE }>;

const m2 = (d: Dec) => d.toDecimalPlaces(2).toFixed(2);
const sum = (xs: Dec[]) => xs.reduce((s, x) => s.plus(x), ZERO);
const ncfPrefix = (ncf: string | null) => (ncf ?? '').slice(0, 3);
const D = (v: string | number | Dec) => new Prisma.Decimal(v);

/** Facts de una factura ya convertidos a la moneda base y a las categorías de la DGII. */
interface Facts {
  subtotal: Dec;
  total: Dec;
  itbis: Dec;
  isc: Dec;
  tip: Dec;
  other: Dec;
  itbisWithheld: Dec;
  isrWithheld: Dec;
  isrType: string;
  hasWithholding: boolean;
  settleDate: Date | null; // fecha en que quedó saldada (después de retenciones)
  paid: { cash: Dec; check: Dec; card: Dec };
  methods: Set<PaymentMethod>;
}

function factsOf(inv: Inv, asOf: Date | null): Facts {
  const rate = inv.exchangeRate;
  const c = (d: Dec) => d.times(rate).toDecimalPlaces(2);
  const taxOf = (type: string) =>
    c(sum(inv.lines.filter((l) => l.taxRate?.type === type).map((l) => l.taxAmount)));
  const wh = (type: string) => c(sum(inv.withholdings.filter((w) => w.taxRate.type === type).map((w) => w.amount)));
  const isrRate = inv.withholdings.find((w) => w.taxRate.type === 'ISR_WITHHOLDING');

  const allocs = inv.paymentAllocations
    .filter((a) => a.payment.status === PaymentStatus.POSTED && (!asOf || a.payment.date <= asOf))
    .sort((x, y) => x.payment.date.getTime() - y.payment.date.getTime());
  const target = inv.total.minus(inv.withholdingTotal);
  let cum = ZERO;
  let settleDate: Date | null = null;
  if (target.gt(0)) {
    for (const a of allocs) {
      cum = cum.plus(a.amount);
      if (cum.gte(target.minus(0.005))) {
        settleDate = a.payment.date;
        break;
      }
    }
  }
  const by = (...ms: PaymentMethod[]) => c(sum(allocs.filter((a) => ms.includes(a.payment.method)).map((a) => a.amount)));
  return {
    subtotal: c(inv.subtotal),
    total: c(inv.total),
    itbis: taxOf('ITBIS'),
    isc: taxOf('ISC'),
    tip: taxOf('PROPINA_LEGAL'),
    other: taxOf('OTHER'),
    itbisWithheld: wh('ITBIS_WITHHOLDING'),
    isrWithheld: wh('ISR_WITHHOLDING'),
    isrType: code2(isrRate?.taxRate.dgiiCode),
    hasWithholding: inv.withholdings.length > 0,
    settleDate,
    paid: { cash: by(PaymentMethod.CASH), check: by(PaymentMethod.BANK_TRANSFER, PaymentMethod.CHECK), card: by(PaymentMethod.CARD) },
    methods: new Set(allocs.map((a) => a.payment.method)),
  };
}

/** Totales del reporte: las notas de crédito restan, y las filas repetidas solo por retención no duplican montos. */
function totalsOf(rows: { kind: string; docType: string; [k: string]: string }[], amountKey: string) {
  const sgn = (r: { docType: string }) => (r.docType === InvoiceType.CREDIT_NOTE ? -1 : 1);
  const acc = (key: string, onlyOriginal: boolean) =>
    m2(sum(rows.filter((r) => !onlyOriginal || r.kind === 'ORIGINAL').map((r) => D(r[key]).times(sgn(r)))));
  return {
    totalInvoiced: acc(amountKey, true),
    itbis: acc('itbis', true),
    itbisWithheld: m2(sum(rows.map((r) => D(r.itbisWithheld)))),
    isrWithheld: m2(sum(rows.map((r) => D(r.isrWithheld)))),
  };
}

const idTypeOf = (p: { taxId: string | null; taxIdType: string | null }) =>
  !p.taxId ? '' : p.taxIdType === 'RNC' ? '1' : p.taxIdType === 'CEDULA' ? '2' : '3';

@Injectable()
export class DgiiService {
  constructor(private readonly prisma: PrismaService, private readonly fiscal: FiscalParametersService) {}

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  private parsePeriod(p: string): Period {
    const m = /^(\d{4})-?(0[1-9]|1[0-2])$/.exec(p);
    if (!m) throw new UnprocessableEntityException('period inválido');
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return { label: `${m[1]}${m[2]}`, start: new Date(Date.UTC(y, mo - 1, 1)), end: new Date(Date.UTC(y, mo, 1) - 1) };
  }

  private async company(user: AuthUser) {
    const c = await this.prisma.company.findUnique({ where: { id: user.companyId } });
    if (!c) throw new NotFoundException('Empresa no encontrada');
    return c;
  }

  private companyIssue(taxId: string | null): string[] {
    return taxId && /^(\d{9}|\d{11})$/.test(taxId)
      ? []
      : ['El RNC/cédula de la empresa (Company.taxId) debe tener 9 u 11 dígitos, sin guiones'];
  }

  private sideWhere(side: Side): Prisma.InvoiceWhereInput {
    const base = side === 'SALES' ? InvoiceType.SALE : InvoiceType.PURCHASE;
    return {
      OR: [
        { type: base },
        { type: { in: [InvoiceType.CREDIT_NOTE, InvoiceType.DEBIT_NOTE] }, relatedInvoice: { type: base } },
      ],
    };
  }

  /** Facturas del período + facturas anteriores con retenciones que se terminaron de pagar en el período. */
  private async load(side: Side, period: Period, user: AuthUser) {
    const issued = { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOIDED] };
    const [first, late] = await Promise.all([
      this.prisma.invoice.findMany({
        where: {
          companyId: user.companyId, status: issued,
          AND: [this.sideWhere(side)],
          issueDate: { gte: period.start, lte: period.end },
        },
        include: INVOICE_INCLUDE,
      }),
      this.prisma.invoice.findMany({
        where: {
          companyId: user.companyId, status: InvoiceStatus.PAID,
          AND: [this.sideWhere(side)],
          issueDate: { lt: period.start },
          withholdings: { some: {} },
          paymentAllocations: {
            some: { payment: { status: PaymentStatus.POSTED, date: { gte: period.start, lte: period.end } } },
          },
        },
        include: INVOICE_INCLUDE,
      }),
    ]);
    type Item = { inv: Inv; kind: 'ORIGINAL' | 'RETENTION_REPORT'; facts: Facts; payDate: Date | null; includeRet: boolean };
    const items: Item[] = [];
    for (const inv of first) {
      const f = factsOf(inv, period.end);
      items.push({ inv, kind: 'ORIGINAL', facts: f, payDate: f.settleDate, includeRet: f.settleDate !== null });
    }
    for (const inv of late) {
      const f = factsOf(inv, null);
      if (f.settleDate && f.settleDate >= period.start && f.settleDate <= period.end) {
        items.push({ inv, kind: 'RETENTION_REPORT', facts: f, payDate: f.settleDate, includeRet: true });
      }
    }
    items.sort((a, b) => a.inv.issueDate.getTime() - b.inv.issueDate.getTime() || (a.inv.ncf ?? '').localeCompare(b.inv.ncf ?? ''));
    return items;
  }

  private issue(inv: { id: string; number: string; ncf: string | null }, message: string): DgiiIssue {
    return { invoiceId: inv.id, invoiceNumber: inv.number, ncf: inv.ncf, message };
  }

  private checkNcf(inv: Inv, errors: DgiiIssue[]) {
    if (!inv.ncf) errors.push(this.issue(inv, 'No tiene NCF'));
    else if (!/^(B\d{10}|E\d{12})$/.test(inv.ncf)) errors.push(this.issue(inv, `NCF con formato inválido: ${inv.ncf}`));
    if ((inv.type === InvoiceType.CREDIT_NOTE || inv.type === InvoiceType.DEBIT_NOTE) && !inv.relatedInvoice?.ncf) {
      errors.push(this.issue(inv, 'La nota no tiene NCF modificado (la factura que afecta no tiene NCF)'));
    }
  }

  private base<T extends object>(format: DgiiFormat, period: Period, company: { name: string; taxId: string | null }, extra: T) {
    return {
      format,
      period: period.label,
      company: { name: company.name, rnc: company.taxId },
      fileName: `DGII_F_${format}_${company.taxId ?? ''}_${period.label}.TXT`,
      ...extra,
    };
  }

  // ------------------------------------------------------------------
  // 606 - Compras de bienes y servicios
  // ------------------------------------------------------------------
  async report606(periodStr: string, user: AuthUser) {
    const period = this.parsePeriod(periodStr);
    const company = await this.company(user);
    const items = await this.load('PURCHASES', period, user);
    const errors: DgiiIssue[] = [];
    const warnings: DgiiIssue[] = [];
    const rows = items.map(({ inv, kind, facts: f, payDate, includeRet }) => {
      const p = inv.partner;
      this.checkNcf(inv, errors);
      const expenseType = code2(inv.dgiiExpenseType ?? inv.relatedInvoice?.dgiiExpenseType);
      if (!EXPENSE_TYPES[expenseType]) errors.push(this.issue(inv, 'Falta el tipo de bienes y servicios (dgiiExpenseType, 01 a 11)'));
      if (!p.taxId && !MINOR_EXPENSE_NCF.includes(ncfPrefix(inv.ncf))) {
        errors.push(this.issue(inv, `El proveedor ${p.name} no tiene RNC/cédula (solo se permite en gastos menores B13/E43)`));
      }
      if (p.taxId && idTypeOf(p) === '3') {
        warnings.push(this.issue(inv, 'El instructivo del 606 solo admite RNC (1) o cédula (2) como tipo de identificación'));
      }
      const isr = includeRet ? f.isrWithheld : ZERO;
      const itbisRet = includeRet ? f.itbisWithheld : ZERO;
      if (isr.gt(0) && !ISR_RETENTION_TYPES[f.isrType]) {
        errors.push(this.issue(inv, 'La retención de ISR no tiene tipo (dgiiCode 01 a 09 en la tasa de retención)'));
      }
      if (f.hasWithholding && !includeRet) {
        warnings.push(this.issue(inv, 'Tiene retenciones: se informarán en el período en que quede pagada'));
      }
      const isGoods = GOODS_EXPENSE_TYPES.has(expenseType);
      const services = isGoods ? ZERO : f.subtotal;
      const goods = isGoods ? f.subtotal : ZERO;
      let form: string;
      if (inv.type === InvoiceType.CREDIT_NOTE) form = PAYMENT_FORMS.CREDIT_NOTE;
      else if (f.methods.size === 0) form = PAYMENT_FORMS.CREDIT;
      else if (f.methods.size > 1) form = PAYMENT_FORMS.MIXED;
      else {
        const only = [...f.methods][0];
        form = only === PaymentMethod.CASH ? PAYMENT_FORMS.CASH : only === PaymentMethod.CARD ? PAYMENT_FORMS.CARD : PAYMENT_FORMS.CHECK_TRANSFER;
      }
      const row = {
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        kind,
        docType: inv.type as string,
        rnc: p.taxId ?? '',
        idType: idTypeOf(p),
        expenseType,
        ncf: inv.ncf ?? '',
        ncfModified: inv.relatedInvoice?.ncf ?? '',
        voucherDate: ymd(inv.issueDate),
        paymentDate: payDate ? ymd(payDate) : '',
        services: m2(services),
        goods: m2(goods),
        total: m2(f.subtotal),
        itbis: m2(f.itbis),
        itbisWithheld: m2(itbisRet),
        itbisProportional: m2(ZERO),
        itbisCost: m2(ZERO),
        itbisAdvance: m2(f.itbis),
        itbisPerceived: m2(ZERO),
        isrType: isr.gt(0) ? f.isrType : '',
        isrWithheld: m2(isr),
        isrPerceived: m2(ZERO),
        isc: m2(f.isc),
        otherTaxes: m2(f.other),
        tip: m2(f.tip),
        paymentForm: form,
      };
      return row;
    });
    this.checkLimit('606', rows.length, errors);
    errors.push(...this.companyIssue(company.taxId).map((message) => ({ invoiceId: '', invoiceNumber: '', ncf: null, message })));
    return this.base('606', period, company, {
      count: rows.length,
      totals: totalsOf(rows, 'total'),
      rows,
      errors,
      warnings,
      canExport: errors.length === 0,
      assumptions: [
        'Servicios vs bienes: el sistema no los separa por línea; se infiere del tipo de gasto (04, 09 y 10 = bienes; el resto servicios).',
        'ITBIS sujeto a proporcionalidad y llevado al costo van en 0: todo el ITBIS facturado se informa como ITBIS por adelantar.',
        'Retenciones: se informan en la fila del período en que la factura queda pagada, con la fecha de pago; si es de un mes anterior se repite el NCF con su fecha original.',
        'Notas de crédito/débito: montos en positivo, con su NCF y el NCF modificado.',
      ],
    });
  }

  // ------------------------------------------------------------------
  // 607 - Ventas de bienes y servicios
  // ------------------------------------------------------------------
  async report607(periodStr: string, user: AuthUser) {
    const period = this.parsePeriod(periodStr);
    const company = await this.company(user);
    const items = await this.load('SALES', period, user);
    const errors: DgiiIssue[] = [];
    const warnings: DgiiIssue[] = [];
    const consumer = { count: 0, subtotal: ZERO, itbis: ZERO, total: ZERO };
    // N2 (R9): el umbral es un parámetro con vigencia, al último día del período
    const threshold = (await this.fiscal.numberAt('F607_UMBRAL_DETALLE_CONSUMO', period.end)).value;
    const rows: { kind: string; docType: string; [k: string]: string }[] = [];

    for (const { inv, kind, facts: f, payDate, includeRet } of items) {
      const prefix = ncfPrefix(inv.ncf);
      const isConsumer = CONSUMER_NCF.includes(prefix);
      // Facturas de consumo pequeñas: solo se resumen
      if (kind === 'ORIGINAL' && isConsumer && inv.type === InvoiceType.SALE && f.total.lt(threshold)) {
        consumer.count += 1;
        consumer.subtotal = consumer.subtotal.plus(f.subtotal);
        consumer.itbis = consumer.itbis.plus(f.itbis);
        consumer.total = consumer.total.plus(f.total);
        continue;
      }
      const p = inv.partner;
      this.checkNcf(inv, errors);
      const incomeType = code2(inv.dgiiIncomeType ?? inv.relatedInvoice?.dgiiIncomeType);
      if (!INCOME_TYPES[incomeType]) errors.push(this.issue(inv, 'Falta el tipo de ingreso (dgiiIncomeType, 01 a 06)'));
      if (!p.taxId && !isConsumer) {
        errors.push(this.issue(inv, `El cliente ${p.name} no tiene RNC/cédula (solo las facturas de consumo pueden ir sin identificación)`));
      }
      if (f.hasWithholding && !includeRet) {
        warnings.push(this.issue(inv, 'Tiene retenciones: se informarán en el período en que quede cobrada'));
      }
      const itbisRet = includeRet ? f.itbisWithheld : ZERO;
      const isrRet = includeRet ? f.isrWithheld : ZERO;
      const withheld = includeRet ? f.itbisWithheld.plus(f.isrWithheld) : ZERO;
      // Formas de venta: deben sumar el total del comprobante (con impuestos)
      const credit = Prisma.Decimal.max(f.total.minus(f.paid.cash).minus(f.paid.check).minus(f.paid.card).minus(withheld), ZERO);
      rows.push({
        invoiceId: inv.id,
        invoiceNumber: inv.number,
        kind,
        docType: inv.type as string,
        rnc: p.taxId ?? '',
        idType: idTypeOf(p),
        ncf: inv.ncf ?? '',
        ncfModified: inv.relatedInvoice?.ncf ?? '',
        incomeType,
        voucherDate: ymd(inv.issueDate),
        retentionDate: includeRet && (itbisRet.gt(0) || isrRet.gt(0)) && payDate ? ymd(payDate) : '',
        amount: m2(f.subtotal),
        itbis: m2(f.itbis),
        itbisWithheld: m2(itbisRet),
        itbisPerceived: m2(ZERO),
        isrWithheld: m2(isrRet),
        isrPerceived: m2(ZERO),
        isc: m2(f.isc),
        otherTaxes: m2(f.other),
        tip: m2(f.tip),
        cash: m2(f.paid.cash),
        checkTransfer: m2(f.paid.check),
        card: m2(f.paid.card),
        credit: m2(credit),
        bonds: m2(ZERO),
        swap: m2(ZERO),
        otherForms: m2(withheld),
      });
    }
    this.checkLimit('607', rows.length, errors);
    errors.push(...this.companyIssue(company.taxId).map((message) => ({ invoiceId: '', invoiceNumber: '', ncf: null, message })));
    return this.base('607', period, company, {
      count: rows.length,
      totals: totalsOf(rows, 'amount'),
      // Se llena en la Oficina Virtual al enviar el archivo
      consumerSummary: { count: consumer.count, amount: m2(consumer.subtotal), itbis: m2(consumer.itbis), total: m2(consumer.total) },
      rows,
      errors,
      warnings,
      canExport: errors.length === 0,
      assumptions: [
        `Facturas de consumo (B02) menores a RD$${threshold.toNumber().toLocaleString('en-US')}: no van en el detalle; se resumen en consumerSummary para la Oficina Virtual.`,
        'Formas de venta: efectivo, cheque/transferencia y tarjeta salen de los cobros aplicados; las retenciones ya aplicadas van en "otras formas"; lo demás es venta a crédito. Suman el total del comprobante.',
        'Retenciones de terceros: se informan en la fila del período en que la factura queda cobrada, con la fecha de retención; si es de un mes anterior se repite el NCF con su fecha original.',
        'Notas de crédito/débito: montos en positivo, con su NCF y el NCF modificado.',
        'Una empresa que opere como facturador electrónico no envía el 607 mientras lo sea.',
      ],
    });
  }

  // ------------------------------------------------------------------
  // 608 - Comprobantes anulados
  // ------------------------------------------------------------------
  async report608(periodStr: string, user: AuthUser) {
    const period = this.parsePeriod(periodStr);
    const company = await this.company(user);
    const voided = await this.prisma.invoice.findMany({
      where: {
        companyId: user.companyId, status: InvoiceStatus.VOIDED, ncf: { not: null },
        voidedAt: { gte: period.start, lte: period.end },
      },
      include: { relatedInvoice: { select: { type: true } } },
      orderBy: [{ voidedAt: 'asc' }, { ncf: 'asc' }],
    });
    const errors: DgiiIssue[] = [];
    const rows: { invoiceId: string; invoiceNumber: string; ncf: string; voucherDate: string; voidType: string }[] = [];
    for (const inv of voided) {
      // Solo los comprobantes que emitió la propia empresa (no el NCF que trae un proveedor)
      const own =
        inv.type === InvoiceType.SALE ||
        (inv.type === InvoiceType.PURCHASE && SELF_ISSUED_PURCHASE_NCF.includes(ncfPrefix(inv.ncf))) ||
        ((inv.type === InvoiceType.CREDIT_NOTE || inv.type === InvoiceType.DEBIT_NOTE) && inv.relatedInvoice?.type === InvoiceType.SALE);
      if (!own) continue;
      const voidType = code2(inv.voidReasonCode);
      if (!VOID_TYPES[voidType]) errors.push(this.issue(inv, 'Falta el tipo de anulación (reasonCode, 01 a 10)'));
      rows.push({ invoiceId: inv.id, invoiceNumber: inv.number, ncf: inv.ncf!, voucherDate: ymd(inv.issueDate), voidType });
    }
    this.checkLimit('608', rows.length, errors);
    errors.push(...this.companyIssue(company.taxId).map((message) => ({ invoiceId: '', invoiceNumber: '', ncf: null, message })));
    return this.base('608', period, company, {
      count: rows.length,
      rows,
      errors,
      warnings: [] as DgiiIssue[],
      canExport: errors.length === 0,
      assumptions: ['Se reportan en el período en que se anuló el comprobante (fecha de anulación).'],
    });
  }

  private checkLimit(format: DgiiFormat, n: number, errors: DgiiIssue[]) {
    if (n > MAX_ROWS[format]) {
      errors.push({ invoiceId: '', invoiceNumber: '', ncf: null, message: `El ${format} admite máximo ${MAX_ROWS[format]} registros por archivo (hay ${n})` });
    }
  }

  // ------------------------------------------------------------------
  // Archivos TXT
  // ------------------------------------------------------------------
  async txt(format: DgiiFormat, periodStr: string, user: AuthUser) {
    const report =
      format === '606' ? await this.report606(periodStr, user)
      : format === '607' ? await this.report607(periodStr, user)
      : await this.report608(periodStr, user);
    if (!report.canExport) {
      throw new UnprocessableEntityException({
        message: `El ${format} tiene errores; corrígelos antes de generar el archivo`,
        errors: report.errors,
      });
    }
    const rows = report.rows as Record<string, string>[];
    const columns: Record<DgiiFormat, string[]> = {
      '606': ['rnc', 'idType', 'expenseType', 'ncf', 'ncfModified', 'voucherDate', 'paymentDate', 'services', 'goods', 'total',
        'itbis', 'itbisWithheld', 'itbisProportional', 'itbisCost', 'itbisAdvance', 'itbisPerceived', 'isrType', 'isrWithheld',
        'isrPerceived', 'isc', 'otherTaxes', 'tip', 'paymentForm'],
      '607': ['rnc', 'idType', 'ncf', 'ncfModified', 'incomeType', 'voucherDate', 'retentionDate', 'amount', 'itbis', 'itbisWithheld',
        'itbisPerceived', 'isrWithheld', 'isrPerceived', 'isc', 'otherTaxes', 'tip', 'cash', 'checkTransfer', 'card', 'credit',
        'bonds', 'swap', 'otherForms'],
      '608': ['ncf', 'voucherDate', 'voidType'],
    };
    const header = [format, report.company.rnc, report.period, String(report.count)].join(FIELD_SEPARATOR);
    const lines = rows.map((r) => columns[format].map((k) => r[k] ?? '').join(FIELD_SEPARATOR));
    return { fileName: report.fileName, content: [header, ...lines].join(LINE_BREAK) + LINE_BREAK };
  }
}