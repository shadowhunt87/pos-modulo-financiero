import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Reglas fiscales y de integridad de la facturación: qué comprobante corresponde a cada
 * documento, e-NCF sin proveedor conectado, moneda de las notas, límite de crédito en moneda base,
 * y cuentas y centros de costo de otra empresa.
 */
describe('Facturación: reglas fiscales (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `invr-${r}-${sfx}@test.local`;
  const today = new Date().toISOString().slice(0, 10);
  let companyA: string;
  let companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let customer: string, supplier: string, itbis: string, foreignCostCenter: string;

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const sale = (over: Record<string, unknown> = {}) => ({
    type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', issueNow: true,
    lines: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, taxRateId: itbis }], ...over,
  });
  const purchase = (over: Record<string, unknown> = {}) => ({
    type: 'PURCHASE', partnerId: supplier, issueDate: today, issueNow: true,
    lines: [{ description: 'Insumos', quantity: 1, unitPrice: 500, taxRateId: itbis }], ...over,
  });
  const seq = async (ncfType: string) =>
    (await prisma.ncfSequence.findFirstOrThrow({ where: { companyId: companyA, ncfType } })).currentNumber;

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `IR A ${sfx}`, taxId: `IR-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `IR B ${sfx}`, taxId: `IR-B-${sfx}` } })).id;
    const users: [string, UserRole, string][] = [['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA]];
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password });
      token[r] = res.body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE', extra = {}) =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type, ...extra } })).id);
    await mk('cxc', '1201', 'ASSET'); await mk('cxp', '2101', 'LIABILITY');
    await mk('ventas', '4101', 'INCOME'); await mk('gastos', '5101', 'EXPENSE');
    await mk('itbisPagar', '2201', 'LIABILITY'); await mk('itbisAdel', '1301', 'ASSET');
    await mk('titulo', '4000', 'INCOME', { isPostable: false });

    await api('post', '/journals/defaults', 'admin').expect(201);
    for (const t of ['B01', 'B04', 'B11', 'B17', 'E31']) {
      await api('post', '/ncf/sequences', 'admin').send({ ncfType: t, rangeStart: 1, rangeEnd: 100 }).expect(201);
    }
    await api('put', '/settings/accounting', 'admin').send({
      receivableAccountId: acc.cxc, payableAccountId: acc.cxp, salesIncomeAccountId: acc.ventas, purchaseExpenseAccountId: acc.gastos,
    }).expect(200);
    customer = (await api('post', '/partners', 'acct').send({
      type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131123456', creditLimit: 10000,
    }).expect(201)).body.id;
    supplier = (await api('post', '/partners', 'acct').send({ type: 'SUPPLIER', name: 'Proveedor SA', taxId: '101010101' }).expect(201)).body.id;
    itbis = (await api('post', '/tax-rates', 'acct').send({
      name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: acc.itbisPagar, purchaseAccountId: acc.itbisAdel,
    }).expect(201)).body.id;
    foreignCostCenter = (await prisma.costCenter.create({ data: { companyId: companyB, name: `Ajeno ${sfx}` } })).id;
  }, 60_000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.invoiceWithholding.deleteMany({ where: { invoice: where } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: where } });
    await prisma.invoice.updateMany({ where, data: { relatedInvoiceId: null } });
    await prisma.invoice.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where: { user: where } });
    await prisma.ncfSequence.deleteMany({ where });
    await prisma.documentSequence.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.accountingSettings.deleteMany({ where });
    await prisma.taxRate.deleteMany({ where });
    await prisma.costCenter.deleteMany({ where });
    await prisma.partner.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }, 60_000);

  describe('comprobante según el documento', () => {
    it('una venta no puede gastar la secuencia de compras (B11)', async () => {
      const res = await api('post', '/invoices', 'acct').send(sale({ ncfType: 'B11' })).expect(422);
      expect(res.body.message).toContain('B11');
      expect(await seq('B11')).toBe(0);
    });

    it('una nota de crédito de venta solo usa B04/E34', async () => {
      const original = (await api('post', '/invoices', 'acct').send(sale()).expect(201)).body;
      await api('post', '/invoices', 'acct').send(sale({
        type: 'CREDIT_NOTE', relatedInvoiceId: original.id, ncfType: 'B01',
        lines: [{ description: 'Devolución', quantity: 1, unitPrice: 100, taxRateId: itbis }],
      })).expect(422);
      const ok = await api('post', '/invoices', 'acct').send(sale({
        type: 'CREDIT_NOTE', relatedInvoiceId: original.id, ncfType: undefined,
        lines: [{ description: 'Devolución', quantity: 1, unitPrice: 100, taxRateId: itbis }],
      })).expect(201);
      expect(ok.body.ncf).toBe('B0400000001');
    });

    it('tipo de comprobante inexistente: 422 en español', async () => {
      const res = await api('post', '/invoices', 'acct').send(sale({ ncfType: 'X99' })).expect(422);
      expect(res.body.message).toContain('Tipo de comprobante inválido');
    });

    it('compra a proveedor informal con B11 y pago al exterior con B17: el NCF sale de la secuencia propia', async () => {
      const b11 = await api('post', '/invoices', 'acct').send(purchase({ ncfType: 'B11' })).expect(201);
      expect(b11.body.ncf).toBe('B1100000001');
      const b17 = await api('post', '/invoices', 'acct').send(purchase({ ncfType: 'B17' })).expect(201);
      expect(b17.body.ncf).toBe('B1700000001');
    });
  });

  describe('e-CF (serie E) sin proveedor conectado', () => {
    it('no toma un e-NCF de la secuencia local: manda a emitir en el portal e importar el XML', async () => {
      const res = await api('post', '/invoices', 'acct').send(sale({ ncfType: 'E31' })).expect(422);
      expect(res.body.message).toContain('importa el XML');
      expect(await seq('E31')).toBe(0);
      // Tampoco con un e-NCF escrito a mano ni en compras propias electrónicas
      await api('post', '/invoices', 'acct').send(sale({ ncfType: 'E31', ncf: 'E310000000007' })).expect(422);
      await api('post', '/invoices', 'acct').send(purchase({ ncfType: 'E41' })).expect(422);
      expect(await seq('E31')).toBe(0);
    });

    it('la nota de una factura electrónica es de la serie E (B04 se rechaza)', async () => {
      // Factura electrónica registrada (como la dejará la importación de XML)
      const original = (await api('post', '/invoices', 'acct').send(sale()).expect(201)).body;
      await prisma.invoice.update({ where: { id: original.id, companyId: companyA }, data: { ncf: 'E310000000020', ncfType: 'E31' } });
      const res = await api('post', '/invoices', 'acct').send(sale({
        type: 'CREDIT_NOTE', relatedInvoiceId: original.id, ncfType: 'B04',
        lines: [{ description: 'Devolución', quantity: 1, unitPrice: 100, taxRateId: itbis }],
      })).expect(422);
      expect(res.body.message).toContain('serie E');
    });
  });

  describe('integridad', () => {
    it('la nota debe estar en la moneda de la factura que modifica', async () => {
      const original = (await api('post', '/invoices', 'acct').send(sale()).expect(201)).body;
      const res = await api('post', '/invoices', 'acct').send(sale({
        type: 'CREDIT_NOTE', relatedInvoiceId: original.id, ncfType: undefined, currency: 'USD', exchangeRate: 60,
        lines: [{ description: 'Devolución', quantity: 1, unitPrice: 10, taxRateId: itbis }],
      })).expect(422);
      expect(res.body.message).toContain('misma moneda');
    });

    it('el límite de crédito compara en moneda base (USD × tasa)', async () => {
      // Ya hay ventas abiertas en DOP. 60 USD × 60 = 3,600 DOP por factura (sin ITBIS para simplificar)
      const usd = () => sale({ ncfType: 'B01', currency: 'USD', exchangeRate: 60, lines: [{ description: 'Servicio', quantity: 1, unitPrice: 60 }] });
      const open = await prisma.invoice.findMany({ where: { companyId: companyA, partnerId: customer, status: 'ISSUED', type: 'SALE' } });
      const openBase = open.reduce((s, i) => s + Number(i.balance) * Number(i.exchangeRate), 0);
      const fits = Math.floor((10000 - openBase) / 3600);
      for (let i = 0; i < fits; i++) await api('post', '/invoices', 'acct').send(usd()).expect(201);
      // Sumando "60 + 60..." sin convertir nunca llegaría a 10,000; convertido, la siguiente se pasa
      const res = await api('post', '/invoices', 'acct').send(usd()).expect(422);
      expect(res.body.message).toContain('límite de crédito');
    });

    it('rechaza un centro de costo de otra empresa y una cuenta de agrupación en las líneas', async () => {
      await api('post', '/invoices', 'acct').send(sale({
        issueNow: false, lines: [{ description: 'X', quantity: 1, unitPrice: 10, costCenterId: foreignCostCenter }],
      })).expect(404);
      const res = await api('post', '/invoices', 'acct').send(sale({
        issueNow: false, lines: [{ description: 'X', quantity: 1, unitPrice: 10, accountId: acc.titulo }],
      })).expect(422);
      expect(res.body.message).toContain('4000');
    });

    it('el tipo de NCF por defecto del cliente se valida y se guarda en mayúsculas', async () => {
      await api('post', '/partners', 'acct').send({ type: 'CUSTOMER', name: 'Malo', defaultNcfType: 'XYZ' }).expect(400);
      const ok = await api('post', '/partners', 'acct').send({ type: 'CUSTOMER', name: 'Bueno', defaultNcfType: 'b02' }).expect(201);
      expect(ok.body.defaultNcfType).toBe('B02');
    });
  });
});
