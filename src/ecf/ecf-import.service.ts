import { createHash, randomUUID } from 'node:crypto';
import {
  BadRequestException, ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AuditAction, EcfImportStatus, EcfOrigin, EcfStatus, EcfVerification, InvoiceStatus, InvoiceType, PartnerType, TaxType,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { FILE_STORAGE, type FileStorage } from '../attachments/file-storage.js';
import { sanitizeFileName, type UploadedFileLike } from '../attachments/file-type.js';
import { InvoicingService } from '../invoicing/invoicing.service.js';
import { resolveTaxId } from '../masters/partners/partners.service.js';
import { OPEN_STATUSES, applyToInvoice } from '../receivables-payables/invoice-balance.js';
import { ConfirmEcfImportDto } from './dto/ecf.dto.js';
import { child, children, parseXml, text, type XmlNode } from './xml.js';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;
const D = (v: string | number) => new Prisma.Decimal(v);
const ZERO = D(0);
const r2 = (d: Dec) => d.toDecimalPlaces(2, 4);
const NUM = /^-?\d+(\.\d+)?$/;
const CONSUMER = 'Consumidor final';
const MINOR = 'Gastos menores';
// Ventas (y sus notas) que emite la empresa; compras que emite la empresa (proveedor informal, gastos menores, exterior)
const OWN_SALE_TYPES = ['31', '32', '33', '34', '44', '45', '46'];
const OWN_PURCHASE_TYPES = ['41', '43', '47'];

export interface PreviewLine {
  description: string; quantity: string; unitPrice: string; discount: string;
  itbisRate: number | null; taxRateId: string | null;
}
export interface ImportPreview {
  type: InvoiceType; side: 'SALES' | 'PURCHASES'; ecfType: string; eNcf: string; issueDate: string; issuerRnc: string;
  partner: { id: string | null; name: string; taxId: string | null; isNew: boolean; type: PartnerType };
  relatedInvoiceId: string | null; relatedNcf: string | null; incomeType: string | null;
  lines: PreviewLine[];
  totals: { subtotal: string; itbis: string; total: string; xmlTotal: string };
  errors: string[]; warnings: string[]; canImport: boolean;
  duplicate: boolean;
}

/**
 * Importación de XML e-CF (PLAN-v0.3 §7.4): compras recibidas de suplidores y ventas emitidas en el
 * portal del proveedor. Se prepara (se lee, se valida, se guarda el XML) y se confirma con el id:
 * la factura emitida, su asiento y el EcfDocument "No verificado" se crean en una sola transacción.
 */
@Injectable()
export class EcfImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly invoicing: InvoicingService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  // ------------------------------------------------------------------
  // Lectura del XML (formato DGII v1.0)
  // ------------------------------------------------------------------
  private read(xml: string) {
    const root = parseXml(xml);
    if (root.name !== 'ECF') throw new UnprocessableEntityException('No es un e-CF: el elemento principal debe ser <ECF>');
    const enc = child(root, 'Encabezado');
    const errors: string[] = [];
    const warnings: string[] = [];
    const req = (label: string, ...path: string[]) => {
      const v = text(enc, ...path);
      if (!v) errors.push(`Falta ${label} (${path.join('/')})`);
      return v ?? '';
    };
    const num = (v: string | undefined, label: string, fallback = '0') => {
      if (v === undefined) return fallback;
      if (!NUM.test(v)) { errors.push(`${label} no es un número: ${v}`); return fallback; }
      return v;
    };
    const tipo = req('el tipo de e-CF', 'IdDoc', 'TipoeCF');
    const eNcf = req('el e-NCF', 'IdDoc', 'eNCF');
    if (eNcf && !/^E\d{12}$/.test(eNcf)) errors.push(`e-NCF con formato inválido: ${eNcf}`);
    if (eNcf && tipo && eNcf.slice(1, 3) !== tipo) errors.push(`El e-NCF ${eNcf} no es del tipo ${tipo}`);
    const fecha = req('la fecha de emisión', 'Emisor', 'FechaEmision');
    const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(fecha);
    if (fecha && !m) errors.push(`Fecha de emisión inválida: ${fecha} (se espera dd-MM-aaaa)`);

    const items = children(child(root, 'DetallesItems'), 'Item');
    if (!items.length) errors.push('El e-CF no tiene líneas (DetallesItems/Item)');
    const lines = items.map((it: XmlNode, i) => {
      const ind = text(it, 'IndicadorFacturacion');
      const rate = ind === '1' ? 18 : ind === '2' ? 16 : ind === '3' ? 0 : ind === '4' ? null : undefined;
      if (rate === undefined) errors.push(`Línea ${i + 1}: IndicadorFacturacion desconocido (${ind ?? 'vacío'})`);
      return {
        description: (text(it, 'NombreItem') ?? `Línea ${i + 1}`).slice(0, 300),
        quantity: num(text(it, 'CantidadItem'), `Línea ${i + 1}: cantidad`, '1'),
        unitPrice: num(text(it, 'PrecioUnitarioItem'), `Línea ${i + 1}: precio`),
        discount: num(text(it, 'DescuentoMonto'), `Línea ${i + 1}: descuento`),
        itbisRate: rate ?? null,
        taxRateId: null as string | null,
      };
    });
    const currency = text(enc, 'OtraMoneda', 'TipoMoneda');
    if (currency) warnings.push(`El e-CF trae montos en ${currency}; se registra en pesos (DOP), como los montos principales del XML`);
    const ret = D(num(text(enc, 'Totales', 'TotalITBISRetenido'), 'ITBIS retenido')).plus(D(num(text(enc, 'Totales', 'TotalISRRetencion'), 'ISR retenido')));
    if (ret.gt(0)) warnings.push('El e-CF trae retenciones: regístralas en la factura después de importarla');
    return {
      tipo, eNcf, errors, warnings, lines,
      issueDate: m ? `${m[3]}-${m[2]}-${m[1]}` : '',
      incomeType: text(enc, 'IdDoc', 'TipoIngresos') ?? null,
      emisor: { rnc: text(enc, 'Emisor', 'RNCEmisor') ?? '', name: text(enc, 'Emisor', 'RazonSocialEmisor') ?? '' },
      comprador: { rnc: text(enc, 'Comprador', 'RNCComprador') ?? '', name: text(enc, 'Comprador', 'RazonSocialComprador') ?? '' },
      montoTotal: D(num(text(enc, 'Totales', 'MontoTotal'), 'MontoTotal')),
      ncfModificado: text(root, 'InformacionReferencia', 'NCFModificado') ?? null,
    };
  }

  /** Qué se va a registrar y qué lo impide. Se usa al preparar y otra vez al confirmar (el estado pudo cambiar). */
  private async analyze(xml: string, user: AuthUser, db: Tx | PrismaService = this.prisma): Promise<ImportPreview> {
    const { companyId } = user;
    const x = this.read(xml);
    const { errors, warnings } = x;
    const company = await db.company.findUniqueOrThrow({ where: { id: companyId } });

    const own = x.emisor.rnc === company.taxId;
    const received = x.comprador.rnc === company.taxId;
    if (!own && !received) {
      errors.push(`Este e-CF no es de tu empresa: ni el emisor (${x.emisor.rnc || 'sin RNC'}) ni el comprador (${x.comprador.rnc || 'sin RNC'}) tienen tu RNC ${company.taxId}`);
    }
    if (x.tipo && !OWN_SALE_TYPES.includes(x.tipo) && !OWN_PURCHASE_TYPES.includes(x.tipo)) errors.push(`Tipo de e-CF desconocido: ${x.tipo}`);
    // Compras que emite la empresa: el suplidor va en el bloque Comprador (por validar con la contadora)
    const ownPurchase = own && OWN_PURCHASE_TYPES.includes(x.tipo);
    if (received && OWN_PURCHASE_TYPES.includes(x.tipo)) errors.push(`Un e-CF tipo ${x.tipo} lo emite el comprador: este no puede ser una compra tuya`);
    const side: 'SALES' | 'PURCHASES' = own && !ownPurchase ? 'SALES' : 'PURCHASES';
    const type = x.tipo === '34' ? InvoiceType.CREDIT_NOTE : x.tipo === '33' ? InvoiceType.DEBIT_NOTE : side === 'SALES' ? InvoiceType.SALE : InvoiceType.PURCHASE;
    const issuerRnc = x.emisor.rnc;

    // Cliente o proveedor: se busca por RNC; si no existe, se crea al confirmar
    const counterpart = own ? x.comprador : x.emisor;
    const fallbackName = side === 'SALES' && !counterpart.rnc ? CONSUMER : x.tipo === '43' && !counterpart.rnc ? MINOR : '';
    const partnerName = (counterpart.name || fallbackName).slice(0, 200);
    if (!partnerName) errors.push(`El e-CF no trae el nombre del ${side === 'SALES' ? 'cliente' : 'proveedor'}`);
    if (!counterpart.rnc && side === 'PURCHASES' && !ownPurchase) errors.push('El e-CF no trae el RNC del proveedor');
    if (!counterpart.rnc && side === 'SALES' && x.tipo !== '32') errors.push('El e-CF no trae el RNC del cliente (solo la factura de consumo E32 puede ir sin él)');
    const partnerType = side === 'SALES' ? PartnerType.CUSTOMER : PartnerType.SUPPLIER;
    const partner = counterpart.rnc
      ? await db.partner.findFirst({ where: { companyId, taxId: counterpart.rnc } })
      : await db.partner.findFirst({ where: { companyId, taxId: null, name: partnerName } });
    if (partner && !partner.active) errors.push(`${partner.name} está inactivo: actívalo antes de importar`);
    if (partner && partner.type === (side === 'SALES' ? PartnerType.SUPPLIER : PartnerType.CUSTOMER)) {
      errors.push(`${partner.name} está registrado como ${side === 'SALES' ? 'proveedor' : 'cliente'}: cámbialo a "cliente y proveedor"`);
    }

    // Duplicado: el candado de la base es (empresa, RNC emisor, e-NCF); aquí se avisa antes
    const dup = x.eNcf && issuerRnc
      ? await db.ecfDocument.findFirst({ where: { companyId, issuerRnc, eNcf: x.eNcf }, include: { invoice: { select: { number: true } } } })
      : null;
    if (dup) errors.push(`Este e-CF ya está registrado (${dup.invoice.number})`);

    // Nota: la factura que modifica tiene que estar registrada (se enlaza y se acredita)
    let relatedInvoiceId: string | null = null;
    if (type === InvoiceType.CREDIT_NOTE || type === InvoiceType.DEBIT_NOTE) {
      if (!x.ncfModificado) errors.push('La nota no trae el NCF que modifica (InformacionReferencia/NCFModificado)');
      else {
        const rel = await db.invoice.findFirst({
          where: {
            companyId, ncf: x.ncfModificado, type: side === 'SALES' ? InvoiceType.SALE : InvoiceType.PURCHASE,
            status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOIDED] }, ...(partner ? { partnerId: partner.id } : {}),
          },
          select: { id: true },
        });
        if (!rel) errors.push(`No está registrada la factura ${x.ncfModificado} que modifica esta nota: regístrala o impórtala primero`);
        relatedInvoiceId = rel?.id ?? null;
      }
    }

    // ITBIS de la empresa para cada tasa usada
    const taxes = await db.taxRate.findMany({
      where: { companyId, type: TaxType.ITBIS, isWithholding: false, active: true, appliesTo: { in: ['BOTH', side] } },
    });
    let subtotal = ZERO, itbis = ZERO;
    for (const l of x.lines) {
      const net = r2(D(l.quantity).times(D(l.unitPrice)).minus(D(l.discount)));
      subtotal = subtotal.plus(net);
      if (l.itbisRate === null) continue;
      const t = taxes.find((tr) => tr.rate.equals(l.itbisRate!));
      if (t) l.taxRateId = t.id;
      else if (l.itbisRate > 0) errors.push(`Crea el impuesto "ITBIS ${l.itbisRate}%" para ${side === 'SALES' ? 'ventas' : 'compras'} antes de importar`);
      itbis = itbis.plus(r2(net.times(l.itbisRate).div(100)));
    }
    const computed = subtotal.plus(itbis);
    // Tolerancia: un centavo por línea (cada sistema redondea el ITBIS por línea o por total)
    if (x.lines.length && computed.minus(x.montoTotal).abs().gt(D(0.01).times(x.lines.length))) {
      errors.push(`El total calculado (${computed.toFixed(2)}) no coincide con el MontoTotal del XML (${x.montoTotal.toFixed(2)})`);
    }
    warnings.push('El sistema no verifica la firma del XML con la DGII: la factura quedará marcada "No verificado".');

    return {
      type, side, ecfType: x.tipo, eNcf: x.eNcf, issueDate: x.issueDate, issuerRnc,
      partner: partner
        ? { id: partner.id, name: partner.name, taxId: partner.taxId, isNew: false, type: partner.type }
        : { id: null, name: partnerName, taxId: counterpart.rnc || null, isNew: true, type: partnerType },
      relatedInvoiceId, relatedNcf: x.ncfModificado,
      incomeType: x.incomeType && /^0[1-6]$/.test(x.incomeType) ? x.incomeType : null,
      lines: x.lines,
      totals: { subtotal: subtotal.toFixed(2), itbis: itbis.toFixed(2), total: computed.toFixed(2), xmlTotal: x.montoTotal.toFixed(2) },
      errors, warnings, canImport: errors.length === 0, duplicate: !!dup,
    };
  }

  // ------------------------------------------------------------------
  // Preparar: uno por uno, se guarda el XML y la vista previa
  // ------------------------------------------------------------------
  async prepare(files: UploadedFileLike[] | undefined, user: AuthUser) {
    if (!files?.length) throw new BadRequestException('Elige al menos un archivo XML');
    const out = [];
    for (const f of files) {
      const fileName = sanitizeFileName(f.originalname);
      const xml = f.buffer.toString('utf8');
      let preview: ImportPreview;
      try {
        preview = await this.analyze(xml, user);
      } catch (e) {
        if (e instanceof UnprocessableEntityException) { out.push({ importId: null, fileName, error: e.message }); continue; }
        throw e;
      }
      const storageKey = `${user.companyId}/ecf-xml/${randomUUID()}.xml`;
      await this.storage.save(storageKey, f.buffer);
      const row = await this.prisma.ecfImport.create({
        data: {
          companyId: user.companyId, createdById: user.id, fileName, storageKey,
          sha256: createHash('sha256').update(f.buffer).digest('hex'),
          preview: JSON.parse(JSON.stringify(preview)) as Prisma.InputJsonValue,
        },
      });
      out.push({ importId: row.id, fileName, preview });
    }
    return out;
  }

  async list(user: AuthUser) {
    return this.prisma.ecfImport.findMany({
      where: { companyId: user.companyId },
      select: { id: true, fileName: true, status: true, invoiceId: true, createdAt: true, preview: true },
      orderBy: { createdAt: 'desc' }, take: 50,
    });
  }

  private async prepared(id: string, user: AuthUser) {
    const row = await this.prisma.ecfImport.findFirst({ where: { id, companyId: user.companyId } });
    if (!row) throw new NotFoundException('Importación no encontrada');
    if (row.status !== EcfImportStatus.PREPARED) throw new ConflictException(row.status === EcfImportStatus.IMPORTED ? 'Este XML ya se importó' : 'Esta importación se descartó');
    return row;
  }

  async discard(id: string, user: AuthUser) {
    const row = await this.prepared(id, user);
    await this.prisma.ecfImport.updateMany({ where: { id: row.id, companyId: user.companyId, status: EcfImportStatus.PREPARED }, data: { status: EcfImportStatus.DISCARDED } });
    await this.storage.remove(row.storageKey);
    return { discarded: true };
  }

  // ------------------------------------------------------------------
  // Confirmar: factura + asiento + EcfDocument en UNA transacción
  // ------------------------------------------------------------------
  async confirm(id: string, dto: ConfirmEcfImportDto, user: AuthUser) {
    const row = await this.prepared(id, user);
    const xml = (await this.storage.read(row.storageKey)).toString('utf8');
    try {
      const invoiceId = await this.prisma.$transaction(async (tx) => {
        // Si alguien la confirmó a la vez, solo una pasa
        const claimed = await tx.ecfImport.updateMany({ where: { id, companyId: user.companyId, status: EcfImportStatus.PREPARED }, data: { status: EcfImportStatus.IMPORTED } });
        if (claimed.count === 0) throw new ConflictException('Este XML ya se importó');
        const p = await this.analyze(xml, user, tx);
        if (p.duplicate) throw new ConflictException('Este e-CF ya está registrado');
        if (!p.canImport) throw new UnprocessableEntityException({ message: `El XML tiene ${p.errors.length} problema(s); corrígelos antes de importar`, errors: p.errors });

        const partnerId = p.partner.id ?? await this.createPartner(tx, p.partner, user);
        const ownNcf = p.side === 'SALES' || OWN_PURCHASE_TYPES.includes(p.ecfType);
        const ncfType = p.eNcf.slice(0, 3);
        const incomeType = dto.dgiiIncomeType ?? p.incomeType ?? undefined;
        const invId = await this.invoicing.createInTx(tx, {
          type: p.type, partnerId, issueDate: p.issueDate, issueNow: true,
          ...(ownNcf ? { ncfType } : { ncf: p.eNcf }),
          ...(p.relatedInvoiceId ? { relatedInvoiceId: p.relatedInvoiceId } : {}),
          ...(p.side === 'SALES' ? { dgiiIncomeType: incomeType } : { dgiiExpenseType: dto.dgiiExpenseType }),
          notes: `Importada de XML e-CF (${row.fileName})`,
          lines: p.lines.map((l) => ({
            description: l.description, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), discount: Number(l.discount),
            ...(l.taxRateId ? { taxRateId: l.taxRateId } : {}),
          })),
        }, user, ownNcf ? { assignedNcf: p.eNcf } : {});

        await tx.ecfDocument.create({
          data: {
            companyId: user.companyId, invoiceId: invId, ecfType: p.ecfType, eNcf: p.eNcf, issuerRnc: p.issuerRnc,
            status: EcfStatus.IMPORTED, origin: EcfOrigin.IMPORTED, verification: EcfVerification.UNVERIFIED, xmlFileUrl: row.storageKey,
          },
        });
        // Una nota de crédito importada acredita la factura que modifica (lo que quede abierto de ella)
        if (p.type === InvoiceType.CREDIT_NOTE && p.relatedInvoiceId) await this.applyCredit(tx, invId, p.relatedInvoiceId, user);
        await tx.ecfImport.updateMany({ where: { id, companyId: user.companyId }, data: { invoiceId: invId } });
        await writeAudit(tx, user, 'EcfImport', id, AuditAction.CREATE, { invoiceId: invId, eNcf: p.eNcf, sha256: row.sha256, side: p.side });
        return invId;
      });
      return { invoice: await this.invoicing.get(invoiceId, user) };
    } catch (e) {
      // Dos importaciones simultáneas del mismo e-CF: el candado de la base deja pasar una
      if (isUniqueViolation(e)) throw new ConflictException('Este e-CF ya está registrado');
      throw e;
    }
  }

  private async createPartner(tx: Tx, p: ImportPreview['partner'], user: AuthUser) {
    const { taxId, taxIdType } = resolveTaxId(p.taxId);
    const row = await tx.partner.create({ data: { companyId: user.companyId, type: p.type, name: p.name, taxId, taxIdType } });
    await writeAudit(tx, user, 'Partner', row.id, AuditAction.CREATE, { name: row.name, type: row.type, source: 'ecf-import' });
    return row.id;
  }

  private async applyCredit(tx: Tx, noteId: string, invoiceId: string, user: AuthUser) {
    const [note, inv] = await Promise.all([
      tx.invoice.findFirstOrThrow({ where: { id: noteId, companyId: user.companyId } }),
      tx.invoice.findFirstOrThrow({ where: { id: invoiceId, companyId: user.companyId } }),
    ]);
    if (!OPEN_STATUSES.includes(inv.status) || note.currency !== inv.currency) return;
    const amount = Prisma.Decimal.min(note.balance, inv.balance);
    if (amount.lte(0)) return;
    await applyToInvoice(tx, user.companyId, note.id, amount);
    await applyToInvoice(tx, user.companyId, inv.id, amount);
    await writeAudit(tx, user, 'Invoice', inv.id, AuditAction.UPDATE, { creditApplied: amount.toString(), creditNote: note.number, creditNoteId: note.id });
  }
}
