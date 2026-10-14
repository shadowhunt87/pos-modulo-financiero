import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * R2 (plan v0.3, Fase 1 / paquete N1): lo contabilizado no se borra, se reversa.
 * Factura B de 10,000 + ITBIS 1,800 = 11,800. Fechas en 2030-2031 (mes abierto, sin declarar).
 */
describe('Corregir sin borrar: reverso y nota de crédito (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `imm-${r}-${sfx}@test.local`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let customer: string, itbis: string, bank: string, cash: string, febPeriod: string;

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const num = (v: unknown) => Number(v);
  const sale = async (issueDate: string, unitPrice = 10000, ncfType = 'B01') =>
    (await api('post', '/invoices', 'acct').send({
      type: 'SALE', partnerId: customer, issueDate, ncfType, issueNow: true, dgiiIncomeType: '01',
      lines: [{ description: 'Servicio', quantity: 1, unitPrice, taxRateId: itbis }],
    }).expect(201)).body;
  const pay = async (invoiceId: string, date: string, amount: number, method: 'BANK_TRANSFER' | 'CASH' = 'BANK_TRANSFER') =>
    (await api('post', '/payments', 'acct').send({
      direction: 'RECEIVED', partnerId: customer, date, amount, method,
      ...(method === 'CASH' ? { cashRegisterId: cash } : { bankAccountId: bank }),
      allocations: [{ invoiceId, amount }],
    }).expect(201)).body;
  const manual = async (date: string, amount: number, debit = 'caja', credit = 'ventas') =>
    (await api('post', '/accounting/journal-entries', 'acct').send({
      date, description: `Manual ${date}`, lines: [{ accountId: acc[debit], debit: amount }, { accountId: acc[credit], credit: amount }],
    }).expect(201)).body;
  const voidEntry = (id: string, body: Record<string, unknown> = { reason: 'Error de captura' }, who = 'appr') =>
    api('post', `/accounting/journal-entries/${id}/void`, who).send(body);
  const balances = async () => {
    const tb = (await api('get', '/accounting/trial-balance', 'view').expect(200)).body;
    return Object.fromEntries(tb.lines.filter((l: any) => num(l.balance) !== 0).map((l: any) => [l.code, num(l.balance)]));
  };
  const entriesOf = (sourceId: string) =>
    prisma.journalEntry.findMany({ where: { companyId: companyA, sourceId }, include: { lines: true }, orderBy: { createdAt: 'asc' } });
  const audits = (entityId: string) => prisma.auditLog.findMany({ where: { companyId: companyA, entityId } });

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `IMM A ${sfx}`, taxId: '130000019' } })).id;
    companyB = (await prisma.company.create({ data: { name: `IMM B ${sfx}`, taxId: `IMM-B-${sfx}` } })).id;
    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['appr', UserRole.APPROVER, companyA],
      ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ];
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type } })).id);
    await mk('caja', '1101', 'ASSET'); await mk('banco', '1102', 'ASSET'); await mk('cxc', '1201', 'ASSET');
    await mk('cxp', '2101', 'LIABILITY'); await mk('itbisPagar', '2201', 'LIABILITY');
    await mk('capital', '3101', 'EQUITY'); await mk('util', '3201', 'EQUITY');
    await mk('ventas', '4101', 'INCOME'); await mk('gastos', '5101', 'EXPENSE');
    await api('post', '/journals/defaults', 'admin').expect(201);
    for (const t of ['B01', 'B04', 'E31']) await api('post', '/ncf/sequences', 'admin').send({ ncfType: t, rangeStart: 1, rangeEnd: 100 }).expect(201);
    await api('put', '/settings/accounting', 'admin').send({
      receivableAccountId: acc.cxc, payableAccountId: acc.cxp, salesIncomeAccountId: acc.ventas, purchaseExpenseAccountId: acc.gastos,
      retainedEarningsAccountId: acc.util,
    }).expect(200);
    customer = (await api('post', '/partners', 'acct').send({ type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131123456' }).expect(201)).body.id;
    itbis = (await api('post', '/tax-rates', 'acct').send({ name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: acc.itbisPagar }).expect(201)).body.id;
    bank = (await prisma.bankAccount.create({ data: { companyId: companyA, bankName: 'Banco X', accountNumber: '001', glAccountId: acc.banco } })).id;
    cash = (await prisma.cashRegister.create({ data: { companyId: companyA, name: 'Caja', glAccountId: acc.caja } })).id;
    febPeriod = (await api('post', '/accounting/fiscal-periods', 'admin').send({ name: 'Feb 2030', startDate: '2030-02-01', endDate: '2030-02-28' }).expect(201)).body.id;
  }, 60_000);

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
    await prisma.invoice.updateMany({ where, data: { relatedInvoiceId: null } });
    await prisma.invoice.deleteMany({ where });
    await prisma.fiscalYear.updateMany({ where, data: { closingEntryId: null } });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.fiscalPeriod.deleteMany({ where });
    await prisma.fiscalYear.deleteMany({ where });
    await prisma.bankAccount.deleteMany({ where });
    await prisma.cashRegister.deleteMany({ where });
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
  }, 60_000);

  describe('facturas', () => {
    it('factura B en mes abierto: se anula con un reverso de la misma fecha y la balanza vuelve a la de antes', async () => {
      const before = await balances();
      const inv = await sale('2030-01-10');
      expect(num(inv.total)).toBe(11800);
      await api('post', `/invoices/${inv.id}/void`, 'appr').send({ reason: 'Error de precio', reasonCode: '04' }).expect(201);

      const [orig, rev] = await entriesOf(inv.id);
      expect(orig).toMatchObject({ status: 'POSTED', type: 'STANDARD', voidedById: expect.any(String) });
      expect(orig.voidedAt).toBeTruthy();
      expect(orig.voidReason).toMatch(/Error de precio/);
      expect(rev).toMatchObject({ status: 'POSTED', type: 'REVERSAL', reversalOfId: orig.id, sourceType: 'INVOICE', sourceId: inv.id, journalId: orig.journalId });
      expect(rev.date.toISOString()).toBe(orig.date.toISOString());
      expect(rev.number).not.toBe(orig.number);
      // débito y crédito intercambiados, cuenta por cuenta
      const sig = (ls: any[], flip = false) =>
        ls.map((l) => `${l.accountId}:${num(flip ? l.credit : l.debit)}:${num(flip ? l.debit : l.credit)}`).sort();
      expect(sig(rev.lines)).toEqual(sig(orig.lines, true));

      expect(await balances()).toEqual(before);
      // el 608 la lista como hoy (por la fecha de anulación)
      const now = new Date();
      const period = `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
      const r608 = (await api('get', `/dgii/608?period=${period}`, 'view').expect(200)).body;
      expect(r608.rows.map((r: any) => r.invoiceId)).toContain(inv.id);
      // bitácora: anulación de la factura, VOID del original y POST del reverso
      expect((await audits(inv.id)).map((a) => a.action)).toContain('VOID');
      expect((await audits(orig.id)).map((a) => a.action)).toContain('VOID');
      expect((await audits(rev.id)).map((a) => a.action)).toEqual(['POST']);
    });

    it('factura electrónica (E31): 422 siempre, con la guía de nota de crédito', async () => {
      // Sin proveedor, el sistema ya no numera e-CF: la factura E llega importada de XML (N3). Se simula así
      const inv = await sale('2030-01-12', 1000);
      await prisma.invoice.update({ where: { id: inv.id, companyId: companyA }, data: { ncf: 'E310000000001', ncfType: 'E31' } });
      inv.ncf = 'E310000000001';
      expect(inv.ncf).toMatch(/^E31/);
      const res = await api('post', `/invoices/${inv.id}/void`, 'appr').send({ reason: 'x', reasonCode: '01' }).expect(422);
      expect(res.body.message).toMatch(/electrónica.*nota de crédito/);
      expect((await api('get', `/invoices/${inv.id}`, 'view').expect(200)).body.status).toBe('ISSUED');
      expect(await prisma.journalEntry.count({ where: { sourceId: inv.id, type: 'REVERSAL' } })).toBe(0);
    });
  });

  describe('mes cerrado', () => {
    let febSale: string, febPay: string, febEntry: string;
    beforeAll(async () => {
      febSale = (await sale('2030-02-10', 2000)).id;
      febPay = (await pay(febSale, '2030-02-12', 2360)).id;
      febEntry = (await manual('2030-02-15', 300)).id;
      await api('post', `/accounting/fiscal-periods/${febPeriod}/close`, 'admin').expect(201);
    });

    it('factura de un mes cerrado: 422 con el texto de nota de crédito', async () => {
      // aunque tenga un pago aplicado, lo primero que se explica es el mes cerrado
      const res = await api('post', `/invoices/${febSale}/void`, 'appr').send({ reason: 'x', reasonCode: '01' }).expect(422);
      expect(res.body.message).toBe('Esta factura es de un mes cerrado. No se anula: corrígela con una nota de crédito');
    });

    it('pago en mes cerrado: 422 como hoy y sigue POSTED', async () => {
      await api('post', `/payments/${febPay}/void`, 'appr').send({ reason: 'x' }).expect(422);
      expect((await prisma.payment.findUniqueOrThrow({ where: { id: febPay } })).status).toBe('POSTED');
    });

    it('asiento manual en mes cerrado: sin reverseOn 422; reverseOn también cerrado 422; con reverseOn abierto se reversa', async () => {
      const r1 = await voidEntry(febEntry).expect(422);
      expect(r1.body.message).toMatch(/mes abierto/);
      await voidEntry(febEntry, { reason: 'x', reverseOn: '2030-02-20' }).expect(422);
      await voidEntry(febEntry, { reason: 'x', reverseOn: 'no-es-fecha' }).expect(400);
      const res = await voidEntry(febEntry, { reason: 'Monto equivocado', reverseOn: '2030-03-01' }).expect(201);
      expect(res.body).toMatchObject({ status: 'POSTED', reversedBy: { id: expect.any(String) } });
      const rev = await prisma.journalEntry.findUniqueOrThrow({ where: { id: res.body.reversedBy.id } });
      expect([rev.type, rev.date.toISOString().slice(0, 10)]).toEqual(['REVERSAL', '2030-03-01']);
    });
  });

  describe('endpoint de asientos', () => {
    it('un asiento de factura o de pago no se corrige aquí (422)', async () => {
      const inv = await sale('2030-03-05', 1000);
      const p = await pay(inv.id, '2030-03-06', 1180);
      const [invEntry] = await entriesOf(inv.id);
      const [payEntry] = await entriesOf(p.id);
      for (const id of [invEntry.id, payEntry.id]) {
        const res = await voidEntry(id).expect(422);
        expect(res.body.message).toBe('Este asiento viene de un documento: corrígelo desde la factura o el pago');
      }
    });

    it('un reverso no se reversa (422); reverseOn anterior al original (422)', async () => {
      const e = await manual('2030-03-10', 40);
      await voidEntry(e.id, { reason: 'x', reverseOn: '2030-03-01' }).expect(422);
      const res = await voidEntry(e.id).expect(201);
      const r = await voidEntry(res.body.reversedBy.id).expect(422);
      expect(r.body.message).toMatch(/Un reverso no se reversa/);
    });

    it('dos reversos simultáneos: uno pasa y el otro da 409; un solo reverso y un solo VOID', async () => {
      const e = await manual('2030-03-11', 60);
      const codes = (await Promise.all([voidEntry(e.id, undefined, 'admin'), voidEntry(e.id, undefined, 'appr')])).map((r) => r.status).sort();
      expect(codes).toEqual([201, 409]);
      expect(await prisma.journalEntry.count({ where: { reversalOfId: e.id } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { entityId: e.id, action: 'VOID' } })).toBe(1);
      // después, de nuevo: 409
      await voidEntry(e.id).expect(409);
    });

    it('asiento conciliado: 422 como hoy; otra empresa: 404; el contador no reversa: 403', async () => {
      const e = await manual('2030-03-12', 70);
      await voidEntry(e.id, undefined, 'acct').expect(403);
      await voidEntry(e.id, undefined, 'adminb').expect(404);
      await prisma.journalEntry.update({ where: { id: e.id }, data: { reconciled: true } });
      await voidEntry(e.id).expect(422);
    });

    it('?reversed=true lista los reversados con reversedBy; ?status=VOIDED ya no los trae', async () => {
      const list = (await api('get', '/accounting/journal-entries?reversed=true&limit=100', 'view').expect(200)).body;
      expect(list.total).toBeGreaterThanOrEqual(3);
      expect(list.data.every((e: any) => e.status === 'POSTED' && e.reversedBy?.number)).toBe(true);
      const voided = (await api('get', '/accounting/journal-entries?status=VOIDED&limit=100', 'view').expect(200)).body;
      expect(voided.data.some((e: any) => e.reversedBy)).toBe(false);
      const notReversed = (await api('get', '/accounting/journal-entries?reversed=false&limit=100', 'view').expect(200)).body;
      expect(notReversed.data.some((e: any) => e.reversedBy)).toBe(false);
      // el detalle muestra "Reversado por" y el reverso dice de quién es
      const id = list.data[0].id;
      const d = (await api('get', `/accounting/journal-entries/${id}`, 'view').expect(200)).body;
      const rd = (await api('get', `/accounting/journal-entries/${d.reversedBy.id}`, 'view').expect(200)).body;
      expect(rd.reversalOf).toMatchObject({ id });
      // otra empresa no ve nada
      expect((await api('get', '/accounting/journal-entries?reversed=true', 'adminb').expect(200)).body.total).toBe(0);
    });
  });

  describe('cliente desactivado', () => {
    it('anular el pago y la factura de un cliente desactivado sigue funcionando y crea los reversos', async () => {
      const inv = await sale('2030-05-05', 1000);
      const p = await pay(inv.id, '2030-05-06', 1180, 'CASH');
      await prisma.partner.update({ where: { id: customer }, data: { active: false } });
      try {
        await api('post', `/payments/${p.id}/void`, 'appr').send({ reason: 'x' }).expect(201);
        await api('post', `/invoices/${inv.id}/void`, 'appr').send({ reason: 'x', reasonCode: '01' }).expect(201);
      } finally {
        await prisma.partner.update({ where: { id: customer }, data: { active: true } });
      }
      expect(await prisma.journalEntry.count({ where: { sourceId: p.id, type: 'REVERSAL' } })).toBe(1);
      expect(await prisma.journalEntry.count({ where: { sourceId: inv.id, type: 'REVERSAL' } })).toBe(1);
    });
  });

  describe('conciliación', () => {
    it('pago reversado + su reverso no aparecen como candidatos', async () => {
      const inv = await sale('2030-04-05', 1000);
      const p = await pay(inv.id, '2030-04-06', 1180);
      await api('post', `/payments/${p.id}/void`, 'appr').send({ reason: 'Cheque devuelto' }).expect(201);
      await api('post', `/bank-accounts/${bank}/transactions`, 'acct').send({ date: '2030-04-06', description: 'DEPOSITO', amount: 1180 }).expect(201);
      const sug = (await api('get', `/bank-accounts/${bank}/suggestions`, 'view').expect(200)).body;
      const s = sug.find((x: any) => num(x.transaction.amount) === 1180);
      const ids = (await entriesOf(p.id)).map((e) => e.id);
      expect(s.candidates.filter((c: any) => ids.includes(c.entryId))).toEqual([]);
    });

    it('un enlace a un asiento reversado bloquea completar la conciliación', async () => {
      const inv = await sale('2030-04-10', 2000);
      const p = await pay(inv.id, '2030-04-11', 2360);
      const bt = (await api('post', `/bank-accounts/${bank}/transactions`, 'acct').send({ date: '2030-04-11', description: 'DEPOSITO 2', amount: 2360 }).expect(201)).body;
      const [orig] = await entriesOf(p.id);
      const line = orig.lines.find((l) => l.accountId === acc.banco)!;
      await api('post', `/bank-transactions/${bt.id}/match`, 'acct').send({ journalEntryLineIds: [line.id] }).expect(201);
      await api('post', `/payments/${p.id}/void`, 'appr').send({ reason: 'Error' }).expect(201);
      const rec = (await api('post', '/bank-reconciliations', 'acct').send({ bankAccountId: bank, statementDate: '2030-04-30', statementBalance: 0 }).expect(201)).body;
      expect(rec.summary.blockers.join(' | ')).toMatch(/1 movimiento\(s\) enlazados a asientos anulados o reversados/);
      await api('post', `/bank-reconciliations/${rec.id}/complete`, 'appr').expect(422);
    });
  });

  describe('apertura y cierre de año', () => {
    it('apertura reversada: se puede crear otra', async () => {
      const lines = (n: number) => [{ accountId: acc.banco, debit: n }, { accountId: acc.capital, credit: n }];
      const g = (await api('post', '/opening-balances', 'admin').send({ date: '2029-12-31', lines: lines(1000) }).expect(201)).body;
      await api('post', '/opening-balances', 'admin').send({ date: '2029-12-31', lines: lines(1000) }).expect(409);
      await voidEntry(g.id, { reason: 'saldos mal cargados' }, 'admin').expect(201);
      expect((await api('get', '/opening-balances', 'view').expect(200)).body.entry).toBeNull();
      const again = (await api('post', '/opening-balances', 'admin').send({ date: '2029-12-31', lines: lines(1200) }).expect(201)).body;
      expect(again.id).not.toBe(g.id);
      expect((await api('get', '/opening-balances', 'view').expect(200)).body.entry.id).toBe(again.id);
    });

    it('reabrir el año: el cierre queda VOIDED como hoy (sin reverso) y los reportes no cambian', async () => {
      const y = (await api('post', '/fiscal-years', 'admin').send({ name: '2031', startDate: '2031-01-01', endDate: '2031-12-31' }).expect(201)).body;
      await manual('2031-05-01', 500, 'banco', 'ventas');
      const bs = async () => (await api('get', '/reports/balance-sheet?asOf=2031-12-31', 'view').expect(200)).body;
      const before = await bs();
      await api('post', `/fiscal-years/${y.id}/close`, 'admin').expect(201);
      const closingId = (await prisma.fiscalYear.findUniqueOrThrow({ where: { id: y.id } })).closingEntryId!;
      await api('post', `/fiscal-years/${y.id}/reopen`, 'admin').send({ reason: 'faltaba algo' }).expect(201);
      const closing = await prisma.journalEntry.findUniqueOrThrow({ where: { id: closingId }, include: { reversedBy: true } });
      expect([closing.status, closing.reversedBy]).toEqual(['VOIDED', null]);
      expect(await prisma.journalEntry.count({ where: { companyId: companyA, type: 'REVERSAL', sourceId: y.id } })).toBe(0);
      const after = await bs();
      expect([num(after.totalAssets), num(after.totalEquity), num(after.netIncomeOfPeriod), after.balanced])
        .toEqual([num(before.totalAssets), num(before.totalEquity), num(before.netIncomeOfPeriod), before.balanced]);
      // el endpoint de asientos tampoco anula un cierre
      await api('post', `/fiscal-years/${y.id}/close`, 'admin').expect(201);
      const newClosing = (await prisma.fiscalYear.findUniqueOrThrow({ where: { id: y.id } })).closingEntryId!;
      await voidEntry(newClosing, undefined, 'admin').expect(422);
    });
  });
});
