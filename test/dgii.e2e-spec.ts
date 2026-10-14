import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Reportes DGII 606 / 607 / 608 con montos conocidos (marzo y abril 2025).
 * Requiere BD con migraciones.
 */
describe('DGII 606/607/608 (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `dgii-${r}-${sfx}@test.local`;
  const RNC = '130000019';
  let companyA: string;
  let companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let cust: string, custNoId: string, supp: string, suppInformal: string;
  let itbis: string, retItbis: string, retIsr: string, bank: string, cash: string;
  const id: Record<string, string> = {};
  const ncf: Record<string, string> = {};

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const line = (unitPrice: number, tax = true) => ({ description: 'Item', quantity: 1, unitPrice, ...(tax ? { taxRateId: itbis } : {}) });
  const sale = (key: string, over: Record<string, unknown>) =>
    api('post', '/invoices', 'acct').send({ type: 'SALE', partnerId: cust, ncfType: 'B01', issueNow: true, dgiiIncomeType: '01', ...over }).expect(201)
      .then((r) => { id[key] = r.body.id; ncf[key] = r.body.ncf; return r.body; });
  const purchase = (key: string, over: Record<string, unknown>) =>
    api('post', '/invoices', 'acct').send({ type: 'PURCHASE', partnerId: supp, issueNow: true, ...over }).expect(201)
      .then((r) => { id[key] = r.body.id; ncf[key] = r.body.ncf; return r.body; });
  const pay = (direction: 'RECEIVED' | 'MADE', partnerId: string, date: string, amount: number, method: string, invoiceId: string) =>
    api('post', '/payments', 'acct').send({
      direction, partnerId, date, amount, method, ...(method === 'CASH' ? { cashRegisterId: cash } : { bankAccountId: bank }),
      allocations: [{ invoiceId, amount }],
    }).expect(201);
  const rowOf = (rows: { invoiceId: string; kind: string }[], key: string, kind = 'ORIGINAL') =>
    rows.find((r) => r.invoiceId === id[key] && r.kind === kind)!;

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `DGII A ${sfx}`, taxId: RNC } })).id;
    companyB = (await prisma.company.create({ data: { name: `DGII B ${sfx}`, taxId: '131999999' } })).id;
    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA],
      ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ];
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type } })).id);
    await mk('cxc', '1201', 'ASSET'); await mk('cxp', '2101', 'LIABILITY');
    await mk('ventas', '4101', 'INCOME'); await mk('gastos', '5101', 'EXPENSE');
    await mk('itbisPagar', '2201', 'LIABILITY'); await mk('itbisAdel', '1301', 'ASSET');
    await mk('banco', '1102', 'ASSET'); await mk('caja', '1101', 'ASSET');
    await mk('retCobrar', '1302', 'ASSET'); await mk('retPagar', '2202', 'LIABILITY');
    await api('post', '/journals/defaults', 'admin').expect(201);
    for (const t of ['B01', 'B02', 'B04', 'B11', 'B13']) {
      await api('post', '/ncf/sequences', 'admin').send({ ncfType: t, rangeStart: 1, rangeEnd: 100 }).expect(201);
    }
    await api('put', '/settings/accounting', 'admin').send({
      receivableAccountId: acc.cxc, payableAccountId: acc.cxp, salesIncomeAccountId: acc.ventas, purchaseExpenseAccountId: acc.gastos,
    }).expect(200);
    const partner = async (body: Record<string, unknown>) => (await api('post', '/partners', 'acct').send(body).expect(201)).body.id as string;
    cust = await partner({ type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131123456', taxIdType: 'RNC' });
    custNoId = await partner({ type: 'CUSTOMER', name: 'Consumidor final' });
    supp = await partner({ type: 'SUPPLIER', name: 'Proveedor SA', taxId: '101010101', taxIdType: 'RNC' });
    suppInformal = await partner({ type: 'SUPPLIER', name: 'Informal' });
    const tax = async (body: Record<string, unknown>) => (await api('post', '/tax-rates', 'acct').send(body).expect(201)).body.id as string;
    itbis = await tax({ name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: acc.itbisPagar, purchaseAccountId: acc.itbisAdel });
    retItbis = await tax({ name: 'Ret ITBIS 30%', rate: 30, type: 'ITBIS_WITHHOLDING', salesAccountId: acc.retCobrar, purchaseAccountId: acc.retPagar });
    retIsr = await tax({ name: 'Ret ISR 10%', rate: 10, type: 'ISR_WITHHOLDING', dgiiCode: '02', salesAccountId: acc.retCobrar, purchaseAccountId: acc.retPagar });
    bank = (await prisma.bankAccount.create({ data: { companyId: companyA, bankName: 'Banco X', accountNumber: '001', glAccountId: acc.banco } })).id;
    cash = (await prisma.cashRegister.create({ data: { companyId: companyA, name: 'Caja', glAccountId: acc.caja } })).id;

    // ---------------- Ventas (marzo 2025)
    await sale('S1', { issueDate: '2025-03-05', lines: [line(1000)] });
    await pay('RECEIVED', cust, '2025-03-10', 1180, 'BANK_TRANSFER', id.S1);
    await sale('S2', { issueDate: '2025-03-10', lines: [line(2000)], withholdings: [{ taxRateId: retItbis }, { taxRateId: retIsr }] });
    await pay('RECEIVED', cust, '2025-04-12', 2052, 'CASH', id.S2);
    await sale('S3', { issueDate: '2025-03-12', partnerId: custNoId, ncfType: 'B02', dgiiIncomeType: undefined, lines: [line(500)] });
    await sale('S4', { issueDate: '2025-03-15', partnerId: custNoId, ncfType: 'B02', lines: [line(300000)] });
    await sale('S5', { issueDate: '2025-03-18', lines: [line(100)] });
    await sale('S6', { type: 'CREDIT_NOTE', issueDate: '2025-03-20', relatedInvoiceId: id.S1, ncfType: undefined, dgiiIncomeType: undefined, lines: [line(200)] });
    await sale('S7', { issueDate: '2025-03-22', currency: 'USD', exchangeRate: 60, lines: [line(100)] });
    await sale('S8', { issueDate: '2025-03-25', dgiiIncomeType: undefined, lines: [line(50)] });
    // N1: anular antes del día 15 siguiente (mes aún sin declarar): se fija el reloj al 1-abr-2025
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2025-04-01T12:00:00Z'));
    try { await api('post', `/invoices/${id.S5}/void`, 'admin').send({ reason: 'Error', reasonCode: '03' }).expect(201); } finally { vi.useRealTimers(); }

    // ---------------- Compras (marzo 2025)
    await purchase('P1', { issueDate: '2025-03-04', ncf: 'B0100000101', dgiiExpenseType: '02', lines: [line(1000)] });
    await pay('MADE', supp, '2025-03-06', 1180, 'CASH', id.P1);
    await purchase('P2', { issueDate: '2025-03-08', ncf: 'B0100000102', dgiiExpenseType: '09', lines: [line(2000)], withholdings: [{ taxRateId: retIsr }] });
    await pay('MADE', supp, '2025-04-10', 2160, 'BANK_TRANSFER', id.P2);
    await purchase('P3', { issueDate: '2025-03-12', partnerId: suppInformal, ncfType: 'B13', dgiiExpenseType: '02', lines: [line(400, false)] });
    await purchase('P4', { issueDate: '2025-03-14', ncf: 'B0100000104', dgiiExpenseType: '02', lines: [line(1000)] });
    await pay('MADE', supp, '2025-03-15', 500, 'CASH', id.P4);
    await pay('MADE', supp, '2025-03-16', 680, 'BANK_TRANSFER', id.P4);
    await purchase('P5', { issueDate: '2025-03-20', ncf: 'B0100000105', lines: [line(100, false)] });
    await purchase('P6', { type: 'CREDIT_NOTE', issueDate: '2025-03-25', relatedInvoiceId: id.P1, ncf: 'B0400000009', lines: [line(100)] });
    await purchase('P7', { issueDate: '2025-03-27', partnerId: suppInformal, ncfType: 'B11', dgiiExpenseType: '02', lines: [line(500, false)] });
    await purchase('P8', { issueDate: '2025-03-28', ncf: 'B0100000108', dgiiExpenseType: '02', lines: [line(300, false)] });
    // N1: anular antes del día 15 siguiente (mes aún sin declarar): se fija el reloj al 1-abr-2025
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2025-04-01T12:00:00Z'));
    try { await api('post', `/invoices/${id.P7}/void`, 'admin').send({ reason: 'Error', reasonCode: '05' }).expect(201); } finally { vi.useRealTimers(); }
    // N1: anular antes del día 15 siguiente (mes aún sin declarar): se fija el reloj al 1-abr-2025
    vi.useFakeTimers({ toFake: ['Date'] }); vi.setSystemTime(new Date('2025-04-01T12:00:00Z'));
    try { await api('post', `/invoices/${id.P8}/void`, 'admin').send({ reason: 'Proveedor lo anuló' }).expect(201); } finally { vi.useRealTimers(); }
    // fecha de anulación controlada: abril 2025
    await prisma.invoice.update({ where: { id: id.S5 }, data: { voidedAt: new Date('2025-04-02T15:00:00Z') } });
    await prisma.invoice.update({ where: { id: id.P7 }, data: { voidedAt: new Date('2025-04-03T15:00:00Z') } });
    await prisma.invoice.update({ where: { id: id.P8 }, data: { voidedAt: new Date('2025-04-03T16:00:00Z') } });
  }, 120000);

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
  });

  describe('607 - ventas', () => {
    it('con un comprobante sin tipo de ingreso: error y no se puede exportar', async () => {
      const r = (await api('get', '/dgii/607?period=202503', 'view').expect(200)).body;
      expect(r.canExport).toBe(false);
      expect(r.errors.map((e: { invoiceId: string }) => e.invoiceId)).toEqual([id.S8]);
      await api('get', '/dgii/607/txt?period=202503', 'view').expect(422);
    });

    it('marzo: filas, montos y formas de venta', async () => {
      await prisma.invoice.update({ where: { id: id.S8 }, data: { dgiiIncomeType: '01' } });
      const r = (await api('get', '/dgii/607?period=2025-03', 'view').expect(200)).body;
      expect(r.canExport).toBe(true);
      expect(r.company.rnc).toBe(RNC);
      expect(r.rows.map((x: { invoiceId: string }) => x.invoiceId)).toEqual([id.S1, id.S2, id.S4, id.S6, id.S7, id.S8]);

      expect(rowOf(r.rows, 'S1')).toMatchObject({
        rnc: '131123456', idType: '1', ncf: ncf.S1, ncfModified: '', incomeType: '01', voucherDate: '20250305',
        amount: '1000.00', itbis: '180.00', itbisWithheld: '0.00', isrWithheld: '0.00', retentionDate: '',
        cash: '0.00', checkTransfer: '1180.00', card: '0.00', credit: '0.00', otherForms: '0.00',
      });
      // S2: cobrada en abril, así que en marzo las retenciones aún no se informan
      expect(rowOf(r.rows, 'S2')).toMatchObject({
        amount: '2000.00', itbis: '360.00', itbisWithheld: '0.00', isrWithheld: '0.00', retentionDate: '', credit: '2360.00', otherForms: '0.00',
      });
      expect(r.warnings.map((w: { invoiceId: string }) => w.invoiceId)).toContain(id.S2);
      // S4: consumo de 354,000 (>= 250,000) va en el detalle, sin RNC
      expect(rowOf(r.rows, 'S4')).toMatchObject({ rnc: '', idType: '', amount: '300000.00', itbis: '54000.00', credit: '354000.00' });
      // S6: nota de crédito con el NCF modificado y el tipo de ingreso de la factura original
      expect(rowOf(r.rows, 'S6')).toMatchObject({ ncf: ncf.S6, ncfModified: ncf.S1, incomeType: '01', amount: '200.00', itbis: '36.00', credit: '236.00' });
      expect(ncf.S6.startsWith('B04')).toBe(true);
      // S7: USD a tasa 60
      expect(rowOf(r.rows, 'S7')).toMatchObject({ amount: '6000.00', itbis: '1080.00', credit: '7080.00' });
      // S3 (consumo pequeño) va solo en el resumen; S5 anulada no aparece
      expect(r.rows.find((x: { invoiceId: string }) => x.invoiceId === id.S3)).toBeUndefined();
      expect(r.rows.find((x: { invoiceId: string }) => x.invoiceId === id.S5)).toBeUndefined();
      expect(r.consumerSummary).toEqual({ count: 1, amount: '500.00', itbis: '90.00', total: '590.00' });
      // totales: la nota de crédito resta
      expect(r.totals).toEqual({ totalInvoiced: '308850.00', itbis: '55593.00', itbisWithheld: '0.00', isrWithheld: '0.00' });
    });

    it('abril: sale la fila de retenciones de S2 con su fecha de cobro', async () => {
      const r = (await api('get', '/dgii/607?period=202504', 'view').expect(200)).body;
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({
        invoiceId: id.S2, kind: 'RETENTION_REPORT', voucherDate: '20250310', retentionDate: '20250412',
        itbisWithheld: '108.00', isrWithheld: '200.00', cash: '2052.00', checkTransfer: '0.00', credit: '0.00', otherForms: '308.00',
      });
      expect(r.totals).toEqual({ totalInvoiced: '0.00', itbis: '0.00', itbisWithheld: '108.00', isrWithheld: '200.00' });
    });

    it('las formas de venta suman el total del comprobante (con ITBIS)', async () => {
      const r = (await api('get', '/dgii/607?period=202503', 'view').expect(200)).body;
      for (const x of r.rows as Record<string, string>[]) {
        const forms = ['cash', 'checkTransfer', 'card', 'credit', 'bonds', 'swap', 'otherForms'].reduce((s, k) => s + Number(x[k]), 0);
        expect(forms).toBeCloseTo(Number(x.amount) + Number(x.itbis), 2);
      }
    });

    it('TXT: encabezado, CRLF, 23 columnas y valores exactos', async () => {
      const res = await api('get', '/dgii/607/txt?period=202503', 'view').expect(200);
      expect(res.headers['content-type']).toMatch(/text\/plain/);
      expect(res.headers['content-disposition']).toContain(`DGII_F_607_${RNC}_202503.TXT`);
      const lines = res.text.split('\r\n');
      expect(lines.pop()).toBe('');
      expect(lines).toHaveLength(7);
      expect(lines[0]).toBe(`607|${RNC}|202503|6`);
      expect(lines[1]).toBe(`131123456|1|${ncf.S1}||01|20250305||1000.00|180.00|0.00|0.00|0.00|0.00|0.00|0.00|0.00|0.00|1180.00|0.00|0.00|0.00|0.00|0.00`);
      for (const l of lines.slice(1)) expect(l.split('|')).toHaveLength(23);
    });
  });

  describe('606 - compras', () => {
    it('con compras sin tipo de gasto: error y no exporta', async () => {
      const r = (await api('get', '/dgii/606?period=202503', 'view').expect(200)).body;
      expect(r.canExport).toBe(false);
      expect(r.errors.map((e: { invoiceId: string }) => e.invoiceId)).toEqual([id.P5]);
      await api('get', '/dgii/606/txt?period=202503', 'view').expect(422);
    });

    it('marzo: servicios/bienes, formas de pago y notas', async () => {
      await prisma.invoice.update({ where: { id: id.P5 }, data: { dgiiExpenseType: '02' } });
      const r = (await api('get', '/dgii/606?period=202503', 'view').expect(200)).body;
      expect(r.canExport).toBe(true);
      expect(r.rows.map((x: { invoiceId: string }) => x.invoiceId)).toEqual([id.P1, id.P2, id.P3, id.P4, id.P5, id.P6]);
      expect(rowOf(r.rows, 'P1')).toMatchObject({
        rnc: '101010101', idType: '1', expenseType: '02', ncf: 'B0100000101', voucherDate: '20250304', paymentDate: '20250306',
        services: '1000.00', goods: '0.00', total: '1000.00', itbis: '180.00', itbisAdvance: '180.00', paymentForm: '01',
      });
      // P2: bienes, con retención de ISR que aún no se paga => no se informa en marzo
      expect(rowOf(r.rows, 'P2')).toMatchObject({
        expenseType: '09', services: '0.00', goods: '2000.00', itbis: '360.00', isrWithheld: '0.00', isrType: '', paymentDate: '', paymentForm: '04',
      });
      // P3: B13 emitido por la empresa a un informal sin RNC
      expect(rowOf(r.rows, 'P3')).toMatchObject({ rnc: '', idType: '', services: '400.00', itbis: '0.00', paymentForm: '04' });
      expect(ncf.P3.startsWith('B13')).toBe(true);
      // P4: pago mixto
      expect(rowOf(r.rows, 'P4')).toMatchObject({ paymentDate: '20250316', paymentForm: '07' });
      // P6: nota de crédito del proveedor
      expect(rowOf(r.rows, 'P6')).toMatchObject({ ncf: 'B0400000009', ncfModified: 'B0100000101', expenseType: '02', services: '100.00', itbis: '18.00', paymentForm: '06' });
      // anuladas fuera
      for (const k of ['P7', 'P8']) expect(r.rows.find((x: { invoiceId: string }) => x.invoiceId === id[k])).toBeUndefined();
      expect(r.totals).toEqual({ totalInvoiced: '4400.00', itbis: '702.00', itbisWithheld: '0.00', isrWithheld: '0.00' });
    });

    it('abril: retención de ISR de P2 con su fecha de pago y tipo', async () => {
      const r = (await api('get', '/dgii/606?period=202504', 'view').expect(200)).body;
      expect(r.rows).toHaveLength(1);
      expect(r.rows[0]).toMatchObject({
        invoiceId: id.P2, kind: 'RETENTION_REPORT', voucherDate: '20250308', paymentDate: '20250410',
        isrType: '02', isrWithheld: '200.00', paymentForm: '02',
      });
      expect(r.totals).toEqual({ totalInvoiced: '0.00', itbis: '0.00', itbisWithheld: '0.00', isrWithheld: '200.00' });
    });

    it('TXT: encabezado y línea exacta', async () => {
      const res = await api('get', '/dgii/606/txt?period=202503', 'view').expect(200);
      expect(res.headers['content-disposition']).toContain(`DGII_F_606_${RNC}_202503.TXT`);
      const lines = res.text.split('\r\n');
      expect(lines.pop()).toBe('');
      expect(lines[0]).toBe(`606|${RNC}|202503|6`);
      expect(lines[1]).toBe('101010101|1|02|B0100000101||20250304|20250306|1000.00|0.00|1000.00|180.00|0.00|0.00|0.00|180.00|0.00||0.00|0.00|0.00|0.00|0.00|01');
      for (const l of lines.slice(1)) expect(l.split('|')).toHaveLength(23);
    });

    it('la retención sin tipo de ISR (dgiiCode) bloquea el 606', async () => {
      await prisma.taxRate.update({ where: { id: retIsr }, data: { dgiiCode: null } });
      const r = (await api('get', '/dgii/606?period=202504', 'view').expect(200)).body;
      expect(r.canExport).toBe(false);
      await prisma.taxRate.update({ where: { id: retIsr }, data: { dgiiCode: '02' } });
      expect((await api('get', '/dgii/606?period=202504', 'view').expect(200)).body.canExport).toBe(true);
    });
  });

  describe('608 - anulados', () => {
    it('abril: solo los comprobantes emitidos por la empresa (venta y B11), no el NCF del proveedor', async () => {
      const r = (await api('get', '/dgii/608?period=202504', 'view').expect(200)).body;
      expect(r.canExport).toBe(true);
      expect(r.rows.map((x: { ncf: string }) => x.ncf)).toEqual([ncf.S5, ncf.P7]);
      expect(r.rows[0]).toMatchObject({ voucherDate: '20250318', voidType: '03' });
      expect(r.rows[1]).toMatchObject({ voucherDate: '20250327', voidType: '05' });
      const txt = (await api('get', '/dgii/608/txt?period=202504', 'view').expect(200)).text;
      expect(txt).toBe(`608|${RNC}|202504|2\r\n${ncf.S5}|20250318|03\r\n${ncf.P7}|20250327|05\r\n`);
    });

    it('marzo no tiene anulaciones (se reportan en el mes en que se anularon)', async () => {
      const r = (await api('get', '/dgii/608?period=202503', 'view').expect(200)).body;
      expect(r.rows).toHaveLength(0);
    });
  });

  describe('validaciones, roles y aislamiento', () => {
    it('periodo inválido: 400 o 422', async () => {
      for (const p of ['2025-13', '202500', 'abc', '']) {
        const res = await api('get', `/dgii/607?period=${p}`, 'view');
        expect([400, 422]).toContain(res.status);
      }
      expect([400, 422]).toContain((await api('get', '/dgii/607', 'view')).status);
    });

    it('sin token: 401; formato desconocido: 404', async () => {
      await request(app.getHttpServer()).get('/dgii/607?period=202503').expect(401);
      await api('get', '/dgii/609/txt?period=202503', 'view').expect(404);
    });

    it('otra empresa no ve nada (y su RNC es el suyo)', async () => {
      const r = (await api('get', '/dgii/607?period=202503', 'adminb').expect(200)).body;
      expect(r.rows).toHaveLength(0);
      expect(r.company.rnc).toBe('131999999');
      expect(r.consumerSummary.count).toBe(0);
      expect((await api('get', '/dgii/608?period=202504', 'adminb').expect(200)).body.rows).toHaveLength(0);
    });

    it('si el RNC de la empresa es inválido no se exporta', async () => {
      await prisma.company.update({ where: { id: companyA }, data: { taxId: '13-000001-9' } });
      const r = (await api('get', '/dgii/607?period=202503', 'view').expect(200)).body;
      expect(r.canExport).toBe(false);
      await api('get', '/dgii/607/txt?period=202503', 'view').expect(422);
      await prisma.company.update({ where: { id: companyA }, data: { taxId: RNC } });
    });
  });
});