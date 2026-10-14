import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction, InvoiceStatus, InvoiceType } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { FiscalParametersService } from '../fiscal/fiscal-parameters.service.js';
import { DgiiService } from '../dgii/dgii.service.js';
import { FIELD_SEPARATOR, GOODS_EXPENSE_TYPES, LINE_BREAK } from '../dgii/dgii.codes.js';
import type { Section, TableDoc } from '../exports/table-doc.js';

type Dec = Prisma.Decimal;
const D = (v: string | number | Dec) => new Prisma.Decimal(v);
const ZERO = D(0);
const r2 = (d: Dec) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
const m2 = (d: Dec) => r2(d).toFixed(2);
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const yyyymmdd = (d: Date | null) => (d ? ymd(d).replace(/-/g, '') : '');

export interface Issue { invoiceId: string; invoiceNumber: string; ncf: string | null; message: string }
export interface Box { box: string; text: string; value: string; origin: string; link: string | null }
export type MapStatus = 'OFICIAL' | 'POR_VALIDAR';

/**
 * Declaraciones asistidas (PLAN-v0.3 §9.2, N6): 609 con su TXT y hojas IT-1 e IR-17 casilla por casilla.
 * Columnas del 609 y casillas del IT-1/IR-17 son PARÁMETROS con vigencia (F609_COLUMNAS, IT1_MAPA_CASILLAS,
 * IR17_MAPA_CASILLAS): cuando la DGII cambia un formulario se carga un valor nuevo, sin programar.
 */
@Injectable()
export class DgiiFormsService {
  constructor(private readonly prisma: PrismaService, private readonly params: FiscalParametersService, private readonly dgii: DgiiService) {}

  private range(period: string) {
    const [y, m] = period.split('-').map(Number);
    return { start: new Date(Date.UTC(y, m - 1, 1)), end: new Date(Date.UTC(y, m, 1) - 1), label: `${y}${String(m).padStart(2, '0')}` };
  }

  private async map(key: string, at: Date) {
    const p = await this.params.valueAt(key, at);
    const json = (p.valueJson ?? {}) as { version?: string; casillas?: Record<string, { texto: string; origen?: string; claves?: string[] }>; columnas?: { campo: string; titulo: string }[] };
    return { ...json, status: p.status as MapStatus, source: p.source };
  }

  private mapWarning(status: MapStatus, what: string) {
    return status === 'OFICIAL' ? [] : [`El ${what} está «Por validar»: revísalo con tu contadora contra el formulario vigente antes de presentar.`];
  }

  // ------------------------------------------------------------------ 609 (pagos al exterior)

