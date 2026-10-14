import { Prisma } from '../../generated/prisma/client.js';
import type { EcfPayload } from './provider.js';

const D = (v: Prisma.Decimal | string | number) => new Prisma.Decimal(v);
const ZERO = D(0);
const m2 = (d: Prisma.Decimal) => d.toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP).toFixed(2);
const dmy = (d: Date) => { const [y, m, day] = d.toISOString().slice(0, 10).split('-'); return `${day}-${m}-${y}`; };

export interface PayloadInvoice {
  type: string; ncf: string | null; ncfType: string | null; issueDate: Date; dueDate: Date | null; currency: string; exchangeRate: Prisma.Decimal;
  dgiiIncomeType: string | null; total: Prisma.Decimal; withholdingTotal: Prisma.Decimal;
  partner: { name: string; taxId: string | null; country: string } | null;
  lines: { description: string; quantity: Prisma.Decimal; unitPrice: Prisma.Decimal; discount: Prisma.Decimal; total: Prisma.Decimal; taxAmount: Prisma.Decimal; taxRate: { parameterKey: string | null; rate: Prisma.Decimal } | null; appliedRate: Prisma.Decimal | null }[];
  withholdings: { amount: Prisma.Decimal; taxRate: { type: string } }[];
  relatedInvoice: { ncf: string | null; issueDate: Date } | null; voidReasonCode?: string | null;
}

/**
 * Indicador de facturación de la DGII por línea: 1 = ITBIS tasa 1, 2 = tasa 2, 3 = tasa 3 (0 %), 4 = exento.
 * Sale de la CLAVE del parámetro enlazado (R9: ninguna tasa en el código); sin enlace, por la tasa usada comparada con
 * las tasas vigentes que pasa quien llama.
 */
export function indicator(l: PayloadInvoice['lines'][number], current: { general: string | null; reduced: string | null }): 1 | 2 | 3 | 4 {
  if (!l.taxRate) return 4;
  const key = l.taxRate.parameterKey;
  if (key === 'ITBIS_TASA_GENERAL') return 1;
  if (key === 'ITBIS_TASA_REDUCIDA') return 2;
  if (key === 'ITBIS_TASA_EXPORTACION') return 3;
  const rate = (l.appliedRate ?? l.taxRate.rate).toString();
  if (current.general && D(rate).eq(current.general)) return 1;
  if (current.reduced && D(rate).eq(current.reduced)) return 2;
  return D(rate).isZero() ? 3 : 1;
}

/** Arma nuestro documento común con los nombres de la estructura de la DGII (PLAN-v0.3 §7.3). Montos en moneda del documento. */
export function buildPayload(inv: PayloadInvoice, company: { taxId: string; name: string; legalName: string | null; address: string | null }, eNcf: string | null, seqExpiration: Date | null, rates: { general: string | null; reduced: string | null }): EcfPayload {
  const tot = { g1: ZERO, g2: ZERO, g3: ZERO, ex: ZERO, t1: ZERO, t2: ZERO, t3: ZERO };
  const items = inv.lines.map((l, i) => {
    const ind = indicator(l, rates);
    if (ind === 1) { tot.g1 = tot.g1.plus(l.total); tot.t1 = tot.t1.plus(l.taxAmount); }
    else if (ind === 2) { tot.g2 = tot.g2.plus(l.total); tot.t2 = tot.t2.plus(l.taxAmount); }
    else if (ind === 3) { tot.g3 = tot.g3.plus(l.total); tot.t3 = tot.t3.plus(l.taxAmount); }
    else tot.ex = tot.ex.plus(l.total);
    return { NumeroLinea: i + 1, IndicadorFacturacion: ind, NombreItem: l.description.slice(0, 80), CantidadItem: l.quantity.toFixed(), PrecioUnitarioItem: m2(l.unitPrice), DescuentoMonto: m2(l.discount), MontoItem: m2(l.total) };
  });
  const gravado = tot.g1.plus(tot.g2).plus(tot.g3);
  const itbis = tot.t1.plus(tot.t2).plus(tot.t3);
  const ret = (t: string) => inv.withholdings.filter((w) => w.taxRate.type === t).reduce((s, w) => s.plus(w.amount), ZERO);
  const foreign = inv.partner && inv.partner.country !== 'DO';
  return {
    Encabezado: {
      Version: '1.0',
      IdDoc: {
        TipoeCF: (inv.ncfType ?? inv.ncf ?? '').slice(1, 3), eNCF: eNcf, FechaVencimientoSecuencia: seqExpiration ? dmy(seqExpiration) : null,
        IndicadorMontoGravado: 0, TipoIngresos: inv.dgiiIncomeType, TipoPago: inv.dueDate && inv.dueDate > inv.issueDate ? 2 : 1,
        FechaLimitePago: inv.dueDate ? dmy(inv.dueDate) : null,
      },
      Emisor: { RNCEmisor: company.taxId, RazonSocialEmisor: company.legalName ?? company.name, DireccionEmisor: company.address, FechaEmision: dmy(inv.issueDate) },
      Comprador: inv.partner ? { RNCComprador: foreign ? null : inv.partner.taxId, RazonSocialComprador: inv.partner.name, IdentificadorExtranjero: foreign ? inv.partner.taxId : null } : null,
      Totales: {
        MontoGravadoTotal: m2(gravado), MontoGravadoI1: m2(tot.g1), MontoGravadoI2: m2(tot.g2), MontoGravadoI3: m2(tot.g3), MontoExento: m2(tot.ex),
        ITBIS1: rates.general ?? '', ITBIS2: rates.reduced ?? '', ITBIS3: '0', TotalITBIS: m2(itbis), TotalITBIS1: m2(tot.t1), TotalITBIS2: m2(tot.t2), TotalITBIS3: m2(tot.t3),
        MontoTotal: m2(inv.total), TotalITBISRetenido: m2(ret('ITBIS_WITHHOLDING')), TotalISRRetencion: m2(ret('ISR_WITHHOLDING')),
      },
      OtraMoneda: inv.currency !== 'DOP' ? { TipoMoneda: inv.currency, TipoCambio: inv.exchangeRate.toFixed() } : null,
    },
    DetallesItems: items,
    InformacionReferencia: inv.relatedInvoice?.ncf
      ? { NCFModificado: inv.relatedInvoice.ncf, FechaNCFModificado: dmy(inv.relatedInvoice.issueDate), CodigoModificacion: inv.voidReasonCode ?? (inv.type === 'CREDIT_NOTE' ? '3' : '4') }
      : null,
  };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** XML con la estructura <ECF> (sin firma: firma el proveedor). La validación contra el XSD vigente la hace el proveedor. */
export function payloadToXml(p: EcfPayload): string {
  const node = (name: string, v: unknown): string => {
    if (v === null || v === undefined || v === '') return '';
    if (Array.isArray(v)) return v.map((x) => node(name, x)).join('');
    if (typeof v === 'object') return `<${name}>${Object.entries(v as Record<string, unknown>).map(([k, x]) => node(k, x)).join('')}</${name}>`;
    return `<${name}>${esc(String(v))}</${name}>`;
  };
  const items = `<DetallesItems>${p.DetallesItems.map((i) => node('Item', i)).join('')}</DetallesItems>`;
  return `<?xml version="1.0" encoding="UTF-8"?><ECF>${node('Encabezado', p.Encabezado)}${items}${node('InformacionReferencia', p.InformacionReferencia)}</ECF>`;
}
