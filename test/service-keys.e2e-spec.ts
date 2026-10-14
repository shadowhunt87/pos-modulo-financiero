import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Llave de servicio con alcance (INTEGRACION-TALLER §4.7, S-b): un sistema externo crea clientes,
 * ventas con su origen y cobros con su referencia, y lee solo lo suyo. Todo lo demás, 403.
 */
describe('Llaves de servicio (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `sk-${r}-${sfx}@test.local`;
  const today = new Date().toISOString().slice(0, 10);
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let customer: string, itbis: string, bank: string, keyA: string, keyIdA: string, keyB: string;

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const svc = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, key = keyA) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${key}`);
  const sale = (over: Record<string, unknown> = {}) => ({
    type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', issueNow: true,
    sourceModule: 'taller.orden', sourceId: `ot-${Math.random().toString(36).slice(2)}:1`,
    lines: [{ description: 'Servicio de taller', quantity: 1, unitPrice: 1000, taxRateId: itbis }], ...over,
  });

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `SK A ${sfx}`, taxId: `SK-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `SK B ${sfx}`, taxId: `SK-B-${sfx}` } })).id;
    const users = [['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB]] as const;
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type } })).id);
    await mk('cxc', '1201', 'ASSET'); await mk('cxp', '2101', 'LIABILITY'); await mk('banco', '1102', 'ASSET');
    await mk('ventas', '4101', 'INCOME'); await mk('gastos', '5101', 'EXPENSE'); await mk('itbisPagar', '2201', 'LIABILITY');
    await api('post', '/journals/defaults', 'admin').expect(201);
    await api('post', '/ncf/sequences', 'admin').send({ ncfType: 'B01', rangeStart: 1, rangeEnd: 100 }).expect(201);
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
    await prisma.invoiceLine.deleteMany({ where: { invoice: where } });
    await prisma.invoice.deleteMany({ where });
    await prisma.bankAccount.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.serviceKey.deleteMany({ where });
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

  describe('administración', () => {
    it('solo ADMIN crea y lista; la llave se muestra una sola vez y en la base queda solo el hash', async () => {
      await api('post', '/service-keys', 'acct').send({ name: 'Taller', sourceModule: 'taller.orden' }).expect(403);
      await api('get', '/service-keys', 'view').expect(403);
      await api('post', '/service-keys', 'admin').send({ name: 'Taller', sourceModule: 'Taller' }).expect(400);
      const res = (await api('post', '/service-keys', 'admin').send({ name: 'Taller Sirtech', sourceModule: 'taller.orden' }).expect(201)).body;
      keyA = res.key;
      keyIdA = res.id;
      expect(keyA).toMatch(/^fsk_[A-Za-z0-9]{12}_[A-Za-z0-9_-]{43}$/);
      const list = (await api('get', '/service-keys', 'admin').expect(200)).body;
      expect(list).toHaveLength(1);
      expect(JSON.stringify(list)).not.toContain(keyA.split('_')[2]);
      const row = await prisma.serviceKey.findUniqueOrThrow({ where: { id: keyIdA } });
      expect(row.keyHash).not.toContain(keyA.split('_')[2]);
      keyB = (await api('post', '/service-keys', 'adminb').send({ name: 'Otro', sourceModule: 'taller.orden' }).expect(201)).body.key;
    });

    it('el usuario técnico no puede iniciar sesión con clave (aunque se la cambien)', async () => {
      const row = await prisma.serviceKey.findUniqueOrThrow({ where: { id: keyIdA } });
      const u = await prisma.user.update({ where: { id: row.userId }, data: { password: await bcrypt.hash(password, 4) } });
      expect(u).toMatchObject({ isService: true, role: 'ACCOUNTANT' });
      await request(app.getHttpServer()).post('/auth/login').send({ email: u.email, password }).expect(401);
    });
  });

  describe('lo que la llave sí puede hacer', () => {
    let invId: string;

    it('identificarse y leer clientes, impuestos y bancos', async () => {
      expect((await svc('get', '/auth/me').expect(200)).body).toMatchObject({ companyId: companyA, role: 'ACCOUNTANT' });
      expect((await svc('get', '/partners').expect(200)).body.data.length).toBeGreaterThan(0);
      await svc('get', '/tax-rates').expect(200);
      await svc('get', '/bank-accounts').expect(200);
      await svc('get', '/meta/version').expect(200);
    });

    it('crear un cliente, una venta con su origen y su cobro con referencia; leer lo suyo', async () => {
      await svc('post', '/partners').send({ type: 'CUSTOMER', name: 'Cliente del taller', taxId: '131999999' }).expect(201);
      const inv = (await svc('post', '/invoices').send(sale()).expect(201)).body;
      invId = inv.id;
      expect(inv).toMatchObject({ status: 'ISSUED', sourceModule: 'taller.orden' });
      await svc('get', `/invoices/${invId}`).expect(200);
      const pay = (await svc('post', '/payments').send({
        direction: 'RECEIVED', partnerId: customer, date: today, amount: 1180, method: 'CASH', bankAccountId: bank,
        externalRef: 'taller-cobro-1', allocations: [{ invoiceId: invId, amount: 1180 }],
      }).expect(201)).body;
      await svc('get', `/payments/${pay.id}`).expect(200);
      const found = (await svc('get', `/invoices/by-source?sourceModule=taller.orden&sourceId=${encodeURIComponent(inv.sourceId)}`).expect(200)).body;
      expect(found).toHaveLength(1);
      // Último uso registrado
      expect((await prisma.serviceKey.findUniqueOrThrow({ where: { id: keyIdA } })).lastUsedAt).not.toBeNull();
    });
  });

  describe('lo que la llave NO puede hacer', () => {
    it('rutas fuera de su alcance: 403 aunque su rol (ACCOUNTANT) las permita', async () => {
      await svc('get', '/invoices').expect(403); // la lista completa de facturas de la empresa
      await svc('get', '/receivables-payables/aging?scope=RECEIVABLE').expect(403);
      await svc('get', '/reports/financial-ratios?from=2030-01-01&to=2030-03-31').expect(403);
      await svc('get', '/dgii/607?period=2030-01').expect(403);
      await svc('post', '/tax-rates').send({ name: 'X', rate: 1 }).expect(403);
      await svc('post', '/accounting/journal-entries').send({}).expect(403);
      await svc('patch', `/partners/${customer}`).send({ name: 'Cambiado' }).expect(403);
      await svc('get', '/service-keys').expect(403);
      await svc('get', '/users').expect(403);
    });

    it('facturas: solo ventas, con su mismo origen; nada de notas ni compras', async () => {
      const r = await svc('post', '/invoices').send(sale({ type: 'CREDIT_NOTE' })).expect(403);
      expect(r.body.message).toContain('solo se crean facturas de venta');
      await svc('post', '/invoices').send(sale({ type: 'PURCHASE' })).expect(403);
      await svc('post', '/invoices').send(sale({ sourceModule: undefined, sourceId: undefined })).expect(403);
      await svc('post', '/invoices').send(sale({ sourceModule: 'alquiler.contrato' })).expect(403);
      await svc('get', '/invoices/by-source?sourceModule=alquiler.contrato&sourceId=x').expect(403);
    });

    it('cobros: solo recibidos y con referencia', async () => {
      const body = { direction: 'RECEIVED', partnerId: customer, date: today, amount: 10, method: 'CASH', bankAccountId: bank };
      await svc('post', '/payments').send(body).expect(403);
      await svc('post', '/payments').send({ ...body, direction: 'MADE', externalRef: 'x' }).expect(403);
    });

    it('no lee documentos que no creó ella: 404, igual que lo de otra empresa', async () => {
      const own = (await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', issueNow: true,
        lines: [{ description: 'Venta de mostrador', quantity: 1, unitPrice: 10 }],
      }).expect(201)).body;
      await svc('get', `/invoices/${own.id}`).expect(404);
      await svc('get', `/invoices/${own.id}`, keyB).expect(404);
    });

    it('llave alterada, desconocida o revocada: 401; al revocar, su usuario técnico queda inactivo', async () => {
      await svc('get', '/auth/me', keyA.slice(0, -1) + (keyA.endsWith('A') ? 'B' : 'A')).expect(401);
      await svc('get', '/auth/me', 'fsk_AAAAAAAAAAAA_' + 'x'.repeat(43)).expect(401);
      await svc('get', '/auth/me', 'fsk_corta').expect(401);
      await api('post', `/service-keys/${keyIdA}/revoke`, 'acct').expect(403);
      const r = (await api('post', `/service-keys/${keyIdA}/revoke`, 'admin').expect(201)).body;
      expect(r.revokedAt).toBeTruthy();
      await svc('get', '/auth/me').expect(401);
      await api('post', `/service-keys/${keyIdA}/revoke`, 'admin').expect(409);
      const row = await prisma.serviceKey.findUniqueOrThrow({ where: { id: keyIdA } });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: row.userId } })).active).toBe(false);
      // La otra empresa no puede revocar ni ver llaves ajenas
      await api('post', `/service-keys/${keyIdA}/revoke`, 'adminb').expect(404);
    });
  });
});