  async report609(period: string, user: AuthUser) {
    const { start, end, label } = this.range(period);
    const [company, layout] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true, taxId: true } }),
      this.map('F609_COLUMNAS', end),
    ]);
    const invoices = await this.prisma.invoice.findMany({
      where: {
        companyId: user.companyId, type: InvoiceType.PURCHASE, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOIDED] }, issueDate: { gte: start, lte: end },
        OR: [{ ncfType: { in: ['B17', 'E47'] } }, { ncf: { startsWith: 'B17' } }, { ncf: { startsWith: 'E47' } }, { partner: { country: { not: 'DO' } } }],
      },
      include: { partner: true, withholdings: { include: { taxRate: true } }, paymentAllocations: { include: { payment: { select: { date: true, status: true } } } } },
      orderBy: { issueDate: 'asc' },
    });
    const errors: Issue[] = [];
    const warnings: Issue[] = [];
    const rows = invoices.map((inv) => {
      const isr = inv.withholdings.filter((w) => w.taxRate.type === 'ISR_WITHHOLDING');
      const itbis = inv.withholdings.filter((w) => w.taxRate.type === 'ITBIS_WITHHOLDING');
      const pay = inv.paymentAllocations.filter((a) => a.payment.status === 'POSTED').map((a) => a.payment.date).sort((a, b) => a.getTime() - b.getTime()).at(-1) ?? null;
      const rentType = isr[0]?.taxRate.dgiiCode ?? '';
      const base = { invoiceId: inv.id, invoiceNumber: inv.number, ncf: inv.ncf };
      if (!inv.ncf) errors.push({ ...base, message: 'No tiene NCF (B17 o E47)' });
      if (!isr.length) warnings.push({ ...base, message: 'Pago al exterior sin retención de ISR: confirma con tu contadora si aplica' });
      else if (!rentType) errors.push({ ...base, message: 'La retención de ISR no tiene código DGII (tipo de renta): complétalo en Impuestos' });
      const rate = inv.exchangeRate;
      return {
        invoiceId: inv.id, invoiceNumber: inv.number,
        beneficiary: inv.partner.name, idType: inv.partner.taxIdType ?? '', taxId: inv.partner.taxId ?? '', country: inv.partner.country,
        rentType, ncf: inv.ncf ?? '', invoiceDate: yyyymmdd(inv.issueDate), paymentDate: yyyymmdd(pay),
        amount: m2(inv.subtotal.times(rate)), isrWithheld: m2(isr.reduce((s, w) => s.plus(w.amount), ZERO).times(rate)),
        itbisWithheld: m2(itbis.reduce((s, w) => s.plus(w.amount), ZERO).times(rate)), currency: inv.currency,
      };
    });
    const columns = layout.columnas ?? [];
    if (!columns.length) errors.push({ invoiceId: '', invoiceNumber: '', ncf: null, message: 'Falta cargar las columnas del 609 (F609_COLUMNAS) según el instructivo oficial' });
    return {
      format: '609', period: label, company: { name: company.name, rnc: company.taxId }, fileName: `DGII_F_609_${company.taxId}_${label}.TXT`,
      count: rows.length, rows, columns, errors, warnings, canExport: errors.length === 0,
      totals: { amount: m2(rows.reduce((s, r) => s.plus(r.amount), ZERO)), isrWithheld: m2(rows.reduce((s, r) => s.plus(r.isrWithheld), ZERO)) },
      assumptions: [
        'Entran las compras con comprobante B17/E47 o a proveedores de otro país, por la fecha de la factura.',
        'El tipo de renta sale del código DGII de la retención de ISR. Los montos van en pesos (tasa de la factura).',
        ...this.mapWarning(layout.status, 'orden de columnas del 609'),
      ],
    };
  }

  async txt609(period: string, user: AuthUser) {
    const r = await this.report609(period, user);
    if (!r.canExport) throw new UnprocessableEntityException({ message: 'El 609 tiene errores; corrígelos antes de generar el archivo', errors: r.errors });
    const header = ['609', r.company.rnc, r.period, String(r.count)].join(FIELD_SEPARATOR);
    const lines = r.rows.map((row) => r.columns.map((c) => String((row as Record<string, unknown>)[c.campo] ?? '')).join(FIELD_SEPARATOR));
    return { fileName: r.fileName, content: [header, ...lines].join(LINE_BREAK) + LINE_BREAK };
  }

  // ------------------------------------------------------------------ IT-1

  /** Valores de origen del IT-1 (en pesos), calculados de las facturas del mes. */
  private async it1Sources(companyId: string, start: Date, end: Date) {
    const invs = await this.prisma.invoice.findMany({
      where: {
        companyId, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOIDED] }, issueDate: { gte: start, lte: end },
        OR: [{ type: { in: [InvoiceType.SALE, InvoiceType.PURCHASE] } }, { type: { in: [InvoiceType.CREDIT_NOTE, InvoiceType.DEBIT_NOTE] } }],
      },
      include: {
        lines: { include: { taxRate: { select: { parameterKey: true, rate: true, isWithholding: true } } } },
        withholdings: { include: { taxRate: { select: { type: true } } } }, relatedInvoice: { select: { type: true } },
      },
    });
    const v: Record<string, Dec> = {};
    const add = (k: string, x: Dec) => { v[k] = (v[k] ?? ZERO).plus(x); };
    for (const inv of invs) {
      const side = inv.type === InvoiceType.SALE || inv.relatedInvoice?.type === InvoiceType.SALE ? 'SALE' : 'PURCHASE';
      const sign = inv.type === InvoiceType.CREDIT_NOTE ? -1 : 1;
      const fx = inv.exchangeRate;
      for (const l of inv.lines) {
        const net = l.total.times(fx).times(sign);
        const tax = l.taxAmount.times(fx).times(sign);
        const rate = l.appliedRate ?? l.taxRate?.rate ?? null;
        const key = l.taxRate?.parameterKey ?? null;
        if (side === 'SALE') {
          add('ventas.total', net);
          if (!l.taxRateId) add('ventas.exentas', net);
          else if (key === 'ITBIS_TASA_EXPORTACION' || (rate !== null && rate.isZero())) add('ventas.exportaciones', net);
          else {
            add('ventas.gravadas', net); add('itbis.facturado', tax);
            if (key === 'ITBIS_TASA_REDUCIDA') { add('ventas.gravadas16', net); add('itbis.facturado16', tax); }
            else { add('ventas.gravadas18', net); add('itbis.facturado18', tax); }
          }
        } else if (l.taxRateId && !tax.isZero()) {
          add(GOODS_EXPENSE_TYPES.has(inv.dgiiExpenseType ?? '') ? 'itbis.adelantadoCompras' : 'itbis.adelantadoServicios', tax);
          add('itbis.deducible', tax);
        }
      }
      for (const w of inv.withholdings) {
        if (w.taxRate.type !== 'ITBIS_WITHHOLDING') continue;
        add(side === 'SALE' ? 'itbis.retenidoPorTerceros' : 'itbis.retenidoATerceros', w.amount.times(fx).times(sign));
      }
    }
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, r2(x)]));
  }

  async it1(period: string, user: AuthUser) {
    const { start, end } = this.range(period);
    const [map, src, r607, prev] = await Promise.all([
      this.map('IT1_MAPA_CASILLAS', end), this.it1Sources(user.companyId, start, end), this.dgii.report607(period, user),
      this.previousSnapshot(user.companyId, 'IT-1', period),
    ]);
    const val = (origin: string | undefined, boxes: Record<string, Dec>): Dec => {
      if (!origin) return ZERO;
      const calc = /^calc:(\w+)-(\w+)$/.exec(origin);
      if (calc) { const x = (boxes[calc[1]] ?? ZERO).minus(boxes[calc[2]] ?? ZERO); return x.isNeg() ? ZERO : x; }
      return src[origin] ?? ZERO;
    };
    const LINK: Record<string, string> = { ventas: '/invoices?type=SALE', itbis: '/dgii/review' };
    const boxes: Record<string, Dec> = {};
    const out: Box[] = [];
    // Primero las de origen directo, después los cálculos
    const entries = Object.entries(map.casillas ?? {}).sort(([, a], [, b]) => Number((a.origen ?? '').startsWith('calc:')) - Number((b.origen ?? '').startsWith('calc:')));
    for (const [box, c] of entries) {
      boxes[box] = val(c.origen, boxes);
      out.push({ box, text: c.texto, value: m2(boxes[box]), origin: c.origen ?? '', link: c.origen ? (LINK[c.origen.split('.')[0]] ?? null) : null });
    }
    out.sort((a, b) => a.box.localeCompare(b.box, 'es', { numeric: true }));
    const prevCredit = prev?.saldoAFavor ? D(prev.saldoAFavor) : ZERO;
    const facturado = src['itbis.facturado'] ?? ZERO;
    const deducible = (src['itbis.deducible'] ?? ZERO).plus(src['itbis.retenidoPorTerceros'] ?? ZERO).plus(prevCredit);
    const net = facturado.minus(deducible);
    // Cuadre 607 ↔ IT-1: ventas del 607 (detalle + resumen de consumo) contra el total de operaciones
    const total607 = r607.rows.filter((r) => (r as Record<string, string>).kind === 'ORIGINAL').reduce((s, r) => s.plus(D((r as Record<string, string>).amount ?? '0').times((r as Record<string, string>).docType === 'CREDIT_NOTE' ? -1 : 1)), ZERO).plus(D(r607.consumerSummary.amount));
    const diff = r2(total607.minus(src['ventas.total'] ?? ZERO));
    return {
      form: 'IT-1', period, mapVersion: map.version ?? null, mapStatus: map.status, boxes: out,
      summary: { itbisFacturado: m2(facturado), itbisDeducible: m2(deducible), saldoAnterior: m2(prevCredit), aPagar: m2(net.isNeg() ? ZERO : net), saldoAFavor: m2(net.isNeg() ? net.neg() : ZERO) },
      check607: { ok: diff.isZero(), ventas607: m2(total607), ventasIt1: m2(src['ventas.total'] ?? ZERO), difference: m2(diff) },
      warnings: [
        ...this.mapWarning(map.status, 'mapa de casillas del IT-1'),
        ...(prev ? [] : ['No hay IT-1 presentado del mes anterior en el sistema: el saldo a favor anterior se toma como 0. Si tenías saldo, escríbelo en la Oficina Virtual.']),
        'Si tienes ventas gravadas y exentas, aplica la proporcionalidad del ITBIS (art. 349) con tu contadora: el sistema no la calcula (D32).',
        'No se genera archivo: estos valores se llenan en la Oficina Virtual.',
      ],
    };
  }

  // ------------------------------------------------------------------ IR-17

  async ir17(period: string, user: AuthUser) {
    const { start, end } = this.range(period);
    const [map, ws, prev] = await Promise.all([
      this.map('IR17_MAPA_CASILLAS', end),
      this.prisma.invoiceWithholding.findMany({
        where: {
          invoice: {
            companyId: user.companyId, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOIDED] }, issueDate: { gte: start, lte: end },
            OR: [{ type: InvoiceType.PURCHASE }, { relatedInvoice: { type: InvoiceType.PURCHASE } }],
          },
          taxRate: { type: 'ISR_WITHHOLDING' },
        },
        include: { taxRate: { select: { parameterKey: true, name: true } }, invoice: { select: { type: true, exchangeRate: true } } },
      }),
      this.previousSnapshot(user.companyId, 'IR-17', period),
    ]);
    const byKey = new Map<string, Dec>();
    const unmapped = new Map<string, Dec>();
    for (const w of ws) {
      const x = w.amount.times(w.invoice.exchangeRate).times(w.invoice.type === InvoiceType.CREDIT_NOTE ? -1 : 1);
      if (w.taxRate.parameterKey) byKey.set(w.taxRate.parameterKey, (byKey.get(w.taxRate.parameterKey) ?? ZERO).plus(x));
      else unmapped.set(w.taxRate.name, (unmapped.get(w.taxRate.name) ?? ZERO).plus(x));
    }
    const boxes: Box[] = [];
    let total = ZERO;
    const used = new Set<string>();
    for (const [box, c] of Object.entries(map.casillas ?? {})) {
      if (c.origen === 'calc:suma') continue;
      const v = (c.claves ?? []).reduce((s, k) => { used.add(k); return s.plus(byKey.get(k) ?? ZERO); }, ZERO);
      total = total.plus(v);
      boxes.push({ box, text: c.texto, value: m2(v), origin: (c.claves ?? []).join(', '), link: '/dgii' });
    }
    const sumBox = Object.entries(map.casillas ?? {}).find(([, c]) => c.origen === 'calc:suma');
    if (sumBox) boxes.push({ box: sumBox[0], text: sumBox[1].texto, value: m2(total), origin: 'suma de las casillas', link: null });
    boxes.sort((a, b) => a.box.localeCompare(b.box, 'es', { numeric: true }));
    const notInMap = [...byKey.entries()].filter(([k]) => !used.has(k));
    return {
      form: 'IR-17', period, mapVersion: map.version ?? null, mapStatus: map.status, boxes, summary: { total: m2(total), previous: prev ? m2(D(prev.total ?? '0')) : null },
      warnings: [
        ...this.mapWarning(map.status, 'mapa de casillas del IR-17'),
        ...[...unmapped.entries()].map(([name, x]) => `«${name}» (RD$${m2(x)}) no está enlazado a un valor oficial: no se sabe en qué casilla va. Enlázalo en Impuestos.`),
        ...notInMap.map(([k, x]) => `Las retenciones de ${k} (RD$${m2(x)}) no tienen casilla en el mapa: revísalo con tu contadora.`),
        'Las retenciones de ISR de asalariados van en el IR-3, no aquí. No se genera archivo: se llenan en la Oficina Virtual.',
      ],
    };
  }

  // ------------------------------------------------------------------ presentar con foto (saldo a favor del mes siguiente)

  private async previousSnapshot(companyId: string, code: string, period: string) {
    const [y, m] = period.split('-').map(Number);
    const prev = `${m === 1 ? y - 1 : y}-${String(m === 1 ? 12 : m - 1).padStart(2, '0')}`;
    const f = await this.prisma.fiscalFiling.findUnique({ where: { companyId_obligationCode_period: { companyId, obligationCode: code, period: prev } } });
    return (f?.snapshot ?? null) as { saldoAFavor?: string; total?: string } | null;
  }

  async file(form: 'IT-1' | 'IR-17' | '609', period: string, reference: string | undefined, user: AuthUser) {
    const snapshot = form === 'IT-1' ? (await this.it1(period, user)).summary : form === 'IR-17' ? (await this.ir17(period, user)).summary : (await this.report609(period, user)).totals;
    try {
      return await this.prisma.$transaction(async (tx) => {
        const f = await tx.fiscalFiling.create({
          data: { companyId: user.companyId, obligationCode: form, period, filedAt: new Date(), filedById: user.id, reference: reference ?? null, snapshot: snapshot as Prisma.InputJsonValue },
        });
        await writeAudit(tx, user, 'FiscalFiling', f.id, AuditAction.CREATE, { obligationCode: form, period, reference: reference ?? null });
        return f;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya marcaste esa declaración como presentada');
      throw e;
    }
  }

  // ------------------------------------------------------------------ exportar las hojas

  sheetDoc(sheet: { form: string; period: string; boxes: Box[]; warnings: string[]; summary: Record<string, string | null> }, company: { name: string; taxId: string }): TableDoc {
    const latin = (s: string) => s.replace(/[≥≤«»“”–—]/g, (c) => ({ '≥': '>=', '≤': '<=', '«': '"', '»': '"', '“': '"', '”': '"', '–': '-', '—': '-' })[c] ?? c);
    const section: Section = {
      title: `Hoja de trabajo ${sheet.form} - ${sheet.period}`,
      columns: [{ header: 'Casilla', w: 0.7 }, { header: 'Concepto', w: 4 }, { header: 'Valor', w: 1.3, fmt: 'money' }, { header: 'Origen', w: 2, xlsxOnly: true }],
      rows: sheet.boxes.map((b) => ({ cells: [b.box, latin(b.text), { v: Number(b.value), fmt: 'money' as const }, b.origin] })),
      notes: [...Object.entries(sheet.summary).filter(([, v]) => v !== null).map(([k, v]) => `${k}: ${v}`), ...sheet.warnings.map(latin)],
    };
    return { title: `Hoja ${sheet.form}`, subtitle: `Periodo ${sheet.period} - para llenar en la Oficina Virtual`, company, fileBase: `hoja-${sheet.form.toLowerCase()}_${sheet.period}`, sections: [section] };
  }
}
