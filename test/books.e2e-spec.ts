import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

describe('Libros y estados financieros detallados (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `bks-${r}-${sfx}@test.local`;
  let companyId: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  const num = (v: unknown) => Number(v);
  const api = (m: 'get' | 'post' | 'put', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const entry = (date: string, debit: string, credit: string, amount: number) =>
    api('post', '/accounting/journal-entries', 'acct').send({
      date, description: `${debit}/${credit}`, lines: [{ accountId: acc[debit], debit: amount }, { accountId: acc[credit], credit: amount }],
    }).expect(201);
  const cashFlow = async () => (await api('get', '/reports/cash-flow?from=2027-01-01&to=2027-01-31', 'view').expect(200)).body;

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyId = (await prisma.company.create({ data: { name: `B ${sfx}`, taxId: `B-${sfx}` } })).id;
    for (const [r, role] of [['admin', UserRole.ADMIN], ['acct', UserRole.ACCOUNTANT], ['view', UserRole.VIEWER]] as const) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, name: string, type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId, code, name, type } })).id);
    await mk('banco', '1102', 'Banco Popular', 'ASSET');
    await mk('cxc', '1201', 'Cuentas por cobrar clientes', 'ASSET');
    await mk('equipo', '1501', 'Equipo de oficina', 'ASSET');
    await mk('depAcum', '1502', 'Depreciación acumulada equipo', 'ASSET');
    await mk('cxp', '2101', 'Cuentas por pagar proveedores', 'LIABILITY');
    await mk('prestamo', '2201', 'Préstamo bancario largo plazo', 'LIABILITY');
    await mk('capital', '3101', 'Capital social', 'EQUITY');
    await mk('ventas', '4101', 'Ventas de servicios', 'INCOME');
    await mk('gastos', '5101', 'Gastos generales', 'EXPENSE');
    await mk('depGasto', '5301', 'Gasto de depreciación', 'EXPENSE');
    await entry('2027-01-02', 'banco', 'capital', 10000);
    await entry('2027-01-05', 'equipo', 'banco', 4000);
    await entry('2027-01-10', 'cxc', 'ventas', 3000);
    await entry('2027-01-15', 'gastos', 'cxp', 500);
    await entry('2027-01-20', 'banco', 'cxc', 1000);
    await entry('2027-01-25', 'depGasto', 'depAcum', 200);
    await entry('2027-01-28', 'banco', 'prestamo', 2000);
  });

  afterAll(async () => {
    const where = { companyId };
    await prisma.invoice.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.partner.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: companyId } });
    await app.close();
  });

  describe('clasificación del plan de cuentas', () => {
    it('sin clasificar, el flujo de efectivo avisa que faltan cuentas', async () => {
      const cf = await cashFlow();
      expect(cf.balanced).toBe(false);
      expect(cf.warnings.length).toBeGreaterThan(0);
    });
    it('propone la clasificación por nombre sin aplicarla, y luego la aplica', async () => {
      await api('post', '/account-classification/auto', 'view').send({ apply: true }).expect(403);
      const dry = (await api('post', '/account-classification/auto', 'acct').send({}).expect(201)).body;
      expect([dry.applied, dry.classified, dry.unmatched.length]).toEqual([false, 10, 0]);
      expect((await api('get', '/account-classification', 'view').expect(200)).body.summary.classified).toBe(0);

      await api('post', '/account-classification/auto', 'acct').send({ apply: true }).expect(201);
      const list = (await api('get', '/account-classification', 'view').expect(200)).body;
      expect(list.summary.classified).toBe(10);
      const by = (code: string) => list.accounts.find((a: { code: string }) => a.code === code);
      expect(by('1102')).toMatchObject({ category: 'CASH_AND_EQUIVALENTS', cashFlowCategory: 'CASH_EQUIVALENT' });
      expect(by('1201')).toMatchObject({ category: 'ACCOUNTS_RECEIVABLE', cashFlowCategory: 'OPERATING', subledger: 'RECEIVABLE' });
      expect(by('1502')).toMatchObject({ category: 'PROPERTY_PLANT_EQUIPMENT', isContra: true });
      expect(by('2201')).toMatchObject({ category: 'LONG_TERM_DEBT', cashFlowCategory: 'FINANCING' });
    });
    it('rechaza una categoría que no corresponde al tipo de cuenta', async () => {
      await api('put', '/account-classification', 'acct').send({ items: [{ accountId: acc.ventas, category: 'INVENTORY' }] }).expect(422);
      await api('put', '/account-classification', 'acct').send({ items: [{ accountId: acc.ventas, cashFlowCategory: 'OPERATING' }] }).expect(422);
    });
  });

  describe('estado de flujo de efectivo', () => {
    it('método indirecto cuadra con la variación real de efectivo', async () => {
      const cf = await cashFlow();
      expect(cf.warnings).toEqual([]);
      expect([num(cf.operating.total), num(cf.investing.total), num(cf.financing.total)]).toEqual([1000, -4000, 12000]);
      expect([num(cf.cashAtBeginning), num(cf.cashAtEnd), num(cf.netChangeInCash)]).toEqual([0, 9000, 9000]);
      expect(cf.balanced).toBe(true);
      const kinds = cf.operating.lines.map((l: { kind?: string; amount: string }) => [l.kind ?? 'WC', num(l.amount)]);
      expect(kinds).toEqual(expect.arrayContaining([['NET_INCOME', 2300], ['NON_CASH', 200]]));
    });
  });

  describe('mayor auxiliar y drill-down a documentos', () => {
    let p1: string;
    let p2: string;
    let invoiceId: string;
    beforeAll(async () => {
      const admin = await prisma.user.findUniqueOrThrow({ where: { email: email('admin') } });
      p1 = (await prisma.partner.create({ data: { companyId, type: 'CUSTOMER', name: 'Cliente Uno' } })).id;
      p2 = (await prisma.partner.create({ data: { companyId, type: 'CUSTOMER', name: 'Cliente Dos' } })).id;
      invoiceId = (await prisma.invoice.create({
        data: { companyId, partnerId: p1, type: 'SALE', number: 'FV-TEST', ncf: 'B0100000001', issueDate: new Date('2027-02-02'), status: 'ISSUED', subtotal: 700, total: 700, balance: 700, createdById: admin.id },
      })).id;
      const mkEntry = (date: string, lines: { accountId: string; debit?: number; credit?: number; partnerId?: string }[], src?: { sourceType: 'INVOICE'; sourceId: string }) =>
        prisma.journalEntry.create({ data: { companyId, date: new Date(date), description: 'aux', status: 'POSTED', createdById: admin.id, ...src, lines: { create: lines } } });
      await mkEntry('2027-02-02', [{ accountId: acc.cxc, debit: 700, partnerId: p1 }, { accountId: acc.ventas, credit: 700 }], { sourceType: 'INVOICE', sourceId: invoiceId });
      await mkEntry('2027-02-03', [{ accountId: acc.cxc, debit: 300, partnerId: p2 }, { accountId: acc.ventas, credit: 300 }]);
      await mkEntry('2027-02-10', [{ accountId: acc.banco, debit: 200 }, { accountId: acc.cxc, credit: 200, partnerId: p1 }]);
    });

    it('el auxiliar desglosa la cuenta por tercero y avisa de lo que no tiene tercero', async () => {
      const r = (await api('get', `/reports/subledger?accountId=${acc.cxc}`, 'view').expect(200)).body;
      const closing = Object.fromEntries(r.partners.map((p: { name: string; closingBalance: string }) => [p.name, num(p.closingBalance)]));
      expect(closing).toEqual({ 'Cliente Uno': 500, 'Cliente Dos': 300, 'Sin tercero asignado': 2000 });
      expect(num(r.totals.closingBalance)).toBe(2800);
      expect(r.warnings).toHaveLength(1);

      const feb = (await api('get', `/reports/subledger?accountId=${acc.cxc}&from=2027-02-01`, 'view').expect(200)).body;
      const uno = feb.partners.find((p: { name: string }) => p.name === 'Cliente Uno');
      expect([num(uno.openingBalance), num(uno.debit), num(uno.credit), num(uno.closingBalance)]).toEqual([0, 700, 200, 500]);
    });

    it('el mayor de un tercero llega hasta la factura que originó el asiento', async () => {
      const r = (await api('get', `/reports/ledger/${acc.cxc}/detail?partnerId=${p1}&from=2027-02-01`, 'view').expect(200)).body;
      expect(r.total).toBe(2);
      expect(r.movements.map((m: { balance: string }) => num(m.balance))).toEqual([700, 500]);
      expect(r.movements[0].source).toMatchObject({ type: 'INVOICE', number: 'FV-TEST', ncf: 'B0100000001', href: `/invoices/${invoiceId}` });
      expect(r.movements[0].partner).toMatchObject({ name: 'Cliente Uno' });
      expect(r.movements[1].source).toBeNull();
      expect(num(r.closingBalance)).toBe(500);
    });

    it('sin filtro de tercero el mayor trae saldo inicial y todos los movimientos', async () => {
      const r = (await api('get', `/reports/ledger/${acc.cxc}/detail?from=2027-02-01`, 'view').expect(200)).body;
      expect([num(r.openingBalance), r.total, num(r.closingBalance)]).toEqual([2000, 3, 2800]);
    });
  });
});