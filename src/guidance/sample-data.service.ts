import { Injectable, UnprocessableEntityException } from '@nestjs/common';
import { AuditAction, FiscalPeriodStatus, PartnerType } from '../generated/prisma/enums.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { PartnersService } from '../masters/partners/partners.service.js';
import { InvoicingService } from '../invoicing/invoicing.service.js';
import { PaymentsService } from '../receivables-payables/payments.service.js';

type Tx = Prisma.TransactionClient;
type Kind = 'Partner' | 'Invoice' | 'Payment' | 'BankAccount' | 'BankTransaction' | 'NcfSequence';

// Datos ficticios dominicanos (RNC con formato válido pero inventado; ninguna persona real)
const CUSTOMERS = [
  { name: 'Colmado La Esquina SRL', taxId: '130000101' }, { name: 'Ferretería El Clavo SRL', taxId: '130000102' },
  { name: 'Distribuidora Caribe Azul SAS', taxId: '130000103' }, { name: 'Panadería Doña Rosa EIRL', taxId: '130000104' },
  { name: 'Consultores del Cibao SRL', taxId: '130000105' },
];
const SUPPLIERS = [
  { name: 'Suministros Oficina Express SRL', taxId: '130000201' }, { name: 'Transporte Rápido del Este SRL', taxId: '130000202' },
  { name: 'Servicios de Limpieza Brillante SRL', taxId: '130000203' },
];
const SALES = [12000, 8500, 23000, 4300, 15750, 9900, 31000, 6200, 18400, 2750];
const PURCHASES = [5400, 3200, 7800, 2100, 4600];

const daysAgo = (n: number) => { const d = new Date(); d.setUTCDate(d.getUTCDate() - n); return d.toISOString().slice(0, 10); };

/**
 * Datos de ejemplo borrables (E1c). Se crean A TRAVÉS de los servicios existentes (mismas reglas, mismos asientos) y
 * cada registro se anota en SampleRecord. El borrado es el ÚNICO lugar del sistema que borra documentos contabilizados
 * (excepción documentada a R2): solo lo anotado, siempre con companyId, en una transacción y con bitácora.
 */
