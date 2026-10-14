import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { EcfSenderService } from '../src/ecf/ecf-sender.service.js';

/** N7: emisión de e-CF por el proveedor (adaptador de pruebas): cola, aceptado, contingencia y rechazo. */
describe('e-CF con proveedor (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sender: EcfSenderService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  let companyId = '';
  let token = '';
  let customer = '', rejectCustomer = '';
  const api = (m: 'get' | 'post' | 'put', url: string) => request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token}`);
  const sale = (partnerId: string) => api('post', '/invoices').send({
    type: 'SALE', partnerId, issueDate: new Date().toISOString().slice(0, 10), ncfType: 'E31', dgiiIncomeType: '01', issueNow: true,
    lines: [{ description: 'Servicio', quantity: 1, unitPrice: 1000 }],
  });

  beforeAll(async () => {
    process.env.ECF_ENCRYPTION_KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90a1b2c3d4e5f60718293a4b5c6d7e8f9f';
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    sender = app.get(EcfSenderService);
    companyId = (await prisma.company.create({ data: { name: `ECF ${sfx}`, taxId: `1${String(Date.now()).slice(-8)}` } })).id;
    await prisma.user.create({ data: { email: `ecf-${sfx}@test.local`, password: await bcrypt.hash(password, 4), name: 'admin', role: UserRole.ADMIN, companyId } });
    token = (await request(app.getHttpServer()).post('/auth/login').send({ email: `ecf-${sfx}@test.local`, password })).body.access_token;
    await api('post', '/guidance/chart-template').send({}).expect(201);
    await api('post', '/ncf/sequences').send({ ncfType: 'E31', rangeStart: 1, rangeEnd: 100 }).expect(201);
    customer = (await api('post', '/partners').send({ type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131123456' }).expect(201)).body.id;
    rejectCustomer = (await api('post', '/partners').send({ type: 'CUSTOMER', name: 'RECHAZAR SRL', taxId: '131123457' }).expect(201)).body.id;
  }, 120_000);

  afterAll(async () => {
    delete process.env.ECF_ENCRYPTION_KEY;
    await app.close();
  });

  it('sin conexión: emitir E31 da 422 (se emite en el portal y se importa)', async () => {
    const r = await sale(customer).expect(422);
    expect(r.body.message).toMatch(/falta conectar tu proveedor/);
  });

  it('con conexión de pruebas: queda PENDING_SEND y la cola lo deja ACEPTADO con su XML', async () => {
    await api('put', '/ecf/connection').send({ providerCode: 'sandbox', environment: 'TEST', numbering: 'OURS', ecfTypes: ['E31'], active: true, credentials: { token: 'x' } }).expect(200);
    const c = (await api('get', '/ecf/connection').expect(200)).body;
    expect(JSON.stringify(c)).not.toMatch(/credentialsEnc|"token"/);
    const inv = (await sale(customer).expect(201)).body;
    expect(inv.ncf).toBe('E310000000001');
    expect((await prisma.ecfDocument.findUniqueOrThrow({ where: { invoiceId: inv.id } })).status).toBe('PENDING_SEND');
    await sender.tick();
    const d = await prisma.ecfDocument.findUniqueOrThrow({ where: { invoiceId: inv.id } });
    expect([d.status, !!d.securityCode, !!d.xmlFileUrl]).toEqual(['ACCEPTED', true, true]);
  });

  it('proveedor caído: CONTINGENCIA con reintento y aviso en el Panel', async () => {
    await api('put', '/ecf/connection').send({ providerCode: 'sandbox', environment: 'TEST', numbering: 'OURS', ecfTypes: ['E31'], active: true, settings: { simulateDown: true } }).expect(200);
    const inv = (await sale(customer).expect(201)).body;
    await sender.tick();
    const d = await prisma.ecfDocument.findUniqueOrThrow({ where: { invoiceId: inv.id } });
    expect([d.status, !!d.contingencySince, d.nextAttemptAt! > new Date()]).toEqual(['CONTINGENCY', true, true]);
    const alerts = (await api('get', '/fiscal/alerts').expect(200)).body;
    expect(alerts.some((a: { code: string }) => a.code === 'ECF_CONTINGENCY')).toBe(true);
    await api('put', '/ecf/connection').send({ providerCode: 'sandbox', environment: 'TEST', numbering: 'OURS', ecfTypes: ['E31'], active: true, settings: {} }).expect(200);
    await api('post', `/ecf/documents/${d.id}/retry`).send({}).expect(201);
    expect((await prisma.ecfDocument.findUniqueOrThrow({ where: { id: d.id } })).status).toBe('ACCEPTED');
  });

  it('rechazado: queda REJECTED con el motivo y esa factura sí se puede anular', async () => {
    const inv = (await sale(rejectCustomer).expect(201)).body;
    await sender.tick();
    const d = await prisma.ecfDocument.findUniqueOrThrow({ where: { invoiceId: inv.id } });
    expect([d.status, d.lastError]).toEqual(['REJECTED', expect.stringMatching(/RECHAZAR/)]);
    await api('post', `/invoices/${inv.id}/void`).send({ reason: 'Rechazada por la DGII', reasonCode: '01' }).expect(201);
  });
});
