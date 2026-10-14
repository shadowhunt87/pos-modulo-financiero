import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Guía de arranque: una empresa nueva recorre los 5 grupos, una factura recorre sus pasos hasta
 * quedar conciliada con el banco, y el cierre de mes señala lo pendiente. Todo con fecha de hoy.
 */
describe('Guía de arranque y flujos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `gu-${r}-${sfx}@test.local`;
  const today = new Date().toISOString().slice(0, 10);
  const year = today.slice(0, 4);
  const rncA = `4${String(Date.now()).slice(-8)}`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let bankId: string, customer: string, itbis: string, flowInvoice: string, periodId: string;

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  type Group = { key: string; done: boolean; reason: string; route: string };
  const setup = async (who = 'view') => (await api('get', '/guidance/setup-status', who).expect(200)).body as { done: number; groups: Group[] };
  const group = async (key: string) => (await setup()).groups.find((g) => g.key === key)!;
  const flow = async (id: string) => (await api('get', `/guidance/invoice-flow/${id}`, 'view').expect(200)).body as
    { current: string | null; steps: { key: string; done: boolean; detail: string; route: string | null }[] };
  const close = async () => (await api('get', `/guidance/period-close?periodId=${periodId}`, 'view').expect(200)).body as
    { ready: boolean; checks: { key: string; ok: boolean; detail: string; route: string }[] };
  const failing = async () => (await close()).checks.filter((c) => !c.ok).map((c) => c.key).sort();

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    // Recién creada: sin RNC válido, sin dirección y sin nada más
    companyA = (await prisma.company.create({ data: { name: `GU A ${sfx}`, taxId: `GU-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `GU B ${sfx}`, taxId: `GU-B-${sfx}` } })).id;
    const users = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['appr', UserRole.APPROVER, companyA],
      ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ] as const;
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
  }, 60000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.bankMatch.deleteMany({ where: { bankTransaction: { bankAccount: where } } });
    await prisma.bankTransaction.deleteMany({ where: { bankAccount: where } });
    await prisma.bankReconciliation.deleteMany({ where });
    await prisma.paymentAllocation.deleteMany({ where: { payment: where } });
    await prisma.payment.deleteMany({ where });
    await prisma.invoiceWithholding.deleteMany({ where: { invoice: where } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: where } });
    await prisma.invoice.deleteMany({ where });
    await prisma.bankAccount.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.fiscalPeriod.deleteMany({ where });
    await prisma.fiscalYear.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
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
  }, 60000);

  describe('arranque en 5 grupos', () => {
    it('empresa nueva: los 5 pendientes, cada uno con su motivo y a dónde ir', async () => {
      const s = await setup();
      expect(s.done).toBe(0);
      expect(s.groups.map((g) => g.key)).toEqual(['company', 'accounting', 'ncf', 'money', 'firstInvoice']);
      for (const g of s.groups) {
        expect(g.done, g.key).toBe(false);
        expect(g.reason.length, g.key).toBeGreaterThan(10);
        expect(g.route, g.key).toMatch(/^\//);
      }
      expect(s.groups[0].reason).toContain('RNC');
    });

    it('1. tu empresa: con RNC, dirección y año fiscal abierto que incluye hoy', async () => {
      await api('patch', '/company', 'admin').send({ taxId: rncA, address: 'Calle 1, Santo Domingo' }).expect(200);
      expect(await group('company')).toMatchObject({ done: false, route: '/fiscal-years' });
      await api('post', '/fiscal-years', 'admin').send({ name: year, startDate: `${year}-01-01`, endDate: `${year}-12-31` }).expect(201);
      expect((await group('company')).done).toBe(true);
    });

    it('2. contabilidad lista: cuentas clasificadas, cuentas automáticas, ITBIS y diarios', async () => {
      expect(await group('accounting')).toMatchObject({ done: false, route: '/accounts' });
      const mk = async (key: string, code: string, type: string, category: string | null) =>
        (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type: type as never, category: category as never } })).id);
      await mk('banco', '1102', 'ASSET', 'CASH_AND_EQUIVALENTS');
      await mk('cxc', '1201', 'ASSET', 'ACCOUNTS_RECEIVABLE');
      await mk('antProv', '1401', 'ASSET', 'PREPAID_AND_OTHER_CURRENT_ASSETS');
      await mk('cxp', '2101', 'LIABILITY', 'ACCOUNTS_PAYABLE');
      await mk('itbisPagar', '2201', 'LIABILITY', 'TAXES_PAYABLE');
      await mk('antCli', '2301', 'LIABILITY', 'OTHER_CURRENT_LIABILITIES');
      await mk('ventas', '4101', 'INCOME', 'OPERATING_REVENUE');
      await mk('gastos', '5101', 'EXPENSE', null);
      expect((await group('accounting')).route).toBe('/account-classification');
      await prisma.account.update({ where: { id: acc.gastos, companyId: companyA }, data: { category: 'OPERATING_EXPENSE' } });
      expect((await group('accounting')).reason).toContain('Cuentas por cobrar');
      await api('put', '/settings/accounting', 'admin').send({
        receivableAccountId: acc.cxc, payableAccountId: acc.cxp, salesIncomeAccountId: acc.ventas, purchaseExpenseAccountId: acc.gastos,
        customerAdvanceAccountId: acc.antCli, supplierAdvanceAccountId: acc.antProv,
      }).expect(200);
      expect((await group('accounting')).route).toBe('/tax-rates');
      itbis = (await api('post', '/tax-rates', 'acct').send({ name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: acc.itbisPagar }).expect(201)).body.id;
      expect((await group('accounting')).route).toBe('/journals');
      await api('post', '/journals/defaults', 'admin').expect(201);
      expect((await group('accounting')).done).toBe(true);
    });

    it('3. comprobantes: una secuencia para vender, vigente y con números', async () => {
      await api('post', '/ncf/sequences', 'admin').send({ ncfType: 'B04', rangeStart: 1, rangeEnd: 10 }).expect(201);
      expect((await group('ncf')).done).toBe(false); // una nota de crédito no sirve para vender
      await api('post', '/ncf/sequences', 'admin').send({ ncfType: 'B01', rangeStart: 1, rangeEnd: 100 }).expect(201);
      expect(await group('ncf')).toMatchObject({ done: true, reason: 'Puedes vender con B01.' });
    });

    it('4. dónde entra el dinero: una cuenta de banco', async () => {
      bankId = (await api('post', '/bank-accounts', 'admin').send({ bankName: 'Banco X', accountNumber: '001', glAccountId: acc.banco }).expect(201)).body.id;
      expect((await group('money')).done).toBe(true);
    });

    it('5. primera factura: un cliente y una venta emitida; la otra empresa no ve nada de esto', async () => {
      customer = (await api('post', '/partners', 'acct').send({ type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131123456' }).expect(201)).body.id;
      expect(await group('firstInvoice')).toMatchObject({ done: false, reason: 'Ya tienes clientes: emite tu primera factura.' });
      await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', dgiiIncomeType: '01', issueNow: true,
        lines: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, taxRateId: itbis }],
      }).expect(201);
      expect((await setup()).done).toBe(5);
      expect((await setup('adminb')).done).toBe(0);
    });
  });

  describe('pasos de una factura', () => {
    const pay = (amount: number) => api('post', '/payments', 'acct').send({
      direction: 'RECEIVED', partnerId: customer, date: today, amount, method: 'BANK_TRANSFER', bankAccountId: bankId,
      allocations: [{ invoiceId: flowInvoice, amount }],
    }).expect(201);

    it('borrador → emitida → cobro parcial → cobrada → conciliada', async () => {
      flowInvoice = (await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', dgiiIncomeType: '01',
        lines: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, taxRateId: itbis }],
      }).expect(201)).body.id;
      expect((await flow(flowInvoice)).current).toBe('issued');
      await api('post', `/invoices/${flowInvoice}/issue`, 'acct').send({}).expect(201);
      expect((await flow(flowInvoice)).current).toBe('paymentApplied');
      await pay(500);
      const partial = await flow(flowInvoice);
      expect(partial.current).toBe('paid');
      expect(partial.steps.find((s) => s.key === 'paid')!.detail).toContain('680.00');
      await pay(680);
      expect((await flow(flowInvoice)).current).toBe('reconciled');
      // El banco muestra los dos cobros: se enlazan y se concilia
      for (const amount of [500, 680]) {
        await api('post', `/bank-accounts/${bankId}/transactions`, 'acct').send({ date: today, description: 'TRANSFERENCIA CLIENTE', amount }).expect(201);
      }
      expect((await api('post', `/bank-accounts/${bankId}/auto-match`, 'acct').expect(201)).body.matched).toBe(2);
      const rec = (await api('post', '/bank-reconciliations', 'acct').send({ bankAccountId: bankId, statementDate: today, statementBalance: 1180 }).expect(201)).body;
      await api('post', `/bank-reconciliations/${rec.id}/complete`, 'appr').expect(201);
      const done = await flow(flowInvoice);
      expect(done.current).toBeNull();
      expect(done.steps.every((s) => s.done)).toBe(true);
    });

    it('una factura de otra empresa da 404', async () => {
      await api('get', `/guidance/invoice-flow/${flowInvoice}`, 'adminb').expect(404);
    });
  });

  describe('antes de cerrar el mes', () => {
    it('con un asiento pendiente, un borrador de factura y un movimiento sin conciliar: 3 chequeos fallidos', async () => {
      periodId = (await prisma.fiscalPeriod.findFirstOrThrow({
        where: { companyId: companyA, startDate: { lte: new Date(today) }, endDate: { gte: new Date(today) } },
      })).id;
      expect(await failing()).toEqual([]);
      await api('put', '/settings/accounting', 'admin').send({ requireEntryApproval: true }).expect(200);
      const pending = (await api('post', '/accounting/journal-entries', 'admin').send({
        date: today, description: 'Ajuste por aprobar', lines: [{ accountId: acc.gastos, debit: 10 }, { accountId: acc.banco, credit: 10 }],
      }).expect(201)).body.id;
      const draft = (await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', lines: [{ description: 'X', quantity: 1, unitPrice: 10 }],
      }).expect(201)).body.id;
      const tx = (await api('post', `/bank-accounts/${bankId}/transactions`, 'acct').send({ date: today, description: 'CARGO SIN IDENTIFICAR', amount: -15 }).expect(201)).body.id;
      const c = await close();
      expect(c.ready).toBe(false);
      expect(c.checks.filter((x) => !x.ok).map((x) => [x.key, x.route])).toEqual([
        ['pendingEntries', '/entries'], ['draftInvoices', '/invoices'], ['bankReconciliation', '/reconciliations'],
      ]);
      expect(c.checks.find((x) => x.key === 'trialBalance')!.ok).toBe(true);

      // Al resolverlos, todo en verde
      await api('post', `/accounting/journal-entries/${pending}/approve`, 'appr').expect(201);
      await api('delete', `/invoices/${draft}`, 'acct').expect(200);
      await api('post', `/bank-transactions/${tx}/ignore`, 'acct').expect(201);
      expect(await close()).toMatchObject({ ready: true });
      await api('put', '/settings/accounting', 'admin').send({ requireEntryApproval: false }).expect(200);
    });

    it('los errores del 607 aparecen con enlace; período ajeno o inexistente: 404', async () => {
      // Venta sin tipo de ingreso: el 607 no se puede generar
      const inv = (await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', issueNow: true, lines: [{ description: 'Y', quantity: 1, unitPrice: 50 }],
      }).expect(201)).body.id;
      const dgii = (await close()).checks.find((x) => x.key === 'dgii')!;
      expect(dgii).toMatchObject({ ok: false, route: '/dgii' });
      expect(dgii.detail).toContain('tipo de ingreso');
      await api('post', `/invoices/${inv}/void`, 'admin').send({ reason: 'Prueba', reasonCode: '05' }).expect(201);
      await api('get', `/guidance/period-close?periodId=${periodId}`, 'adminb').expect(404);
      await api('get', '/guidance/period-close?periodId=no-es-un-id', 'view').expect(400);
    });
  });
});
