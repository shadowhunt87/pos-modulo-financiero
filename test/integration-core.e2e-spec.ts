import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

// La documentación de la API se enciende solo para esta prueba
process.env.API_DOCS = 'true';

/**
 * Núcleo para sistemas integrados (INTEGRACION-TALLER T3a): origen en la factura con llave natural
 * (409 con el id de la existente), lectura por origen con "vale / no vale", referencia externa en el
 * cobro, versión y documentación de la API. Montos: 1 × 1,000 + ITBIS 18 % = 1,180.
 */
describe('Núcleo para integraciones (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `int-${r}-${sfx}@test.local`;
  const today = new Date().toISOString().slice(0, 10);
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let customer: string, itbis: string, bank: string;

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const sale = (sourceId: string, over: Record<string, unknown> = {}) => ({
    type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', issueNow: true,
    sourceModule: 'taller.orden', sourceId,
    lines: [{ description: 'Servicio de taller', quantity: 1, unitPrice: 1000, taxRateId: itbis }], ...over,
  });
  type Found = { id: string; effective: boolean; creditedTotal: string; sourceId: string; notes: unknown[] };
  const bySource = async (ids: string, who = 'view') =>
    (await api('get', `/invoices/by-source?sourceModule=taller.orden&sourceId=${encodeURIComponent(ids)}`, who).expect(200)).body as Found[];

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `INT A ${sfx}`, taxId: `INT-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `INT B ${sfx}`, taxId: `INT-B-${sfx}` } })).id;
    const users = [['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['appr', UserRole.APPROVER, companyA], ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB]] as const;
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type } })).id);
    await mk('cxc', '1201', 'ASSET'); await mk('cxp', '2101', 'LIABILITY'); await mk('banco', '1102', 'ASSET');
    await mk('ventas', '4101', 'INCOME'); await mk('gastos', '5101', 'EXPENSE'); await mk('itbisPagar', '2201', 'LIABILITY');
    await api('post', '/journals/defaults', 'admin').expect(201);
    for (const t of ['B01', 'B04']) await api('post', '/ncf/sequences', 'admin').send({ ncfType: t, rangeStart: 1, rangeEnd: 100 }).expect(201);
    await api('put', '/settings/accounting', 'admin').send({
      receivableAccountId: acc.cxc, payableAccountId: acc.cxp, salesIncomeAccountId: acc.ventas, purchaseExpenseAccountId: acc.gastos,
    }).expect(200);
    customer = (await api('post', '/partners', 'acct').send({ type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131123456' }).expect(201)).body.id;
    itbis = (await api('post', '/tax-rates', 'acct').send({ name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: acc.itbisPagar }).expect(201)).body.id;
    bank = (await api('post', '/bank-accounts', 'admin').send({ bankName: 'Banco X', accountNumber: '001', glAccountId: acc.banco }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.paymentAllocation.deleteMany({ where: { payment: where } });
    await prisma.payment.deleteMany({ where });
    await prisma.invoiceWithholding.deleteMany({ where: { invoice: where } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: where } });
    await prisma.invoice.updateMany({ where, data: { relatedInvoiceId: null } });
    await prisma.invoice.deleteMany({ where });
    await prisma.bankAccount.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.updateMany({ where, data: { reversalOfId: null } });
    await prisma.journalEntry.deleteMany({ where });
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

  describe('facturas con origen (llave natural)', () => {
    let first: string;

    it('la segunda venta con el mismo origen: 409 con el id de la existente, sin gastar otro NCF', async () => {
      const a = await api('post', '/invoices', 'acct').send(sale('ot-1:1')).expect(201);
      first = a.body.id;
      expect(a.body).toMatchObject({ sourceModule: 'taller.orden', sourceId: 'ot-1:1', ncf: 'B0100000001' });
      const dup = await api('post', '/invoices', 'acct').send(sale('ot-1:1')).expect(409);
      expect(dup.body).toMatchObject({ existingId: first });
      expect((await prisma.ncfSequence.findFirstOrThrow({ where: { companyId: companyA, ncfType: 'B01' } })).currentNumber).toBe(1);
    });

    it('dos pedidos simultáneos con la misma llave: uno pasa y el otro recibe 409 con el id', async () => {
      const [x, y] = await Promise.all([api('post', '/invoices', 'acct').send(sale('ot-2:1')), api('post', '/invoices', 'acct').send(sale('ot-2:1'))]);
      expect([x.status, y.status].sort()).toEqual([201, 409]);
      const ok = x.status === 201 ? x : y;
      expect((x.status === 409 ? x : y).body.existingId).toBe(ok.body.id);
    });

    it('lectura por origen: vale mientras no se anule ni se cubra con notas de crédito', async () => {
      const [f] = await bySource('ot-1:1');
      expect(f).toMatchObject({ id: first, effective: true, creditedTotal: '0' });
      // Nota de crédito por el total: ya no vale (no está anulada, pero quedó cubierta)
      await api('post', '/invoices', 'acct').send({
        type: 'CREDIT_NOTE', partnerId: customer, issueDate: today, issueNow: true, relatedInvoiceId: first,
        lines: [{ description: 'Devolución', quantity: 1, unitPrice: 1000, taxRateId: itbis }],
      }).expect(201);
      const [after] = await bySource('ot-1:1');
      expect(after).toMatchObject({ effective: false, creditedTotal: '1180' });
      expect(after.notes).toHaveLength(1);
    });

    it('anulada en Finanzas: deja de valer y el siguiente intento de la orden se puede facturar', async () => {
      const inv = (await api('post', '/invoices', 'acct').send(sale('ot-3:1')).expect(201)).body;
      await api('post', `/invoices/${inv.id}/void`, 'admin').send({ reason: 'Error del taller', reasonCode: '05' }).expect(201);
      expect((await bySource('ot-3:1'))[0].effective).toBe(false);
      // La llave es parcial: una anulada libera su origen (también el mismo intento)
      await api('post', '/invoices', 'acct').send(sale('ot-3:1')).expect(201);
      await api('post', '/invoices', 'acct').send(sale('ot-3:2')).expect(201);
      expect((await bySource('ot-3:1,ot-3:2')).filter((f) => f.effective)).toHaveLength(2);
    });

    it('validaciones y aislamiento', async () => {
      await api('post', '/invoices', 'acct').send(sale('ot-9:1', { sourceModule: undefined })).expect(400);
      await api('post', '/invoices', 'acct').send(sale('ot-9:1', { sourceModule: 'Taller Orden' })).expect(400);
      expect(await bySource('ot-1:1', 'adminb')).toEqual([]);
      await api('get', `/invoices/by-source?sourceModule=taller.orden&sourceId=${Array.from({ length: 51 }, (_, i) => i).join(',')}`, 'view').expect(400);
      // Una compra con origen no choca con la llave de ventas
      await api('post', '/invoices', 'acct').send({
        type: 'PURCHASE', partnerId: customer, issueDate: today, sourceModule: 'taller.orden', sourceId: 'ot-1:1',
        lines: [{ description: 'Repuesto', quantity: 1, unitPrice: 10 }],
      }).expect(422); // el cliente no es proveedor: la llave no interviene, responde la regla de negocio
    });
  });

  describe('cobros con referencia externa', () => {
    it('la misma referencia otra vez: 409 con el id del cobro existente; en otra empresa no choca', async () => {
      const inv = (await api('post', '/invoices', 'acct').send(sale('ot-5:1')).expect(201)).body;
      const body = {
        direction: 'RECEIVED', partnerId: customer, date: today, amount: 1180, method: 'BANK_TRANSFER', bankAccountId: bank,
        externalRef: 'taller-cobro-77', allocations: [{ invoiceId: inv.id, amount: 1180 }],
      };
      const first = (await api('post', '/payments', 'acct').send(body).expect(201)).body;
      const dup = await api('post', '/payments', 'acct').send(body).expect(409);
      expect(dup.body.existingId).toBe(first.id);
      expect((await api('get', `/invoices/${inv.id}`, 'view').expect(200)).body.balance).toBe('0'); // no se aplicó dos veces
      const b = await prisma.payment.count({ where: { companyId: companyB, externalRef: 'taller-cobro-77' } });
      expect(b).toBe(0);
    });
  });

  describe('versión y documentación', () => {
    it('GET /meta/version con sesión; sin sesión 401', async () => {
      const v = (await api('get', '/meta/version', 'view').expect(200)).body;
      expect(v).toMatchObject({ name: 'finanzas', contract: { major: 1, minor: 0 } });
      expect(v.apiVersion).toMatch(/^\d+\.\d+\.\d+/);
      await request(app.getHttpServer()).get('/meta/version').expect(401);
    });

    it('con API_DOCS=true la documentación OpenAPI describe las rutas de integración', async () => {
      const doc = (await request(app.getHttpServer()).get('/docs-json').expect(200)).body;
      expect(doc.openapi).toMatch(/^3\./);
      expect(Object.keys(doc.paths)).toEqual(expect.arrayContaining(['/invoices', '/invoices/by-source', '/payments', '/meta/version']));
    });
  });
});
