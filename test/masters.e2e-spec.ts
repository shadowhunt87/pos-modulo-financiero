import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { NcfService } from '../src/masters/ncf/ncf.service.js';
import { DocumentSequencesService } from '../src/masters/sequences/document-sequences.service.js';

describe('Maestros (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `mst-${r}-${sfx}@test.local`;
  let companyA: string;
  let companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};

  const api = (m: 'get' | 'post' | 'patch' | 'put', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `M A ${sfx}`, taxId: `M-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `M B ${sfx}`, taxId: `M-B-${sfx}` } })).id;
    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA],
      ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ];
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      const res = await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password });
      token[r] = res.body.access_token;
    }
    const mk = async (key: string, companyId: string, code: string, type: 'ASSET' | 'LIABILITY' | 'INCOME') =>
      (acc[key] = (await prisma.account.create({ data: { companyId, code, name: key, type } })).id);
    await mk('cxc', companyA, '1201', 'ASSET');
    await mk('itbisPagar', companyA, '2201', 'LIABILITY');
    await mk('ventas', companyA, '4101', 'INCOME');
    await mk('cuentaB', companyB, '1201', 'ASSET');
  });

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
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

  describe('partners', () => {
    let id: string;
    it('crea cliente, normaliza el RNC e infiere el tipo', async () => {
      const res = await api('post', '/partners', 'acct')
        .send({ type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131-12345-6' }).expect(201);
      expect(res.body).toMatchObject({ taxId: '131123456', taxIdType: 'RNC' });
      id = res.body.id;
    });
    it('422 con RNC de longitud incorrecta, 409 si el RNC se repite', async () => {
      await api('post', '/partners', 'acct').send({ type: 'SUPPLIER', name: 'X', taxIdType: 'RNC', taxId: '123' }).expect(422);
      await api('post', '/partners', 'acct').send({ type: 'SUPPLIER', name: 'Y', taxId: '131123456' }).expect(409);
    });
    it('VIEWER lee pero no escribe; busca por nombre; otra empresa no lo ve', async () => {
      await api('post', '/partners', 'view').send({ type: 'CUSTOMER', name: 'Z' }).expect(403);
      const list = await api('get', '/partners?q=cliente&type=CUSTOMER', 'view').expect(200);
      expect(list.body.total).toBe(1);
      await api('get', `/partners/${id}`, 'adminb').expect(404);
    });
  });

  describe('tax-rates', () => {
    it('crea ITBIS y marca retenciones automáticamente', async () => {
      const itbis = await api('post', '/tax-rates', 'acct')
        .send({ name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: acc.itbisPagar }).expect(201);
      expect(itbis.body.isWithholding).toBe(false);
      const ret = await api('post', '/tax-rates', 'acct').send({ name: 'Ret ISR 10%', rate: 10, type: 'ISR_WITHHOLDING' }).expect(201);
      expect(ret.body.isWithholding).toBe(true);
    });
    it('404 con cuenta de otra empresa y 400 con tasa > 100', async () => {
      await api('post', '/tax-rates', 'acct').send({ name: 'x', rate: 5, type: 'ITBIS', salesAccountId: acc.cuentaB }).expect(404);
      await api('post', '/tax-rates', 'acct').send({ name: 'x', rate: 150, type: 'ITBIS' }).expect(400);
    });
  });

  describe('ncf', () => {
    let seqId: string;
    it('solo ADMIN crea secuencias; formato inválido => 400', async () => {
      await api('post', '/ncf/sequences', 'acct').send({ ncfType: 'B01', rangeStart: 1, rangeEnd: 3 }).expect(403);
      await api('post', '/ncf/sequences', 'admin').send({ ncfType: 'B99', rangeStart: 1, rangeEnd: 3 }).expect(400);
      const res = await api('post', '/ncf/sequences', 'admin')
        .send({ ncfType: 'B01', rangeStart: 1, rangeEnd: 3, warningThreshold: 1 }).expect(201);
      expect(res.body).toMatchObject({ remaining: 3, nextNcf: 'B0100000001' });
      seqId = res.body.id;
      await api('post', '/ncf/sequences', 'admin').send({ ncfType: 'B01', rangeStart: 1, rangeEnd: 3 }).expect(409);
    });
    it('consumo concurrente: sin duplicados y se rechaza al agotarse', async () => {
      const ncf = app.get(NcfService);
      const take = () => prisma.$transaction((tx) => ncf.consumeNext(tx, companyA, 'B01'));
      const got = await Promise.all([take(), take(), take()]);
      expect(got.map((g) => g.ncf).sort()).toEqual(['B0100000001', 'B0100000002', 'B0100000003']);
      await expect(take()).rejects.toMatchObject({ status: 422 });
    });
    it('si la transacción falla, el número no se pierde', async () => {
      await api('patch', `/ncf/sequences/${seqId}`, 'admin').send({ rangeEnd: 5 }).expect(200);
      const ncf = app.get(NcfService);
      await expect(
        prisma.$transaction(async (tx) => { await ncf.consumeNext(tx, companyA, 'B01'); throw new Error('rollback'); }),
      ).rejects.toThrow('rollback');
      const next = await prisma.$transaction((tx) => ncf.consumeNext(tx, companyA, 'B01'));
      expect(next.ncf).toBe('B0100000004');
    });
    it('no se puede reducir el rango ni renovar una secuencia con saldo', async () => {
      await api('patch', `/ncf/sequences/${seqId}`, 'admin').send({ rangeEnd: 2 }).expect(422);
      await api('post', `/ncf/sequences/${seqId}/renew`, 'admin').send({ rangeStart: 10, rangeEnd: 20 }).expect(422);
    });
  });

  describe('configuración contable, diarios y secuencias', () => {
    it('valida el tipo de cuenta de cada configuración', async () => {
      await api('put', '/settings/accounting', 'admin').send({ receivableAccountId: acc.ventas }).expect(422);
      await api('put', '/settings/accounting', 'acct').send({ receivableAccountId: acc.cxc }).expect(403);
      const res = await api('put', '/settings/accounting', 'admin')
        .send({ receivableAccountId: acc.cxc, salesIncomeAccountId: acc.ventas }).expect(200);
      expect(res.body.receivableAccountId).toMatchObject({ code: '1201' });
      expect(res.body.payableAccountId).toBeNull();
    });
    it('crea diarios por defecto de forma idempotente', async () => {
      const a = await api('post', '/journals/defaults', 'admin').expect(201);
      expect(a.body.created).toBe(8);
      const b = await api('post', '/journals/defaults', 'admin').expect(201);
      expect(b.body.created).toBe(0);
    });
    it('numera documentos correlativamente', async () => {
      const seq = app.get(DocumentSequencesService);
      const n1 = await prisma.$transaction((tx) => seq.next(tx, companyA, 'INVOICE_SALE'));
      const n2 = await prisma.$transaction((tx) => seq.next(tx, companyA, 'INVOICE_SALE'));
      expect([n1, n2]).toEqual(['FV-000001', 'FV-000002']);
      await api('patch', '/document-sequences/INVOICE_SALE', 'admin').send({ nextNumber: 1 }).expect(422);
    });
  });
});
