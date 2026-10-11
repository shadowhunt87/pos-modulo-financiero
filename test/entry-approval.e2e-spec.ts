import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/** Aprobación de asientos manuales (borrador -> aprobar/rechazar). Requiere BD con migraciones. */
describe('Aprobación de asientos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `ap-${r}-${sfx}@test.local`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const uid: Record<string, string> = {};
  const acc: Record<string, string> = {};

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const entry = (amount: number, over: Record<string, unknown> = {}) => ({
    date: '2030-03-10', description: 'Aporte', lines: [{ accountId: acc.caja, debit: amount }, { accountId: acc.capital, credit: amount }], ...over,
  });
  const create = async (who: string, amount = 1000, over = {}) => (await api('post', '/accounting/journal-entries', who).send(entry(amount, over)).expect(201)).body;
  const cajaDebit = async () => {
    const tb = (await api('get', '/accounting/trial-balance', 'view').expect(200)).body;
    const l = tb.lines.find((x: { code: string }) => x.code === '1101');
    return l ? Number(l.debit) : 0;
  };
  const get = async (id: string) => (await api('get', `/accounting/journal-entries/${id}`, 'view').expect(200)).body;
  const setApproval = (on: boolean) => api('put', '/settings/accounting', 'admin').send({ requireEntryApproval: on }).expect(200);

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `AP A ${sfx}`, taxId: `5${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '1')}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `AP B ${sfx}`, taxId: `4${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '2')}` } })).id;
    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['acct2', UserRole.ACCOUNTANT, companyA],
      ['appr', UserRole.APPROVER, companyA], ['appr2', UserRole.APPROVER, companyA], ['view', UserRole.VIEWER, companyA],
      ['adminb', UserRole.ADMIN, companyB],
    ];
    for (const [r, role, companyId] of users) {
      uid[r] = (await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } })).id;
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    acc.caja = (await prisma.account.create({ data: { companyId: companyA, code: '1101', name: 'Caja', type: 'ASSET' } })).id;
    acc.capital = (await prisma.account.create({ data: { companyId: companyA, code: '3101', name: 'Capital', type: 'EQUITY' } })).id;
    await api('post', '/journals/defaults', 'admin').expect(201);
  }, 60000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.auditLog.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.fiscalPeriod.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.accountingSettings.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  it('sin aprobación (por defecto) el asiento manual se contabiliza al instante, con número', async () => {
    const e = await create('acct', 100);
    expect(e.status).toBe('POSTED');
    expect(e.number).toMatch(/^DG-\d{6}$/);
    expect(e.postedAt).not.toBeNull();
    expect(await cajaDebit()).toBe(100);
    expect((await api('get', '/settings/accounting', 'view').expect(200)).body.requireEntryApproval).toBe(false);
  });

  it('solo ADMIN activa la aprobación', async () => {
    await api('put', '/settings/accounting', 'acct').send({ requireEntryApproval: true }).expect(403);
    await api('put', '/settings/accounting', 'admin').send({ requireEntryApproval: 'si' }).expect(400);
    await setApproval(true);
    expect((await api('get', '/settings/accounting', 'view').expect(200)).body.requireEntryApproval).toBe(true);
  });

  let e1: { id: string };
  it('con aprobación activa el asiento queda en borrador: sin número y fuera de libros y reportes', async () => {
    e1 = await create('acct', 1000);
    const g = await get(e1.id);
    expect(g).toMatchObject({ status: 'DRAFT', number: null, postedAt: null, approvedById: null });
    expect(await cajaDebit()).toBe(100); // sigue igual
    const list = (await api('get', '/accounting/journal-entries?status=DRAFT', 'view').expect(200)).body;
    expect(list.data.map((x: { id: string }) => x.id)).toContain(e1.id);
    const bs = (await api('get', '/reports/balance-sheet?asOf=2030-12-31', 'view').expect(200)).body;
    expect(Number(bs.totalAssets)).toBe(100); // el borrador de 1,000 no cuenta
  });

  it('un borrador no se anula (se rechaza); VIEWER no crea ni aprueba', async () => {
    await api('post', `/accounting/journal-entries/${e1.id}/void`, 'appr').send({ reason: 'x' }).expect(422);
    await api('post', '/accounting/journal-entries', 'view').send(entry(5)).expect(403);
    await api('post', `/accounting/journal-entries/${e1.id}/approve`, 'view').expect(403);
    await api('post', `/accounting/journal-entries/${e1.id}/approve`, 'acct').expect(403);
  });

  it('nadie aprueba lo que creó (ni el ADMIN)', async () => {
    const own = await create('admin', 50);
    await api('post', `/accounting/journal-entries/${own.id}/approve`, 'admin').expect(403);
    expect((await get(own.id)).status).toBe('DRAFT');
    // pero otro aprobador sí
    await api('post', `/accounting/journal-entries/${own.id}/approve`, 'appr').expect(201);
    expect(await cajaDebit()).toBe(150);
  });

  it('aprobar: contabiliza, asigna número, período y aprobador; entra a los libros', async () => {
    const res = await api('post', `/accounting/journal-entries/${e1.id}/approve`, 'appr').expect(201);
    expect(res.body).toMatchObject({ status: 'POSTED', approvedById: uid.appr });
    expect(res.body.number).toMatch(/^DG-\d{6}$/);
    expect(res.body.approvedAt).not.toBeNull();
    expect(res.body.postedAt).not.toBeNull();
    expect(await cajaDebit()).toBe(1150);
    await api('post', `/accounting/journal-entries/${e1.id}/approve`, 'appr2').expect(409);
    await api('post', `/accounting/journal-entries/${e1.id}/reject`, 'appr2').send({ reason: 'tarde' }).expect(409);
    const logs = await prisma.auditLog.findMany({ where: { entityId: e1.id, action: 'APPROVE' } });
    expect(logs).toHaveLength(1);
  });

  it('dos aprobadores a la vez: gana uno, el otro recibe 409, y el número se consume una sola vez', async () => {
    const d = await create('acct', 7);
    const before = (await prisma.journal.findFirst({ where: { companyId: companyA, type: 'GENERAL' } }))!.nextNumber;
    const [r1, r2] = await Promise.all([
      api('post', `/accounting/journal-entries/${d.id}/approve`, 'appr'),
      api('post', `/accounting/journal-entries/${d.id}/approve`, 'appr2'),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([201, 409]);
    const after = (await prisma.journal.findFirst({ where: { companyId: companyA, type: 'GENERAL' } }))!.nextNumber;
    expect(after - before).toBe(1);
    expect(await cajaDebit()).toBe(1157);
  });

  it('aprobar y rechazar a la vez: solo una de las dos acciones prospera', async () => {
    const d = await create('acct', 3);
    const [a, r] = await Promise.all([
      api('post', `/accounting/journal-entries/${d.id}/approve`, 'appr'),
      api('post', `/accounting/journal-entries/${d.id}/reject`, 'appr2').send({ reason: 'no' }),
    ]);
    expect([a.status, r.status].sort()).toEqual([201, 409]);
    const g = await get(d.id);
    expect(g.status).toBe(a.status === 201 ? 'POSTED' : 'REJECTED');
    expect(await cajaDebit()).toBe(a.status === 201 ? 1160 : 1157);
  });

  describe('rechazo y corrección', () => {
    let e2: { id: string };
    it('rechazar exige motivo; el asiento queda fuera de los libros y sin poder aprobarse ni anularse', async () => {
      e2 = await create('acct', 500);
      const before = await cajaDebit();
      await api('post', `/accounting/journal-entries/${e2.id}/reject`, 'appr').send({}).expect(400);
      const res = await api('post', `/accounting/journal-entries/${e2.id}/reject`, 'appr').send({ reason: 'Monto incorrecto' }).expect(201);
      expect(res.body).toMatchObject({ status: 'REJECTED', rejectReason: 'Monto incorrecto' });
      expect(res.body.rejectedAt).not.toBeNull();
      expect(await cajaDebit()).toBe(before);
      await api('post', `/accounting/journal-entries/${e2.id}/approve`, 'appr').expect(409);
      await api('post', `/accounting/journal-entries/${e2.id}/void`, 'appr').send({ reason: 'x' }).expect(422);
      expect(await prisma.auditLog.count({ where: { entityId: e2.id, action: 'REJECT' } })).toBe(1);
    });

    it('un contador solo retira lo suyo; ADMIN y aprobador rechazan cualquiera', async () => {
      const d = await create('acct', 9);
      await api('post', `/accounting/journal-entries/${d.id}/reject`, 'acct2').send({ reason: 'x' }).expect(403);
      await api('post', `/accounting/journal-entries/${d.id}/reject`, 'acct').send({ reason: 'lo retiro' }).expect(201);
      const d2 = await create('acct', 9);
      await api('post', `/accounting/journal-entries/${d2.id}/reject`, 'admin').send({ reason: 'x' }).expect(201);
    });

    it('corregir un rechazado lo devuelve a pendiente, sin el motivo, y al aprobarlo entra con los montos nuevos', async () => {
      await api('patch', `/accounting/journal-entries/${e2.id}`, 'acct2').send({ description: 'x' }).expect(403); // ajeno
      await api('patch', `/accounting/journal-entries/${e2.id}`, 'appr').send({ description: 'x' }).expect(403); // rol
      await api('patch', `/accounting/journal-entries/${e2.id}`, 'acct').send({
        lines: [{ accountId: acc.caja, debit: 40 }, { accountId: acc.capital, credit: 41 }],
      }).expect(422); // descuadrado
      const upd = await api('patch', `/accounting/journal-entries/${e2.id}`, 'acct').send({
        description: 'Aporte corregido', lines: [{ accountId: acc.caja, debit: 400 }, { accountId: acc.capital, credit: 400 }],
      }).expect(200);
      expect(upd.body).toMatchObject({ status: 'DRAFT', rejectReason: null, rejectedAt: null, description: 'Aporte corregido' });
      expect(upd.body.lines).toHaveLength(2);
      const before = await cajaDebit();
      await api('post', `/accounting/journal-entries/${e2.id}/approve`, 'appr').expect(201);
      expect(await cajaDebit()).toBe(before + 400);
    });

    it('editar sin enviar líneas conserva las existentes; un asiento contabilizado no se edita; el ADMIN sí edita ajenos', async () => {
      const d = await create('acct', 60);
      const r = await api('patch', `/accounting/journal-entries/${d.id}`, 'admin').send({ reference: 'REF-1' }).expect(200);
      expect(r.body.reference).toBe('REF-1');
      expect(r.body.lines).toHaveLength(2);
      await api('post', `/accounting/journal-entries/${d.id}/approve`, 'appr').expect(201);
      await api('patch', `/accounting/journal-entries/${d.id}`, 'admin').send({ reference: 'X' }).expect(422);
    });
  });

  describe('revalidación al aprobar', () => {
    it('si la cuenta se desactiva después de crear el borrador, no se puede aprobar', async () => {
      const d = await create('acct', 11);
      await api('patch', `/accounting/accounts/${acc.capital}`, 'admin').send({ active: false }).expect(200);
      await api('post', `/accounting/journal-entries/${d.id}/approve`, 'appr').expect(422);
      expect((await get(d.id)).status).toBe('DRAFT');
      await api('patch', `/accounting/accounts/${acc.capital}`, 'admin').send({ active: true }).expect(200);
      await api('post', `/accounting/journal-entries/${d.id}/approve`, 'appr').expect(201);
    });

    it('si el período se cierra después de crear el borrador (p. ej. por otra vía), no se puede aprobar', async () => {
      const d = await create('acct', 33, { date: '2032-05-10' });
      const p = await prisma.fiscalPeriod.create({
        data: { companyId: companyA, name: 'May 2032', startDate: new Date('2032-05-01'), endDate: new Date('2032-05-31T23:59:59.999Z'), status: 'CLOSED' },
      });
      await api('post', `/accounting/journal-entries/${d.id}/approve`, 'appr').expect(422);
      expect((await get(d.id)).status).toBe('DRAFT');
      await prisma.fiscalPeriod.update({ where: { id: p.id }, data: { status: 'OPEN' } });
      await api('post', `/accounting/journal-entries/${d.id}/approve`, 'appr').expect(201);
    });

    it('no se cierra un período con borradores pendientes; al resolverlos sí', async () => {
      const p = (await api('post', '/accounting/fiscal-periods', 'admin').send({ name: 'Mar 2031', startDate: '2031-03-01', endDate: '2031-03-31' }).expect(201)).body;
      const d = await create('acct', 22, { date: '2031-03-15' });
      await api('post', `/accounting/fiscal-periods/${p.id}/close`, 'admin').expect(422);
      await api('post', `/accounting/journal-entries/${d.id}/approve`, 'appr').expect(201);
      expect((await get(d.id)).fiscalPeriodId).toBe(p.id);
      await api('post', `/accounting/fiscal-periods/${p.id}/close`, 'admin').expect(201);
      // y en un período cerrado ya no se crean borradores
      await api('post', '/accounting/journal-entries', 'acct').send(entry(5, { date: '2031-03-20' })).expect(422);
    });
  });

  it('otra empresa no ve, aprueba, rechaza ni edita (404)', async () => {
    const d = await create('acct', 13);
    await api('post', `/accounting/journal-entries/${d.id}/approve`, 'adminb').expect(404);
    await api('post', `/accounting/journal-entries/${d.id}/reject`, 'adminb').send({ reason: 'x' }).expect(404);
    await api('patch', `/accounting/journal-entries/${d.id}`, 'adminb').send({ description: 'x' }).expect(404);
    await api('get', `/accounting/journal-entries/${d.id}`, 'adminb').expect(404);
    expect((await get(d.id)).status).toBe('DRAFT');
  });

  it('apagar la aprobación vuelve a contabilizar al instante y no toca los borradores ya creados', async () => {
    const pending = await create('acct', 17);
    await setApproval(false);
    const e = await create('acct', 5);
    expect(e.status).toBe('POSTED');
    expect((await get(pending.id)).status).toBe('DRAFT');
    await api('post', `/accounting/journal-entries/${pending.id}/approve`, 'appr').expect(201);
  });

  it('un asiento contabilizado se sigue anulando como antes', async () => {
    const e = await create('acct', 4);
    const before = await cajaDebit();
    await api('post', `/accounting/journal-entries/${e.id}/void`, 'appr').send({ reason: 'error' }).expect(201);
    expect(await cajaDebit()).toBe(before - 4);
    await api('post', `/accounting/journal-entries/${e.id}/void`, 'appr').send({ reason: 'otra' }).expect(409);
  });
});
