import { mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

// Los XML importados se guardan en disco: carpeta propia de la prueba
const UPLOADS = mkdtempSync(join(tmpdir(), 'ecf-uploads-'));
process.env.UPLOADS_DIR = UPLOADS;

/**
 * Importación de XML e-CF (PLAN-v0.3 §7.4 y §13): compra de un suplidor, venta emitida en el portal,
 * nota de crédito E34 que acredita una B01, compra propia E41, duplicados, seguridad del lector y límites.
 * Montos a mano: 2 × 250 = 500 + ITBIS 18 % (90) = 590.
 */
describe('Importación de XML e-CF (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `ecfi-${r}-${sfx}@test.local`;
  const today = new Date().toISOString().slice(0, 10);
  const ecfToday = today.split('-').reverse().join('-');
  const rncA = `4${String(Date.now()).slice(-8)}`;
  const rncB = `5${String(Date.now()).slice(-8)}`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let customer: string, itbis: string;

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const xml = (o: { encf: string; emisor: string; comprador?: string; nombre?: string; compradorNombre?: string; total?: string; extra?: string; precio?: string }) => `<?xml version="1.0" encoding="utf-8"?>
<ECF>
  <Encabezado>
    <Version>1.0</Version>
    <IdDoc><TipoeCF>${o.encf.slice(1, 3)}</TipoeCF><eNCF>${o.encf}</eNCF><TipoIngresos>01</TipoIngresos><TipoPago>1</TipoPago></IdDoc>
    <Emisor><RNCEmisor>${o.emisor}</RNCEmisor><RazonSocialEmisor>${o.nombre ?? 'Suplidor &amp; Cía SRL'}</RazonSocialEmisor><FechaEmision>${ecfToday}</FechaEmision></Emisor>
    <Comprador>${o.comprador ? `<RNCComprador>${o.comprador}</RNCComprador>` : ''}<RazonSocialComprador>${o.compradorNombre ?? 'Comprador SRL'}</RazonSocialComprador></Comprador>
    <Totales><MontoGravadoTotal>500.00</MontoGravadoTotal><TotalITBIS>90.00</TotalITBIS><MontoTotal>${o.total ?? '590.00'}</MontoTotal></Totales>
  </Encabezado>
  <DetallesItems>
    <Item><NumeroLinea>1</NumeroLinea><IndicadorFacturacion>1</IndicadorFacturacion><NombreItem>Repuestos</NombreItem>
      <IndicadorBienoServicio>1</IndicadorBienoServicio><CantidadItem>2</CantidadItem>
      <PrecioUnitarioItem>${o.precio ?? '250.00'}</PrecioUnitarioItem><MontoItem>500.00</MontoItem></Item>
  </DetallesItems>
  ${o.extra ?? ''}
  <FechaHoraFirma>${ecfToday} 10:00:00</FechaHoraFirma>
</ECF>`;
  type Prepared = { importId: string | null; fileName: string; error?: string; preview?: { canImport: boolean; errors: string[]; type: string; partner: { isNew: boolean; name: string } } };
  const upload = async (files: [string, string][], who = 'acct', status = 201) => {
    let r = api('post', '/ecf/import', who);
    for (const [name, content] of files) r = r.attach('files', Buffer.from(content), { filename: name, contentType: 'text/xml' });
    return (await r.expect(status)).body as Prepared[];
  };
  const prepareOne = async (content: string, who = 'acct') => (await upload([['ecf.xml', content]], who))[0];
  const confirm = (id: string, body: Record<string, unknown> = {}, who = 'acct') => api('post', `/ecf/import/${id}/confirm`, who).send(body);

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `ECFI A ${sfx}`, taxId: rncA } })).id;
    companyB = (await prisma.company.create({ data: { name: `ECFI B ${sfx}`, taxId: rncB } })).id;
    const users = [['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB]] as const;
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type } })).id);
    await mk('cxc', '1201', 'ASSET'); await mk('cxp', '2101', 'LIABILITY');
    await mk('ventas', '4101', 'INCOME'); await mk('gastos', '5101', 'EXPENSE');
    await mk('itbisPagar', '2201', 'LIABILITY'); await mk('itbisAdel', '1301', 'ASSET');
    await api('post', '/journals/defaults', 'admin').expect(201);
    await api('post', '/ncf/sequences', 'admin').send({ ncfType: 'B01', rangeStart: 1, rangeEnd: 100 }).expect(201);
    await api('put', '/settings/accounting', 'admin').send({
      receivableAccountId: acc.cxc, payableAccountId: acc.cxp, salesIncomeAccountId: acc.ventas, purchaseExpenseAccountId: acc.gastos,
    }).expect(200);
    customer = (await api('post', '/partners', 'acct').send({ type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131123456' }).expect(201)).body.id;
    itbis = (await api('post', '/tax-rates', 'acct').send({
      name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: acc.itbisPagar, purchaseAccountId: acc.itbisAdel,
    }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.ecfDocument.deleteMany({ where });
    await prisma.ecfImport.deleteMany({ where });
    await prisma.invoiceWithholding.deleteMany({ where: { invoice: where } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: where } });
    await prisma.invoice.updateMany({ where, data: { relatedInvoiceId: null } });
    await prisma.invoice.deleteMany({ where });
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
    rmSync(UPLOADS, { recursive: true, force: true });
  }, 60000);

  describe('compras y ventas', () => {
    let purchaseImport: string;

    it('compra de un suplidor: la vista previa propone crear el proveedor y no crea facturas', async () => {
      const p = await prepareOne(xml({ encf: 'E310000000555', emisor: '101010101', comprador: rncA }));
      purchaseImport = p.importId!;
      expect(p.preview).toMatchObject({ canImport: true, type: 'PURCHASE', partner: { isNew: true, name: 'Suplidor & Cía SRL' } });
      expect(await prisma.invoice.count({ where: { companyId: companyA } })).toBe(0);
      // El XML quedó guardado tal cual (R12)
      const row = await prisma.ecfImport.findUniqueOrThrow({ where: { id: purchaseImport } });
      expect(readdirSync(join(UPLOADS, companyA, 'ecf-xml'))).toContain(row.storageKey.split('/').pop());
    });

    it('al confirmar: proveedor, compra emitida con asiento y EcfDocument "No verificado" en una transacción', async () => {
      const res = await confirm(purchaseImport, { dgiiExpenseType: '09' }).expect(201);
      const inv = res.body.invoice;
      expect(inv).toMatchObject({ type: 'PURCHASE', status: 'ISSUED', ncf: 'E310000000555', total: '590', dgiiExpenseType: '09' });
      expect(inv.journalEntryId).toBeTruthy();
      expect(inv.ecfDocument).toMatchObject({ status: 'IMPORTED', origin: 'IMPORTED', verification: 'UNVERIFIED', issuerRnc: '101010101' });
      // Confirmar otra vez la misma importación: 409
      await confirm(purchaseImport).expect(409);
    });

    it('el mismo e-CF otra vez: la vista previa lo avisa y confirmarlo da 409', async () => {
      const p = await prepareOne(xml({ encf: 'E310000000555', emisor: '101010101', comprador: rncA }));
      expect(p.preview!.errors.join(' ')).toContain('ya está registrado');
      await confirm(p.importId!).expect(409);
    });

    it('dos importaciones simultáneas del mismo e-CF: una pasa y la otra da 409', async () => {
      const content = xml({ encf: 'E310000000600', emisor: '101010101', comprador: rncA });
      const [a, b] = await upload([['a.xml', content], ['b.xml', content]]);
      const results = await Promise.all([confirm(a.importId!), confirm(b.importId!)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 409]);
      expect(await prisma.ecfDocument.count({ where: { companyId: companyA, eNcf: 'E310000000600' } })).toBe(1);
    });

    it('venta emitida en el portal del proveedor: se registra con su e-NCF y sin gastar secuencias', async () => {
      const p = await prepareOne(xml({ encf: 'E310000000900', emisor: rncA, comprador: '131123456', compradorNombre: 'Cliente SRL' }));
      expect(p.preview).toMatchObject({ canImport: true, type: 'SALE', partner: { isNew: false } });
      const inv = (await confirm(p.importId!).expect(201)).body.invoice;
      expect(inv).toMatchObject({ type: 'SALE', ncf: 'E310000000900', ncfType: 'E31', partnerId: customer, dgiiIncomeType: '01' });
      expect(inv.ecfDocument).toMatchObject({ issuerRnc: rncA, verification: 'UNVERIFIED' });
      // Un e-CF importado no se anula (Ley 32-23, art. 7): se corrige con nota de crédito
      await api('post', `/invoices/${inv.id}/void`, 'admin').send({ reason: 'x', reasonCode: '05' }).expect(422);
    });

    it('una E34 importada se enlaza a la B01 que modifica y la acredita', async () => {
      const b01 = (await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'B01', issueNow: true,
        lines: [{ description: 'Servicio', quantity: 1, unitPrice: 1000, taxRateId: itbis }],
      }).expect(201)).body;
      const note = xml({
        encf: 'E340000000001', emisor: rncA, comprador: '131123456',
        extra: `<InformacionReferencia><NCFModificado>${b01.ncf}</NCFModificado><FechaNCFModificado>${ecfToday}</FechaNCFModificado><CodigoModificacion>3</CodigoModificacion></InformacionReferencia>`,
      });
      const p = await prepareOne(note);
      expect(p.preview).toMatchObject({ canImport: true, type: 'CREDIT_NOTE' });
      const n = (await confirm(p.importId!).expect(201)).body.invoice;
      expect(n).toMatchObject({ type: 'CREDIT_NOTE', ncf: 'E340000000001', relatedInvoiceId: b01.id, balance: '0', status: 'PAID' });
      const orig = (await api('get', `/invoices/${b01.id}`, 'view').expect(200)).body;
      expect([orig.balance, orig.status]).toEqual(['590', 'PARTIALLY_PAID']); // 1,180 − 590
    });

    it('compra propia E41 (proveedor informal): el e-NCF es de la empresa y el suplidor va en Comprador', async () => {
      const p = await prepareOne(xml({ encf: 'E410000000010', emisor: rncA, comprador: '00112345678', compradorNombre: 'Juan Pérez' }));
      expect(p.preview).toMatchObject({ canImport: true, type: 'PURCHASE', partner: { isNew: true, name: 'Juan Pérez' } });
      const inv = (await confirm(p.importId!, { dgiiExpenseType: '02' }).expect(201)).body.invoice;
      expect(inv).toMatchObject({ type: 'PURCHASE', ncf: 'E410000000010', ncfType: 'E41' });
      expect(inv.ecfDocument.issuerRnc).toBe(rncA);
    });
  });

  describe('lo que se rechaza', () => {
    it('XML de otra empresa o con totales que no cuadran: la vista previa lo dice y confirmarlo da 422', async () => {
      const ajeno = await prepareOne(xml({ encf: 'E310000000777', emisor: '101010101', comprador: '999999999' }));
      expect(ajeno.preview!.errors.join(' ')).toContain('no es de tu empresa');
      await confirm(ajeno.importId!).expect(422);
      const descuadre = await prepareOne(xml({ encf: 'E310000000778', emisor: '101010101', comprador: rncA, total: '600.00' }));
      expect(descuadre.preview!.errors.join(' ')).toContain('no coincide');
    });

    it('DOCTYPE/entidades y anidación de más de 30 niveles: rechazados sin leerlos', async () => {
      const [evil, deep] = await upload([
        ['evil.xml', '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e SYSTEM "file:///etc/passwd">]><ECF>&e;</ECF>'],
        ['deep.xml', `<ECF>${'<a>'.repeat(40)}${'</a>'.repeat(40)}</ECF>`],
      ]);
      expect(evil).toMatchObject({ importId: null });
      expect(evil.error).toContain('DOCTYPE');
      expect(deep.error).toContain('profunda');
    });

    it('11 archivos: 400; un archivo de más de 1 MB: 413; sin archivos: 400', async () => {
      const r = await upload(Array.from({ length: 11 }, (_, i) => [`f${i}.xml`, '<ECF/>'] as [string, string]), 'acct', 400) as unknown as { message: string };
      expect(r.message).toContain('hasta 10');
      const big = await upload([['big.xml', `<ECF>${' '.repeat(1024 * 1024 + 10)}</ECF>`]], 'acct', 413) as unknown as { message: string };
      expect(big.message).toContain('1 MB');
      await api('post', '/ecf/import', 'acct').expect(400);
    });

    it('venta E sin conexión: 422; VIEWER no importa; la otra empresa no ve ni confirma', async () => {
      await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: today, ncfType: 'E31', issueNow: true,
        lines: [{ description: 'Servicio', quantity: 1, unitPrice: 100 }],
      }).expect(422);
      await upload([['x.xml', '<ECF/>']], 'view', 403);
      const p = await prepareOne(xml({ encf: 'E310000000801', emisor: '101010101', comprador: rncA }));
      await confirm(p.importId!, {}, 'adminb').expect(404);
      expect((await api('get', '/ecf/imports', 'adminb').expect(200)).body).toEqual([]);
      await api('delete', `/ecf/import/${p.importId}`, 'acct').expect(200);
      await confirm(p.importId!).expect(409);
    });
  });
});
