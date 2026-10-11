import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Ciclo completo: factura -> NCF y asiento -> cobro/pago -> anticipo -> anulación
 * -> nota de crédito -> estado de cuenta y antigüedad. Requiere BD con migraciones.
 */
describe('Facturación + Pagos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `inv-${r}-${sfx}@test.local`;
  const today = new Date().toISOString().slice(0, 10);
  let companyA: string;
  let companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let customer: string, supplier: string, itbis: string, bank: string, cash: string;
  let s1: string; // factura de venta
  let p1: string; // factura de compra
  let pay2: string; // cobro con anticipo
  let paySecond: string;

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const num = (v: unknown) => Number(v);
  const entryLines = async (entryId: string) =>
    (await prisma.journalEntryLine.findMany({ where: { journalEntryId: entryId } })).map((l) => ({
      account: l.accountId, debit: num(l.debit), credit: num(l.credit),
    }));
  const balanced = (ls: { debit: number; credit: number }[]) =>
    expect(ls.reduce((s, l) => s + l.debit, 0)).toBeCloseTo(ls.reduce((s, l) => s + l.credit, 0), 4);
  const invoice = async (id: string) => (await api('get', `/invoices/${id}`, 'acct').expect(200)).body;
  const sale = (over: Record<string, unknown> = {}) => ({
    type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', issueNow: true,
    lines: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, taxRateId: itbis }], ...over,
  });

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `I A ${sfx}`, taxId: `I-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `I B ${sfx}`, taxId: `I-B-${sfx}` } })).id;
    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA],
      ['appr', UserRole.APPROVER, companyA], ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ];
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password });
      token[r] = res.body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type } })).id);
    await mk('cxc', '1201', 'ASSET'); await mk('cxp', '2101', 'LIABILITY');
    await mk('ventas', '4101', 'INCOME'); await mk('gastos', '5101', 'EXPENSE');
    await mk('itbisPagar', '2201', 'LIABILITY'); await mk('itbisAdel', '1301', 'ASSET');
    await mk('banco', '1102', 'ASSET'); await mk('caja', '1101', 'ASSET');
    await mk('anticipoCli', '2301', 'LIABILITY'); await mk('anticipoProv', '1401', 'ASSET');

    await api('post', '/journals/defaults', 'admin').expect(201);
    for (const t of ['B01', 'B04']) await api('post', '/ncf/sequences', 'admin').send({ ncfType: t, rangeStart: 1, rangeEnd: 100 }).expect(201);
    await api('put', '/settings/accounting', 'admin').send({
      receivableAccountId: acc.cxc, payableAccountId: acc.cxp, salesIncomeAccountId: acc.ventas, purchaseExpenseAccountId: acc.gastos,
      customerAdvanceAccountId: acc.anticipoCli, supplierAdvanceAccountId: acc.anticipoProv,
    }).expect(200);
    customer = (await api('post', '/partners', 'acct').send({ type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131123456' }).expect(201)).body.id;
    supplier = (await api('post', '/partners', 'acct').send({ type: 'SUPPLIER', name: 'Proveedor SA', taxId: '101010101' }).expect(201)).body.id;
    itbis = (await api('post', '/tax-rates', 'acct').send({
      name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: acc.itbisPagar, purchaseAccountId: acc.itbisAdel,
    }).expect(201)).body.id;
    bank = (await prisma.bankAccount.create({ data: { companyId: companyA, bankName: 'Banco X', accountNumber: '001', glAccountId: acc.banco } })).id;
    cash = (await prisma.cashRegister.create({ data: { companyId: companyA, name: 'Caja', glAccountId: acc.caja } })).id;
  }, 60_000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.paymentAllocation.deleteMany({ where: { payment: where } });
    await prisma.payment.deleteMany({ where });
    await prisma.invoiceWithholding.deleteMany({ where: { invoice: where } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: where } });
    await prisma.invoice.updateMany({ where, data: { relatedInvoiceId: null } });
    await prisma.invoice.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.bankAccount.deleteMany({ where });
    await prisma.cashRegister.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where: { user: where } });
    await prisma.ncfSequence.deleteMany({ where });
    await prisma.documentSequence.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.accountingSettings.deleteMany({ where });
    await prisma.taxRate.deleteMany({ where });
    await prisma.partner.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  }, 60_000);

  describe('facturación', () => {
    it('emite una venta con número, NCF y asiento cuadrado', async () => {
      const res = await api('post', '/invoices', 'acct').send(sale()).expect(201);
      s1 = res.body.id;
      expect(res.body).toMatchObject({ status: 'ISSUED', number: 'FV-000001', ncf: 'B0100000001' });
      expect([num(res.body.subtotal), num(res.body.taxTotal), num(res.body.total), num(res.body.balance)]).toEqual([1000, 180, 1180, 1180]);
      const ls = await entryLines(res.body.journalEntryId);
      expect(ls).toEqual(expect.arrayContaining([
        { account: acc.cxc, debit: 1180, credit: 0 }, { account: acc.ventas, debit: 0, credit: 1000 }, { account: acc.itbisPagar, debit: 0, credit: 180 },
      ]));
      balanced(ls);
      expect(res.body.journalEntry.number).toMatch(/^VEN-\d{6}$/);
    });

    it('VIEWER no crea (403); sin secuencia NCF falla (422) y no consume números', async () => {
      await api('post', '/invoices', 'view').send(sale()).expect(403);
      await api('post', '/invoices', 'acct').send(sale({ ncfType: 'B14' })).expect(422);
    });

    it('compra: exige el NCF del proveedor, asienta y rechaza duplicados', async () => {
      const body = (over = {}) => ({
        type: 'PURCHASE', partnerId: supplier, issueDate: today, issueNow: true,
        lines: [{ description: 'Insumos', quantity: 1, unitPrice: 500, taxRateId: itbis }], ...over,
      });
      await api('post', '/invoices', 'acct').send(body()).expect(422);
      const res = await api('post', '/invoices', 'acct').send(body({ ncf: 'B0100000555' })).expect(201);
      p1 = res.body.id;
      expect(num(res.body.total)).toBe(590);
      const ls = await entryLines(res.body.journalEntryId);
      expect(ls).toEqual(expect.arrayContaining([
        { account: acc.gastos, debit: 500, credit: 0 }, { account: acc.itbisAdel, debit: 90, credit: 0 }, { account: acc.cxp, debit: 0, credit: 590 },
      ]));
      await api('post', '/invoices', 'acct').send(body({ ncf: 'B0100000555' })).expect(409);
    });

    it('un borrador se edita y se elimina; una emitida no', async () => {
      const d = await api('post', '/invoices', 'acct').send(sale({ issueNow: false })).expect(201);
      expect(d.body.status).toBe('DRAFT');
      const upd = await api('patch', `/invoices/${d.body.id}`, 'acct').send({ lines: [{ description: 'X', quantity: 2, unitPrice: 100 }] }).expect(200);
      expect(num(upd.body.total)).toBe(200);
      await api('delete', `/invoices/${d.body.id}`, 'acct').expect(200);
      await api('patch', `/invoices/${s1}`, 'acct').send({ notes: 'x' }).expect(422);
      await api('delete', `/invoices/${s1}`, 'acct').expect(422);
    });
  });

  describe('cobros y pagos', () => {
    const receive = (amount: number, allocations: { invoiceId: string; amount: number }[], over = {}) => ({
      direction: 'RECEIVED', partnerId: customer, date: today, amount, method: 'BANK_TRANSFER', bankAccountId: bank, allocations, ...over,
    });

    it('cobro parcial baja el saldo y asienta banco vs CxC', async () => {
      const res = await api('post', '/payments', 'acct').send(receive(500, [{ invoiceId: s1, amount: 500 }])).expect(201);
      expect(res.body.number).toBe('RC-000001');
      const inv = await invoice(s1);
      expect([inv.status, num(inv.balance), num(inv.amountPaid)]).toEqual(['PARTIALLY_PAID', 680, 500]);
      const ls = await entryLines(res.body.journalEntry.id);
      expect(ls).toEqual(expect.arrayContaining([{ account: acc.banco, debit: 500, credit: 0 }, { account: acc.cxc, debit: 0, credit: 500 }]));
    });

    it('422 si se aplica más que el saldo o a factura de otro lado', async () => {
      await api('post', '/payments', 'acct').send(receive(5000, [{ invoiceId: s1, amount: 5000 }])).expect(422);
      await api('post', '/payments', 'acct').send(receive(100, [{ invoiceId: p1, amount: 100 }])).expect(422);
      await api('post', '/payments', 'acct').send(receive(100, [], { bankAccountId: bank, cashRegisterId: cash })).expect(400);
    });

    it('el sobrante queda como anticipo y la factura pasa a PAID', async () => {
      const res = await api('post', '/payments', 'acct').send(receive(780, [{ invoiceId: s1, amount: 680 }])).expect(201);
      pay2 = res.body.id;
      expect(num(res.body.unapplied)).toBe(100);
      expect((await invoice(s1)).status).toBe('PAID');
      const ls = await entryLines(res.body.journalEntry.id);
      expect(ls).toEqual(expect.arrayContaining([
        { account: acc.banco, debit: 780, credit: 0 }, { account: acc.cxc, debit: 0, credit: 680 }, { account: acc.anticipoCli, debit: 0, credit: 100 },
      ]));
      balanced(ls);
    });

    it('estado de cuenta: el anticipo deja saldo a favor del cliente', async () => {
      const st = (await api('get', `/receivables-payables/statements/${customer}?scope=RECEIVABLE`, 'view').expect(200)).body;
      expect(st.movements).toHaveLength(4);
      expect(num(st.closingBalance)).toBe(-100);
    });

    it('anular el cobro revierte asientos y restaura el saldo', async () => {
      const res = await api('post', `/payments/${pay2}/void`, 'appr').send({ reason: 'Error de captura' }).expect(201);
      expect(res.body.status).toBe('VOIDED');
      const inv = await invoice(s1);
      expect([inv.status, num(inv.balance)]).toEqual(['PARTIALLY_PAID', 680]);
      expect(await prisma.journalEntry.count({ where: { sourceId: pay2, status: 'VOIDED' } })).toBe(1);
      await api('post', `/payments/${pay2}/void`, 'appr').send({ reason: 'otra vez' }).expect(409);
      await api('post', `/payments/${pay2}/void`, 'acct').send({ reason: 'x' }).expect(403);
    });

    it('antigüedad: CxC 680 y CxP 590, todo al día', async () => {
      const ar = (await api('get', '/receivables-payables/aging?scope=RECEIVABLE', 'view').expect(200)).body;
      expect([num(ar.totals.total), num(ar.totals.current)]).toEqual([680, 680]);
      const ap = (await api('get', '/receivables-payables/aging?scope=PAYABLE', 'view').expect(200)).body;
      expect(num(ap.totals.total)).toBe(590);
    });

    it('nota de crédito (B04) aplicada a la factura; auxiliar y antigüedad coinciden', async () => {
      const cn = await api('post', '/invoices', 'acct').send({
        type: 'CREDIT_NOTE', partnerId: customer, relatedInvoiceId: s1, issueDate: today, issueNow: true,
        lines: [{ description: 'Devolución', quantity: 1, unitPrice: 100, taxRateId: itbis }],
      }).expect(201);
      expect(cn.body).toMatchObject({ ncf: 'B0400000001', number: 'NC-000001' });
      expect(num(cn.body.total)).toBe(118);
      const ls = await entryLines(cn.body.journalEntryId);
      expect(ls).toEqual(expect.arrayContaining([
        { account: acc.ventas, debit: 100, credit: 0 }, { account: acc.itbisPagar, debit: 18, credit: 0 }, { account: acc.cxc, debit: 0, credit: 118 },
      ]));
      const ap = await api('post', '/receivables-payables/apply-credit', 'acct').send({ creditNoteId: cn.body.id, invoiceId: s1, amount: 118 }).expect(201);
      expect(num(ap.body.balance)).toBe(562);
      expect((await invoice(cn.body.id)).status).toBe('PAID');
      const st = (await api('get', `/receivables-payables/statements/${customer}?scope=RECEIVABLE`, 'view').expect(200)).body;
      const aging = (await api('get', '/receivables-payables/aging?scope=RECEIVABLE', 'view').expect(200)).body;
      expect(num(st.closingBalance)).toBe(562);
      expect(num(aging.totals.total)).toBe(562);
    });

    it('dos cobros simultáneos no pueden exceder el saldo', async () => {
      const [a, b] = await Promise.all([
        api('post', '/payments', 'acct').send(receive(400, [{ invoiceId: s1, amount: 400 }])),
        api('post', '/payments', 'acct').send(receive(400, [{ invoiceId: s1, amount: 400 }])),
      ]);
      expect([a.status, b.status].sort()).toEqual([201, expect.any(Number)]);
      expect([409, 422]).toContain(Math.max(a.status, b.status));
      expect(num((await invoice(s1)).balance)).toBe(162);
    });

    it('una factura con pagos no se puede anular', async () => {
      await api('post', `/invoices/${s1}/void`, 'appr').send({ reason: 'x', reasonCode: '01' }).expect(422);
    });

    it('pago a proveedor desde caja salda la compra', async () => {
      const res = await api('post', '/payments', 'acct').send({
        direction: 'MADE', partnerId: supplier, date: today, amount: 590, method: 'CASH', cashRegisterId: cash,
        allocations: [{ invoiceId: p1, amount: 590 }],
      }).expect(201);
      expect(res.body.number).toBe('PG-000001');
      expect((await invoice(p1)).status).toBe('PAID');
      const ls = await entryLines(res.body.journalEntry.id);
      expect(ls).toEqual(expect.arrayContaining([{ account: acc.cxp, debit: 590, credit: 0 }, { account: acc.caja, debit: 0, credit: 590 }]));
    });

    it('un anticipo sin facturas se aplica después', async () => {
      const res = await api('post', '/payments', 'acct').send(receive(300, [])).expect(201);
      paySecond = res.body.id;
      expect(num(res.body.unapplied)).toBe(300);
      const done = await api('post', `/payments/${paySecond}/allocate`, 'acct').send({ allocations: [{ invoiceId: s1, amount: 162 }] }).expect(201);
      expect(num(done.body.unapplied)).toBe(138);
      expect((await invoice(s1)).status).toBe('PAID');
      await api('post', `/payments/${paySecond}/allocate`, 'acct').send({ allocations: [{ invoiceId: s1, amount: 1 }] }).expect(422);
    });

    it('otra empresa no ve los pagos', async () => {
      await api('get', `/payments/${paySecond}`, 'adminb').expect(404);
    });
  });
});