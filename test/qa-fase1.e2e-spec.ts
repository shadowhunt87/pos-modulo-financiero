import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
// Bitácora del ataque: en la carpeta temporal del sistema (antes, una ruta fija de la máquina donde se escribió)
const out = (...a: unknown[]) => appendFileSync(join(tmpdir(), 'qa-fase1-out.txt'), a.map(String).join(' ') + '\n');
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

// QA Fase 1: pruebas de ataque (no corrigen nada; documentan el comportamiento real).
describe('QA Fase 1 (ataque)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `qa1-${r}-${sfx}@test.local`;
  let cA: string, cB: string;
  const token: Record<string, string> = {};
  const api = (m: 'get' | 'post' | 'patch', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const up = (url: string, who: string, data: Buffer, filename = 'x.csv') => api('post', url, who).attach('file', data, { filename });
  const H = 'Código de Cuenta,Nombre / Descripción de la Cuenta,Nivel,Tipo de Cuenta,Naturaleza';

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    cA = (await prisma.company.create({ data: { name: `QA1 A ${sfx}`, taxId: `QA-A-${sfx}` } })).id;
    cB = (await prisma.company.create({ data: { name: `QA1 B ${sfx}`, taxId: `QA-B-${sfx}` } })).id;
    for (const [r, role, companyId] of [['admin', UserRole.ADMIN, cA], ['view', UserRole.VIEWER, cA], ['adminb', UserRole.ADMIN, cB]] as const) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
  }, 60000);

  afterAll(async () => {
    const ids = [cA, cB];
    const where = { companyId: { in: ids } };
    await prisma.feedback.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.account.updateMany({ where, data: { parentId: null } });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('A1 CSV en Windows-1252 (Excel "CSV delimitado por comas") con ñ', async () => {
    const buf = Buffer.from(`Codigo,Nombre\r\n1,ACTIVO\r\n1101,Caja Peque\xf1a\r\n`, 'latin1');
    const r = await up('/chart-of-accounts/import', 'admin', buf);
    out('A1', r.status, JSON.stringify(r.body).slice(0, 300));
    const a = await prisma.account.findFirst({ where: { companyId: cA, code: '1101' } });
    out('A1 nombre guardado:', JSON.stringify(a?.name));
  });

  it('A2 nombre con byte nulo / caracteres de control en CSV', async () => {
    const buf = Buffer.from(`${H}\r\n6101,Gasto\u0000raro,,Detalle,\r\n`, 'utf8');
    const r = await up('/chart-of-accounts/import', 'admin', buf);
    out('A2', r.status, JSON.stringify(r.body).slice(0, 300));
  });

  it('A3 cuenta hija nueva bajo cuenta existente CON movimientos (queda sin poder asentarse)', async () => {
    const caja = await prisma.account.create({ data: { companyId: cB, code: '1101', name: 'Caja B', type: 'ASSET' } });
    const ven = await prisma.account.create({ data: { companyId: cB, code: '4101', name: 'Ventas B', type: 'INCOME' } });
    await api('post', '/accounting/journal-entries', 'adminb').send({ date: '2031-01-10', description: 'v1', lines: [{ accountId: caja.id, debit: 100 }, { accountId: ven.id, credit: 100 }] }).expect(201);
    const r = await up('/chart-of-accounts/import', 'adminb', Buffer.from(`${H}\r\n1101-01,Caja chica,,Detalle,\r\n`));
    out('A3 import', r.status, JSON.stringify(r.body.resumen));
    const e = await api('post', '/accounting/journal-entries', 'adminb').send({ date: '2031-01-11', description: 'v2', lines: [{ accountId: caja.id, debit: 50 }, { accountId: ven.id, credit: 50 }] });
    out('A3 asiento posterior a 1101:', e.status, JSON.stringify(e.body).slice(0, 200));
  });

  it('A4 padre explícito de otra empresa / de otro tipo / hija bajo cuenta inactiva', async () => {
    const buf = Buffer.from(`${H},Cuenta padre\r\n1101-09,X,,Detalle,,9999\r\n`);
    const r = await up('/chart-of-accounts/import/preview', 'admin', buf);
    out('A4', r.status, JSON.stringify(r.body.filas));
  });

  it('A5 importación concurrente del mismo archivo', async () => {
    const buf = Buffer.from(`${H}\r\n7,ISR,,Control,\r\n71,ISR x,,Detalle,\r\n`);
    const rs = await Promise.all([up('/chart-of-accounts/import', 'admin', buf), up('/chart-of-accounts/import', 'admin', buf), up('/chart-of-accounts/standard/rd', 'admin', Buffer.alloc(0)).catch((e) => ({ status: 'err' }))]);
    out('A5', rs.map((r: any) => r.status), await prisma.account.count({ where: { companyId: cA, code: { in: ['7', '71'] } } }));
  });

  it('A6 5.000 filas: tiempo de vista previa e importación', async () => {
    const lines = [H, '9,GRUPO,,Control,'];
    for (let i = 0; i < 4990; i++) lines.push(`9-${i},Cuenta ${i},,Detalle,`);
    const buf = Buffer.from(lines.join('\r\n'));
    // código tipo '9' no tiene tipo -> error; usar 1
    const buf2 = Buffer.from(lines.join('\r\n').replace(/^9/gm, '1').replace(/\n9/g, '\n1'));
    let t = Date.now();
    const p = await up('/chart-of-accounts/import/preview', 'admin', buf2);
    out('A6 preview', p.status, Date.now() - t, 'ms', JSON.stringify(p.body.resumen), 'bytes', JSON.stringify(p.body).length);
    t = Date.now();
    const r = await up('/chart-of-accounts/import', 'admin', buf2);
    out('A6 import', r.status, Date.now() - t, 'ms');
    // Segunda pasada cambiando todos los nombres (5000 updates)
    const buf3 = Buffer.from(buf2.toString().replace(/Cuenta /g, 'Cuenta nueva '));
    t = Date.now();
    const r3 = await up('/chart-of-accounts/import', 'admin', buf3);
    out('A6 update', r3.status, Date.now() - t, 'ms', JSON.stringify(r3.body.resumen));
  }, 120000);

  it('A7 feedback: byte nulo y control en mensaje/ruta', async () => {
    for (const body of [
      { kind: 'BROKEN', message: 'hola\u0000mundo', route: '/x' },
      { kind: 'BROKEN', message: 'ok', route: '/x\u0000y' },
      { kind: 'BROKEN', message: 'línea1\nlínea2 <script>alert(1)</script> ñandú 😀', route: '/x?y=1#z' },
    ]) {
      const r = await api('post', '/feedback', 'view').send(body);
      out('A7', r.status, JSON.stringify(r.body).slice(0, 160));
    }
    const r = await api('post', '/feedback', 'view').send({ kind: 'BROKEN', message: 'ok', route: '/ok' }).set('User-Agent', 'x'.repeat(5000));
    out('A7 ua largo', r.status);
  });

  it('A8 feedback: PATCH con byte nulo; petición sin sesión a import', async () => {
    const f = await api('post', '/feedback', 'view').send({ kind: 'IDEA', message: 'ok', route: '/ok' });
    const r = await api('patch', `/feedback/${f.body.id}`, 'admin').send({ response: 'a\u0000b' });
    out('A8 patch', r.status, JSON.stringify(r.body).slice(0, 160));
    const s = await request(app.getHttpServer()).post('/chart-of-accounts/import').attach('file', Buffer.from('a'), 'a.csv');
    out('A8 sin sesión', s.status);
  });

  it('A9 padre existente con tipo distinto y existente con otro padre (catálogo RD sobre plan manual)', async () => {
    await prisma.account.create({ data: { companyId: cA, code: '2x', name: 'PASIVOS A', type: 'LIABILITY' } });
    await prisma.account.create({ data: { companyId: cA, code: '21x', name: 'Corrientes A', type: 'LIABILITY' } });
    const r = await api('get', '/chart-of-accounts/standard/rd/preview', 'admin');
    const bad = r.body.filas.filter((f: any) => f.accion === 'error').slice(0, 3);
    out('A9', JSON.stringify(r.body.resumen), JSON.stringify(bad));
  });

  it('A10 hoja xlsx con códigos numéricos', async () => {
    const ExcelJS = (await import('exceljs')).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('p');
    ws.addRow(['Código de Cuenta', 'Nombre']);
    ws.addRow([1102, 'Banco']);        // número
    ws.addRow([1102.1, 'Banco 1']);    // decimal -> "1102.1"
    ws.addRow(['1102.10', 'Banco 10']);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    const r = await up('/chart-of-accounts/import/preview', 'admin', buf, 'n.xlsx');
    out('A10', r.status, JSON.stringify(r.body.filas?.map((f: any) => [f.codigo, f.accion, f.padre])));
  });
});