@Injectable()
export class SampleDataService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly partners: PartnersService,
    private readonly invoicing: InvoicingService,
    private readonly payments: PaymentsService,
  ) {}

  async status(user: AuthUser) {
    const n = await this.prisma.sampleRecord.count({ where: { companyId: user.companyId } });
    return { loaded: n > 0, records: n };
  }

  private note(tx: Tx | PrismaService, companyId: string, entityType: Kind, entityId: string) {
    return tx.sampleRecord.create({ data: { companyId, entityType, entityId } });
  }

  async load(user: AuthUser) {
    const { companyId } = user;
    const [docs, samples, settings, journals, b02, bankGl] = await Promise.all([
      this.prisma.invoice.count({ where: { companyId } }),
      this.prisma.sampleRecord.count({ where: { companyId } }),
      this.prisma.accountingSettings.findUnique({ where: { companyId } }),
      this.prisma.journal.count({ where: { companyId, active: true } }),
      this.prisma.ncfSequence.count({ where: { companyId, ncfType: 'B02' } }),
      this.prisma.account.findFirst({ where: { companyId, active: true, isPostable: true, type: 'ASSET', OR: [{ code: { startsWith: '1101-03' } }, { name: { contains: 'Banco', mode: 'insensitive' } }] }, orderBy: { code: 'asc' } }),
    ]);
    if (samples) throw new UnprocessableEntityException('Ya cargaste los datos de ejemplo. Bórralos antes de volver a cargarlos');
    if (docs) throw new UnprocessableEntityException('Tu empresa ya tiene documentos reales: los datos de ejemplo solo se cargan en una empresa vacía');
    if (!settings?.receivableAccountId || !journals) throw new UnprocessableEntityException('Primero prepara tu contabilidad (plan de cuentas, cuentas automáticas y diarios) en Configuración inicial');
    if (b02) throw new UnprocessableEntityException('Ya configuraste comprobantes B02 reales: los ejemplos no deben gastar tus números. Prueba en una empresa nueva');
    if (!bankGl) throw new UnprocessableEntityException('Falta una cuenta contable de banco en tu plan de cuentas (por ejemplo 1101-03-01)');
    const itbis = await this.prisma.taxRate.findFirst({ where: { companyId, active: true, type: 'ITBIS', isWithholding: false, salesAccountId: { not: null }, purchaseAccountId: { not: null } }, orderBy: { rate: 'desc' } });

    const tag = (s: string) => `${s} (ejemplo)`;
    // Secuencia de ejemplo: los números que se gastan aquí no son de la DGII
    const seq = await this.prisma.ncfSequence.create({ data: { companyId, ncfType: 'B02', prefix: 'B02', rangeStart: 1, rangeEnd: 500, currentNumber: 0, active: true } });
    await this.note(this.prisma, companyId, 'NcfSequence', seq.id);
    const bank = await this.prisma.bankAccount.create({ data: { companyId, bankName: 'Banco de Ejemplo', accountNumber: '000-EJEMPLO-01', glAccountId: bankGl.id } });
    await this.note(this.prisma, companyId, 'BankAccount', bank.id);

    const custIds: string[] = [];
    for (const c of CUSTOMERS) {
      const p = await this.partners.create({ type: PartnerType.CUSTOMER, name: tag(c.name), taxId: c.taxId }, user);
      await this.note(this.prisma, companyId, 'Partner', p.id); custIds.push(p.id);
    }
    const suppIds: string[] = [];
    for (const s of SUPPLIERS) {
      const p = await this.partners.create({ type: PartnerType.SUPPLIER, name: tag(s.name), taxId: s.taxId }, user);
      await this.note(this.prisma, companyId, 'Partner', p.id); suppIds.push(p.id);
    }
    const line = (amount: number, description: string) => ({ description, quantity: 1, unitPrice: amount, ...(itbis ? { taxRateId: itbis.id } : {}) });

    const sales: { id: string; total: number; partnerId: string }[] = [];
    for (const [i, amount] of SALES.entries()) {
      const inv = await this.invoicing.create({
        type: 'SALE', partnerId: custIds[i % custIds.length], issueDate: daysAgo(25 - i * 2), ncfType: 'B02', issueNow: true,
        lines: [line(amount, 'Venta de ejemplo')], withholdings: [],
      } as never, user);
      await this.note(this.prisma, companyId, 'Invoice', inv.id);
      sales.push({ id: inv.id, total: Number(inv.total), partnerId: inv.partnerId });
    }
    const buys: { id: string; total: number; partnerId: string }[] = [];
    for (const [i, amount] of PURCHASES.entries()) {
      const inv = await this.invoicing.create({
        type: 'PURCHASE', partnerId: suppIds[i % suppIds.length], issueDate: daysAgo(24 - i * 3), ncf: `B01${String(90000000 + i + 1)}`,
        dgiiExpenseType: '02', issueNow: true, lines: [line(amount, 'Compra de ejemplo')], withholdings: [],
      } as never, user);
      await this.note(this.prisma, companyId, 'Invoice', inv.id);
      buys.push({ id: inv.id, total: Number(inv.total), partnerId: inv.partnerId });
    }
    // 4 cobros y 2 pagos por banco, con su movimiento en el extracto de ejemplo
    const pays = [...sales.slice(0, 4).map((s) => ({ ...s, direction: 'RECEIVED' as const })), ...buys.slice(0, 2).map((b) => ({ ...b, direction: 'MADE' as const }))];
    for (const [i, x] of pays.entries()) {
      const date = daysAgo(10 - i);
      const p = await this.payments.create({
        direction: x.direction, partnerId: x.partnerId, date, amount: x.total, method: 'BANK_TRANSFER', bankAccountId: bank.id,
        reference: `EJEMPLO-${i + 1}`, allocations: [{ invoiceId: x.id, amount: x.total }],
      } as never, user);
      await this.note(this.prisma, companyId, 'Payment', p.id);
      const t = await this.prisma.bankTransaction.create({
        data: { bankAccountId: bank.id, date: new Date(`${date}T00:00:00Z`), description: `${x.direction === 'RECEIVED' ? 'Depósito' : 'Transferencia'} de ejemplo ${i + 1}`, reference: `EJEMPLO-${i + 1}`, amount: x.direction === 'RECEIVED' ? x.total : -x.total },
      });
      await this.note(this.prisma, companyId, 'BankTransaction', t.id);
    }
    await this.prisma.$transaction((tx) => writeAudit(tx, user, 'Company', companyId, AuditAction.CREATE, { event: 'SAMPLE_DATA_LOADED', clientes: CUSTOMERS.length, proveedores: SUPPLIERS.length, facturas: SALES.length + PURCHASES.length, pagos: pays.length }));
    return this.status(user);
  }

  /** Borra SOLO lo anotado en SampleRecord de esta empresa, en orden inverso de dependencias. */
  async remove(user: AuthUser) {
    const { companyId } = user;
    const recs = await this.prisma.sampleRecord.findMany({ where: { companyId } });
    if (!recs.length) throw new UnprocessableEntityException('No hay datos de ejemplo para borrar');
    const ids = (k: Kind) => recs.filter((r) => r.entityType === k).map((r) => r.entityId);
    const invoiceIds = ids('Invoice'), paymentIds = ids('Payment'), partnerIds = ids('Partner');
    const bankIds = ids('BankAccount'), txIds = ids('BankTransaction'), seqIds = ids('NcfSequence');

    // Negativas: algo real depende de un ejemplo, o un período con ejemplos ya se cerró
    const [realAlloc, realNotes, realInvoices, realPayments, closed] = await Promise.all([
      this.prisma.paymentAllocation.count({ where: { invoiceId: { in: invoiceIds }, paymentId: { notIn: paymentIds }, payment: { companyId } } }),
      this.prisma.invoice.count({ where: { companyId, relatedInvoiceId: { in: invoiceIds }, id: { notIn: invoiceIds } } }),
      this.prisma.invoice.count({ where: { companyId, partnerId: { in: partnerIds }, id: { notIn: invoiceIds } } }),
      this.prisma.payment.count({ where: { companyId, OR: [{ partnerId: { in: partnerIds } }, { bankAccountId: { in: bankIds } }], id: { notIn: paymentIds } } }),
      this.closedPeriodWithSamples(companyId, invoiceIds, paymentIds),
    ]);
    if (realAlloc || realNotes) throw new UnprocessableEntityException('Un documento real usa una factura de ejemplo (un cobro aplicado o una nota). Anula ese documento real antes de borrar los ejemplos');
    if (realInvoices || realPayments) throw new UnprocessableEntityException('Registraste documentos reales con un cliente, proveedor o banco de ejemplo. Anúlalos o cámbialos antes de borrar los ejemplos');
    if (closed) throw new UnprocessableEntityException(`El período ${closed} tiene datos de ejemplo y ya está cerrado. Reábrelo para poder borrarlos`);

    const counts = await this.prisma.$transaction(async (tx) => {
      const where = { companyId };
      const payEntries = (await tx.payment.findMany({ where: { ...where, id: { in: paymentIds } }, select: { journalEntryId: true } })).map((p) => p.journalEntryId);
      const invEntries = (await tx.invoice.findMany({ where: { ...where, id: { in: invoiceIds } }, select: { journalEntryId: true } })).map((i) => i.journalEntryId);
      const entryIds = [...payEntries, ...invEntries].filter((x): x is string => !!x);
      // Incluye los reversos de esos asientos (si alguien anuló un ejemplo)
      const reversals = (await tx.journalEntry.findMany({ where: { ...where, reversalOfId: { in: entryIds } }, select: { id: true } })).map((e) => e.id);
      const allEntries = [...entryIds, ...reversals];

      await tx.bankMatch.deleteMany({ where: { bankTransaction: { bankAccount: where }, OR: [{ bankTransactionId: { in: txIds } }, { journalEntryLine: { journalEntryId: { in: allEntries } } }] } });
      await tx.bankTransaction.deleteMany({ where: { id: { in: txIds }, bankAccount: where } });
      await tx.paymentAllocation.deleteMany({ where: { paymentId: { in: paymentIds }, payment: where } });
      await tx.attachment.deleteMany({ where: { ...where, OR: [{ invoiceId: { in: invoiceIds } }, { paymentId: { in: paymentIds } }] } });
      const pays = await tx.payment.deleteMany({ where: { ...where, id: { in: paymentIds } } });
      await tx.invoiceWithholding.deleteMany({ where: { invoiceId: { in: invoiceIds }, invoice: where } });
      await tx.invoiceLine.deleteMany({ where: { invoiceId: { in: invoiceIds }, invoice: where } });
      await tx.ecfDocument.deleteMany({ where: { ...where, invoiceId: { in: invoiceIds } } });
      const invs = await tx.invoice.deleteMany({ where: { ...where, id: { in: invoiceIds } } });
      await tx.journalEntry.updateMany({ where: { ...where, id: { in: allEntries } }, data: { reversalOfId: null } });
      await tx.journalEntryLine.deleteMany({ where: { journalEntryId: { in: allEntries }, journalEntry: where } });
      const entries = await tx.journalEntry.deleteMany({ where: { ...where, id: { in: allEntries } } });
      await tx.bankAccount.deleteMany({ where: { ...where, id: { in: bankIds } } });
      const parts = await tx.partner.deleteMany({ where: { ...where, id: { in: partnerIds } } });
      await tx.ncfSequence.deleteMany({ where: { ...where, id: { in: seqIds } } });
      await tx.sampleRecord.deleteMany({ where });
      const c = { facturas: invs.count, pagos: pays.count, asientos: entries.count, terceros: parts.count, movimientosBanco: txIds.length };
      await writeAudit(tx, user, 'Company', companyId, AuditAction.DELETE, { event: 'SAMPLE_DATA_DELETED', ...c });
      return c;
    }, { timeout: 60_000 });
    return { deleted: counts };
  }

  private async closedPeriodWithSamples(companyId: string, invoiceIds: string[], paymentIds: string[]) {
    const dates = [
      ...(await this.prisma.invoice.findMany({ where: { companyId, id: { in: invoiceIds } }, select: { issueDate: true } })).map((i) => i.issueDate),
      ...(await this.prisma.payment.findMany({ where: { companyId, id: { in: paymentIds } }, select: { date: true } })).map((p) => p.date),
    ];
    if (!dates.length) return null;
    const min = new Date(Math.min(...dates.map((d) => d.getTime()))), max = new Date(Math.max(...dates.map((d) => d.getTime())));
    const p = await this.prisma.fiscalPeriod.findFirst({ where: { companyId, status: FiscalPeriodStatus.CLOSED, startDate: { lte: max }, endDate: { gte: min } } });
    return p?.name ?? null;
  }
}
