import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { mkdtempSync, existsSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { AttachmentsService, MAX_ATTACHMENTS_PER_PARENT } from '../src/attachments/attachments.service.js';
import { LocalFileStorage } from '../src/attachments/file-storage.js';
import { detectFile, sanitizeFileName } from '../src/attachments/file-type.js';
import { ConfigService } from '@nestjs/config';
import { FiscalPeriodStatus, UserRole } from '../src/generated/prisma/enums.js';

const UPLOADS = mkdtempSync(join(tmpdir(), 'fb-uploads-'));
process.env.UPLOADS_DIR = UPLOADS;
process.env.MAX_UPLOAD_MB = '1';

const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n1 0 obj<<>>endobj\n${extra}\n%%EOF\n`);
const png = () => Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('fakepngdata')]);

describe('Adjuntos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `att-${r}-${sfx}@test.local`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const userId: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let entryA: string, entryB: string, invoiceA: string, paymentA: string, reconA: string, partnerA: string, bankA: string;

  const api = (m: 'get' | 'post' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const upload = (who: string, parent: Record<string, string>, file: Buffer | null, filename = 'soporte.pdf') => {
    let r = api('post', '/attachments', who);
    for (const [k, v] of Object.entries(parent)) r = r.field(k, v);
    if (file) r = r.attach('file', file, { filename });
    return r;
  };
  const filesOnDisk = () => (existsSync(join(UPLOADS, companyA)) ? readdirSync(join(UPLOADS, companyA)).length : 0);
  const entry = async (who: string, date: string) =>
    (await api('post', '/accounting/journal-entries', who).send({
      date, description: 'Asiento de prueba',
      lines: [{ accountId: acc.caja, debit: 100 }, { accountId: acc.capital, credit: 100 }],
    }).expect(201)).body.id as string;

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `Att A ${sfx}`, taxId: '130000019' } })).id;
    companyB = (await prisma.company.create({ data: { name: `Att B ${sfx}`, taxId: '131999999' } })).id;
    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['acct2', UserRole.ACCOUNTANT, companyA],
      ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ];
    for (const [r, role, companyId] of users) {
      userId[r] = (await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } })).id;
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    for (const [key, code, type] of [['caja', '1101', 'ASSET'], ['capital', '3101', 'EQUITY']] as const) {
      acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type } })).id;
    }
    const accB = await prisma.account.createMany({ data: [{ companyId: companyB, code: '1101', name: 'caja', type: 'ASSET' }, { companyId: companyB, code: '3101', name: 'cap', type: 'EQUITY' }] });
    expect(accB.count).toBe(2);
    const bAcc = await prisma.account.findMany({ where: { companyId: companyB } });
    await api('post', '/journals/defaults', 'admin').expect(201);
    await api('post', '/journals/defaults', 'adminb').expect(201);
    entryA = await entry('acct', '2031-03-10');
    entryB = (await api('post', '/accounting/journal-entries', 'adminb').send({
      date: '2031-03-10', description: 'B',
      lines: [{ accountId: bAcc.find((a) => a.code === '1101')!.id, debit: 50 }, { accountId: bAcc.find((a) => a.code === '3101')!.id, credit: 50 }],
    }).expect(201)).body.id;
    partnerA = (await prisma.partner.create({ data: { companyId: companyA, type: 'CUSTOMER', name: 'Cliente' } })).id;
    invoiceA = (await prisma.invoice.create({
      data: { companyId: companyA, partnerId: partnerA, type: 'SALE', number: `ATT-${sfx}`, issueDate: new Date('2031-03-10'), subtotal: 0, total: 0, createdById: userId.acct },
    })).id;
    paymentA = (await prisma.payment.create({
      data: { companyId: companyA, partnerId: partnerA, direction: 'RECEIVED', amount: 10, date: new Date('2031-03-10'), method: 'CASH', createdById: userId.acct },
    })).id;
    bankA = (await prisma.bankAccount.create({ data: { companyId: companyA, bankName: 'Banco', accountNumber: '1' } })).id;
    reconA = (await prisma.bankReconciliation.create({
      data: { companyId: companyA, bankAccountId: bankA, statementDate: new Date('2031-03-31'), statementBalance: 0, bookBalance: 0 },
    })).id;
  }, 60000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.attachment.deleteMany({ where });
    await prisma.bankReconciliation.deleteMany({ where });
    await prisma.bankAccount.deleteMany({ where });
    await prisma.payment.deleteMany({ where });
    await prisma.invoice.deleteMany({ where });
    await prisma.partner.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.fiscalPeriod.deleteMany({ where });
    await prisma.fiscalYear.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.documentSequence.deleteMany({ where });
    await prisma.accountingSettings.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
    rmSync(UPLOADS, { recursive: true, force: true });
  });

  let att: { id: string };

  describe('subir', () => {
    it('sube un PDF a un asiento: metadatos correctos, sin exponer la ruta, archivo en disco y auditoría', async () => {
      const body = pdf('contenido-1');
      const r = await upload('acct', { journalEntryId: entryA }, body, 'Factura 001.pdf').expect(201);
      att = r.body;
      expect(r.body).toMatchObject({ journalEntryId: entryA, fileName: 'Factura 001.pdf', mimeType: 'application/pdf', sizeBytes: body.length, uploadedById: userId.acct });
      expect(r.body.fileUrl).toBeUndefined();
      expect(filesOnDisk()).toBe(1);
      const audit = await prisma.auditLog.findMany({ where: { companyId: companyA, entityName: 'Attachment', entityId: att.id } });
      expect(audit.map((a) => a.action)).toEqual(['CREATE']);
    });

    it('sube a factura, pago y conciliación', async () => {
      await upload('acct', { invoiceId: invoiceA }, png(), 'foto.PNG').expect(201).then((r) => expect(r.body.mimeType).toBe('image/png'));
      await upload('admin', { paymentId: paymentA }, pdf('p'), 'recibo.pdf').expect(201);
      await upload('admin', { reconciliationId: reconA }, Buffer.from('fecha,monto\n2031-03-01,10\n'), 'extracto.csv').expect(201)
        .then((r) => expect(r.body.mimeType).toBe('text/csv'));
    });

    it('JPG/JPEG, XLSX y DOCX (zip) se aceptan con su tipo real', async () => {
      const jpg = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('jfif')]);
      const zip = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from('contenido')]);
      const ids: string[] = [];
      for (const [buf, name, mime] of [
        [jpg, 'a.jpg', 'image/jpeg'], [jpg, 'b.JPEG', 'image/jpeg'], [zip, 'c.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        [zip, 'd.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      ] as [Buffer, string, string][]) {
        const r = await upload('acct', { invoiceId: invoiceA }, buf, name).expect(201);
        expect(r.body.mimeType).toBe(mime);
        ids.push(r.body.id);
      }
      await upload('acct', { invoiceId: invoiceA }, jpg, 'a.png').expect(400);
      await upload('acct', { invoiceId: invoiceA }, zip, 'a.zip').expect(400);
      await upload('acct', { invoiceId: invoiceA }, zip, 'a.pdf').expect(400);
      for (const i of ids) await api('delete', `/attachments/${i}`, 'admin').expect(200);
    });

    it('nombres: rutas, caracteres de control, puntos iniciales y largo', () => {
      expect(sanitizeFileName('../../etc/passwd.pdf')).toBe('passwd.pdf');
      expect(sanitizeFileName('..\\..\\win\\sys.pdf')).toBe('sys.pdf');
      expect(sanitizeFileName('.htaccess.pdf')).toBe('htaccess.pdf');
      expect(sanitizeFileName('a\u0000b\nc.pdf')).toBe('a_b_c.pdf');
      expect(sanitizeFileName('')).toBe('archivo');
      expect(sanitizeFileName('///')).toBe('archivo');
      const long = sanitizeFileName('x'.repeat(300) + '.pdf');
      expect(long.length).toBe(150);
      expect(long.endsWith('.pdf')).toBe(true);
      // multer entrega los bytes UTF-8 como latin1: se recupera "Informe número 1.pdf"
      expect(sanitizeFileName(Buffer.from('Informe número 1.pdf', 'utf8').toString('latin1'))).toBe('Informe número 1.pdf');
      expect(detectFile(Buffer.from('%PDF-1.7'), 'a.PDF').ext).toBe('pdf');
    });

    it('exactamente un documento padre', async () => {
      await upload('acct', {}, pdf()).expect(400);
      await upload('acct', { journalEntryId: entryA, invoiceId: invoiceA }, pdf()).expect(400);
      await upload('acct', { journalEntryId: 'no-es-uuid' }, pdf()).expect(400);
      await upload('acct', { journalEntryId: entryA, otroCampo: 'x' }, pdf()).expect(400);
    });

    it('sin archivo o vacío: 400', async () => {
      await upload('acct', { journalEntryId: entryA }, null).expect(400);
      await upload('acct', { journalEntryId: entryA }, Buffer.alloc(0)).expect(400);
      await upload('acct', { journalEntryId: entryA }, Buffer.alloc(0), 'vacio.txt').expect(400); // texto vacío: el tipo sería válido
    });

    it('el padre debe ser de MI empresa (404 también en el sentido contrario)', async () => {
      await upload('adminb', { journalEntryId: entryA }, pdf()).expect(404);
      await upload('adminb', { invoiceId: invoiceA }, pdf()).expect(404);
      await upload('adminb', { paymentId: paymentA }, pdf()).expect(404);
      await upload('adminb', { reconciliationId: reconA }, pdf()).expect(404);
      await api('get', `/attachments?paymentId=${paymentA}`, 'adminb').expect(404);
      await api('get', `/attachments?reconciliationId=${reconA}`, 'adminb').expect(404);
      await upload('admin', { journalEntryId: entryB }, pdf()).expect(404);
    });

    it('roles: el VIEWER no sube; sin token 401', async () => {
      await upload('view', { journalEntryId: entryA }, pdf()).expect(403);
      await request(app.getHttpServer()).post('/attachments').expect(401);
    });

    it('tipos peligrosos o disfrazados se rechazan', async () => {
      const p = { journalEntryId: entryA };
      await upload('acct', p, Buffer.from('<html><script>alert(1)</script></html>'), 'x.html').expect(400);
      await upload('acct', p, Buffer.from('<html><script>alert(1)</script></html>'), 'x.pdf').expect(400); // extensión miente
      await upload('acct', p, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script/></svg>'), 'x.svg').expect(400);
      await upload('acct', p, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)]), 'virus.pdf').expect(400);
      await upload('acct', p, pdf(), 'doc.png').expect(400); // PDF real con extensión de imagen
      await upload('acct', p, png(), 'doc.pdf').expect(400);
      await upload('acct', p, pdf(), 'doc.pdf.html').expect(400);
      await upload('acct', p, pdf(), 'sinextension').expect(400);
      await upload('acct', p, Buffer.from([0x68, 0x00, 0x69]), 'binario.txt').expect(400); // NUL en un "txt"
      await upload('acct', p, Buffer.from([0xff, 0xfe, 0x41]), 'raro.csv').expect(400); // no es UTF-8
      await upload('acct', p, Buffer.from('PK\u0003\u0004zzz', 'latin1'), 'macro.xlsm').expect(400);
    });

    it('nada de lo rechazado dejó filas ni archivos', async () => {
      const rows = await prisma.attachment.count({ where: { companyId: companyA } });
      expect(rows).toBe(4); // pdf asiento, png factura, pdf pago, csv conciliación
      expect(filesOnDisk()).toBe(4);
    });

    it('archivo más grande que MAX_UPLOAD_MB: 413', async () => {
      await upload('acct', { journalEntryId: entryA }, Buffer.concat([pdf(), Buffer.alloc(1.2 * 1024 * 1024, 1)]), 'grande.pdf').expect(413);
      expect(filesOnDisk()).toBe(4);
    });

    it('el nombre se sanea: sin rutas, comillas ni caracteres de control, y conserva acentos', async () => {
      const r = await upload('acct', { journalEntryId: entryA }, pdf('n'), '../../etc/Pa ñ"ss.pdf').expect(201);
      expect(r.body.fileName).toBe('Pa ñ_ss.pdf');
      const d = await api('get', `/attachments/${r.body.id}/download`, 'view').expect(200);
      expect(d.headers['content-disposition']).toBe(`attachment; filename="Pa __ss.pdf"; filename*=UTF-8''Pa%20%C3%B1_ss.pdf`);
      await api('delete', `/attachments/${r.body.id}`, 'admin').expect(200);
    });

    it(`máximo ${MAX_ATTACHMENTS_PER_PARENT} por documento`, async () => {
      const e = await entry('acct', '2031-03-11');
      await prisma.attachment.createMany({
        data: Array.from({ length: MAX_ATTACHMENTS_PER_PARENT }, (_, i) => ({
          companyId: companyA, journalEntryId: e, fileName: `f${i}.pdf`, fileUrl: `${companyA}/relleno-${i}`, mimeType: 'application/pdf',
        })),
      });
      await upload('acct', { journalEntryId: e }, pdf(), 'otro.pdf').expect(422);
      expect(filesOnDisk()).toBe(4);
    });
  });

  describe('listar y descargar', () => {
    it('lista solo los del documento pedido, sin exponer la ruta', async () => {
      const r = await api('get', `/attachments?journalEntryId=${entryA}`, 'view').expect(200);
      expect(r.body).toHaveLength(1);
      expect(r.body[0]).toMatchObject({ id: att.id, fileName: 'Factura 001.pdf' });
      expect(r.body[0].fileUrl).toBeUndefined();
      await api('get', `/attachments?invoiceId=${invoiceA}`, 'view').expect(200).then((x) => expect(x.body).toHaveLength(1));
      await api('get', '/attachments', 'view').expect(400);
    });

    it('descarga los mismos bytes, como attachment y sin sniffing', async () => {
      const r = await api('get', `/attachments/${att.id}/download`, 'view').buffer(true).parse((res, cb) => {
        const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c)));
      }).expect(200);
      expect(Buffer.compare(r.body as Buffer, pdf('contenido-1'))).toBe(0);
      expect(r.headers['content-type']).toBe('application/pdf');
      expect(r.headers['content-disposition']).toMatch(/^attachment; filename="Factura 001.pdf"/);
      expect(r.headers['x-content-type-options']).toBe('nosniff');
    });

    it('metadatos por id; id inválido 400; inexistente 404', async () => {
      await api('get', `/attachments/${att.id}`, 'view').expect(200).then((r) => expect(r.body.id).toBe(att.id));
      await api('get', '/attachments/no-uuid', 'view').expect(400);
      await api('get', '/attachments/00000000-0000-4000-8000-000000000000', 'view').expect(404);
    });

    it('otra empresa: 404 en listar, ver, descargar y borrar', async () => {
      await api('get', `/attachments?journalEntryId=${entryA}`, 'adminb').expect(404);
      await api('get', `/attachments/${att.id}`, 'adminb').expect(404);
      await api('get', `/attachments/${att.id}/download`, 'adminb').expect(404);
      await api('delete', `/attachments/${att.id}`, 'adminb').expect(404);
      expect(await prisma.attachment.count({ where: { id: att.id } })).toBe(1);
    });

    it('si el archivo desapareció del almacenamiento: 404 claro, no 500', async () => {
      const row = await prisma.attachment.create({ data: { companyId: companyA, invoiceId: invoiceA, fileName: 'perdido.pdf', fileUrl: `${companyA}/no-existe`, mimeType: 'application/pdf' } });
      await api('get', `/attachments/${row.id}/download`, 'view').expect(404);
      await prisma.attachment.delete({ where: { id: row.id } });
    });
  });

  describe('borrar', () => {
    it('solo ADMIN o quien lo subió; el VIEWER no', async () => {
      await api('delete', `/attachments/${att.id}`, 'acct2').expect(403);
      await api('delete', `/attachments/${att.id}`, 'view').expect(403);
      expect(await prisma.attachment.count({ where: { id: att.id } })).toBe(1);
    });

    it('quien lo subió lo borra: fila y archivo desaparecen y queda auditoría', async () => {
      const r = await upload('acct', { journalEntryId: entryA }, pdf('borrar'), 'tmp.pdf').expect(201);
      const before = filesOnDisk();
      await api('delete', `/attachments/${r.body.id}`, 'acct').expect(200).then((x) => expect(x.body).toEqual({ deleted: true }));
      expect(filesOnDisk()).toBe(before - 1);
      expect(await prisma.attachment.count({ where: { id: r.body.id } })).toBe(0);
      const audit = await prisma.auditLog.findMany({ where: { entityId: r.body.id }, orderBy: { createdAt: 'asc' } });
      expect(audit.map((a) => a.action)).toEqual(['CREATE', 'DELETE']);
      await api('delete', `/attachments/${r.body.id}`, 'acct').expect(404);
    });

    it('dos borrados simultáneos: uno gana, el otro 404', async () => {
      const r = await upload('acct', { journalEntryId: entryA }, pdf('race'), 'race.pdf').expect(201);
      const res = await Promise.all([api('delete', `/attachments/${r.body.id}`, 'admin'), api('delete', `/attachments/${r.body.id}`, 'admin')]);
      expect(res.map((x) => x.status).sort()).toEqual([200, 404]);
      expect(await prisma.auditLog.count({ where: { entityId: r.body.id, action: 'DELETE' } })).toBe(1);
    });

    it('período fiscal cerrado: no se puede quitar el soporte (422) y el archivo sigue', async () => {
      const e = await entry('acct', '2031-05-10');
      const r = await upload('acct', { journalEntryId: e }, pdf('cerrado'), 'cerrado.pdf').expect(201);
      const period = await prisma.fiscalPeriod.create({
        data: { companyId: companyA, name: 'Mayo 2031', startDate: new Date('2031-05-01'), endDate: new Date('2031-05-31T23:59:59Z'), status: FiscalPeriodStatus.CLOSED },
      });
      const before = filesOnDisk();
      await api('delete', `/attachments/${r.body.id}`, 'admin').expect(422);
      expect(filesOnDisk()).toBe(before);
      expect(await prisma.attachment.count({ where: { id: r.body.id } })).toBe(1);
      await prisma.fiscalPeriod.update({ where: { id: period.id }, data: { status: FiscalPeriodStatus.OPEN } });
      await api('delete', `/attachments/${r.body.id}`, 'admin').expect(200);
    });

    it('año fiscal cerrado también bloquea', async () => {
      const e = await entry('acct', '2032-02-10');
      const r = await upload('acct', { journalEntryId: e }, pdf('anio'), 'anio.pdf').expect(201);
      const year = await prisma.fiscalYear.create({
        data: { companyId: companyA, name: '2032', startDate: new Date('2032-01-01'), endDate: new Date('2032-12-31T23:59:59Z'), status: FiscalPeriodStatus.CLOSED },
      });
      await api('delete', `/attachments/${r.body.id}`, 'admin').expect(422);
      await prisma.fiscalYear.update({ where: { id: year.id }, data: { status: FiscalPeriodStatus.OPEN } });
      await api('delete', `/attachments/${r.body.id}`, 'admin').expect(200);
    });

    it('conciliación completada: bloquea el borrado', async () => {
      const list = (await api('get', `/attachments?reconciliationId=${reconA}`, 'view').expect(200)).body;
      await prisma.bankReconciliation.update({ where: { id: reconA }, data: { status: 'COMPLETED' } });
      await api('delete', `/attachments/${list[0].id}`, 'admin').expect(422);
      await prisma.bankReconciliation.update({ where: { id: reconA }, data: { status: 'DRAFT' } });
      await api('delete', `/attachments/${list[0].id}`, 'admin').expect(200);
    });
  });

  describe('integridad (almacenamiento y BD)', () => {
    const fakeParent = { findFirst: async () => ({ date: new Date('2031-01-01'), issueDate: new Date(), status: 'DRAFT' }) };
    const mkService = (opts: { txFails?: boolean }) => {
      const calls: string[] = [];
      const storage = {
        save: async (k: string) => void calls.push(`save:${k.split('/')[0]}`),
        read: async () => Buffer.alloc(0),
        remove: async () => { calls.push('remove'); throw new Error('disco caído'); },
      };
      const row = { id: 'x', journalEntryId: 'e', invoiceId: null, paymentId: null, reconciliationId: null, fileUrl: 'c/k', fileName: 'a.pdf', uploadedById: 'u' };
      const tx = {
        attachment: { findFirst: async () => row, deleteMany: async () => ({ count: 1 }), create: async () => row },
        journalEntry: fakeParent, fiscalPeriod: { findFirst: async () => null }, fiscalYear: { findFirst: async () => null }, auditLog: { create: async () => { calls.push('audit'); return {}; } },
      };
      const prismaFake = {
        ...tx,
        attachment: { ...tx.attachment, count: async () => 0 },
        $transaction: async (fn: (t: unknown) => unknown) => {
          if (opts.txFails) { calls.push('tx-fail'); throw new Error('BD caída'); }
          const out = await fn(tx);
          calls.push('tx-ok');
          return out;
        },
      };
      return { calls, tx, svc: new AttachmentsService(prismaFake as never, storage) };
    };
    const user = { id: 'u', email: 'a@b.c', role: UserRole.ADMIN, companyId: 'c' };
    const E = '11111111-1111-4111-8111-111111111111';

    it('si falla la BD después de guardar el archivo, el archivo se limpia (y el error original se propaga)', async () => {
      const { svc, calls } = mkService({ txFails: true });
      await expect(svc.upload({ originalname: 'a.pdf', size: 10, buffer: pdf() }, { journalEntryId: E }, user)).rejects.toThrow('BD caída');
      expect(calls).toEqual(['save:c', 'tx-fail', 'remove']);
    });

    it('al borrar, el archivo se elimina DESPUÉS de confirmar la BD y un fallo del disco no tumba la respuesta', async () => {
      const { svc, calls } = mkService({});
      await expect(svc.remove(E, user)).resolves.toEqual({ deleted: true });
      expect(calls).toEqual(['audit', 'tx-ok', 'remove']);
    });

    it('si el borrado condicional no afecta ninguna fila (otro lo borró primero): 404, sin auditoría ni tocar el archivo', async () => {
      const { svc, calls, tx } = mkService({});
      tx.attachment.deleteMany = async () => ({ count: 0 });
      await expect(svc.remove(E, user)).rejects.toThrow('Adjunto no encontrado');
      expect(calls).toEqual([]);
    });

    it('si falla la BD al borrar, el archivo NO se toca', async () => {
      const { svc, calls } = mkService({ txFails: true });
      await expect(svc.remove(E, user)).rejects.toThrow('BD caída');
      expect(calls).toEqual(['tx-fail']);
    });

    it('el almacenamiento local no sale de su carpeta ni pisa archivos', async () => {
      const storage = new LocalFileStorage({ get: () => UPLOADS } as unknown as ConfigService);
      await expect(storage.save('../fuera', Buffer.from('x'))).rejects.toThrow('inválida');
      await expect(storage.save('/etc/passwd', Buffer.from('x'))).rejects.toThrow();
      await expect(storage.read('../../etc/passwd')).rejects.toThrow('inválida');
      await storage.save(`${companyB}/unico`, Buffer.from('1'));
      await expect(storage.save(`${companyB}/unico`, Buffer.from('2'))).rejects.toThrow();
      expect((await storage.read(`${companyB}/unico`)).toString()).toBe('1');
      await storage.remove(`${companyB}/unico`);
      await storage.remove(`${companyB}/unico`); // idempotente
    });
  });
});
