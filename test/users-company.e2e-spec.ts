import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { UsersService } from '../src/users/users.service.js';

/** Administración de usuarios y datos de la empresa. Requiere BD con migraciones. */
describe('Usuarios y empresa (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `uc-${r}-${sfx}@test.local`;
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
  let companyA: string, companyB: string, companyC: string, companyD: string, companyE: string;
  const token: Record<string, string> = {};
  const uid: Record<string, string> = {};

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const login = (e: string, p = password) => request(app.getHttpServer()).post('/auth/login').send({ email: e, password: p });
  const mkUser = async (r: string, role: UserRole, companyId: string) => {
    const u = await prisma.user.create({ data: { email: email(r), password: await bcrypt.hash(password, 4), name: `User ${r}`, role, companyId } });
    uid[r] = u.id;
    token[r] = (await login(email(r))).body.access_token;
  };

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    companyA = (await prisma.company.create({ data: { name: `UC A ${sfx}`, taxId: `9${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '1')}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `UC B ${sfx}`, taxId: `8${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '2')}` } })).id;
    companyC = (await prisma.company.create({ data: { name: `UC C ${sfx}`, taxId: `7${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '3')}` } })).id;
    companyD = (await prisma.company.create({ data: { name: `UC D ${sfx}`, taxId: `6${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '4')}` } })).id;
    companyE = (await prisma.company.create({ data: { name: `UC E ${sfx}`, taxId: `3${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '5')}` } })).id;
    await mkUser('e1', UserRole.ADMIN, companyE);
    await mkUser('e2', UserRole.ADMIN, companyE);
    await mkUser('e3', UserRole.VIEWER, companyE);
    await mkUser('admin', UserRole.ADMIN, companyA);
    await mkUser('d1', UserRole.ADMIN, companyD);
    await mkUser('acct', UserRole.ACCOUNTANT, companyA);
    await mkUser('acct2', UserRole.ACCOUNTANT, companyA);
    await mkUser('view', UserRole.VIEWER, companyA);
    await mkUser('adminb', UserRole.ADMIN, companyB);
    await mkUser('c1', UserRole.ADMIN, companyC);
    await mkUser('c2', UserRole.ADMIN, companyC);
    await mkUser('c3', UserRole.ADMIN, companyC);
  }, 60000);

  afterAll(async () => {
    const ids = [companyA, companyB, companyC, companyD, companyE].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.auditLog.deleteMany({ where });
    await prisma.fiscalYear.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('usuarios', () => {
    it('ADMIN lista solo su empresa y nunca ve el hash; los demás roles reciben 403', async () => {
      const res = await api('get', '/users', 'admin').expect(200);
      expect(res.body.total).toBe(4);
      expect(res.body.data.map((u: { email: string }) => u.email).sort()).toEqual(['acct', 'acct2', 'admin', 'view'].map(email).sort());
      for (const u of res.body.data) expect(u).not.toHaveProperty('password');
      expect((await api('get', '/users?role=VIEWER', 'admin').expect(200)).body.total).toBe(1);
      expect((await api('get', '/users?q=acct2', 'admin').expect(200)).body.total).toBe(1);
      expect((await api('get', '/users?active=false', 'admin').expect(200)).body.total).toBe(0);
      await api('get', '/users', 'acct').expect(403);
      await api('get', '/users', 'view').expect(403);
      await request(app.getHttpServer()).get('/users').expect(401);
    });

    it('get: propio 200 sin hash; de otra empresa 404', async () => {
      const r = await api('get', `/users/${uid.acct}`, 'admin').expect(200);
      expect(r.body).toMatchObject({ email: email('acct'), role: 'ACCOUNTANT', active: true });
      expect(r.body).not.toHaveProperty('password');
      await api('get', `/users/${uid.adminb}`, 'admin').expect(404);
      await api('get', '/users/no-es-uuid', 'admin').expect(400);
    });

    it('editar nombre y rol; email duplicado 409; otra empresa 404; datos inválidos 400', async () => {
      const r = await api('patch', `/users/${uid.acct2}`, 'admin').send({ name: 'Contadora Dos', role: 'APPROVER' }).expect(200);
      expect(r.body).toMatchObject({ name: 'Contadora Dos', role: 'APPROVER' });
    });

    it('el rol cambia de inmediato aunque el token sea el anterior', async () => {
      await api('patch', `/users/${uid.acct2}`, 'admin').send({ role: 'VIEWER' }).expect(200);
      await api('post', '/accounting/journal-entries', 'acct2').send({}).expect(403);
      await api('patch', `/users/${uid.acct2}`, 'admin').send({ role: 'ACCOUNTANT' }).expect(200);
    });

    it('email duplicado, otra empresa y datos inválidos', async () => {
      await api('patch', `/users/${uid.acct2}`, 'admin').send({ email: email('acct') }).expect(409);
      await api('patch', `/users/${uid.adminb}`, 'admin').send({ name: 'Hack' }).expect(404);
      await api('patch', `/users/${uid.acct2}`, 'admin').send({ role: 'SUPERUSER' }).expect(400);
      await api('patch', `/users/${uid.acct2}`, 'admin').send({ companyId: companyB }).expect(400);
      await api('patch', `/users/${uid.acct2}`, 'admin').send({ password: 'x' }).expect(400);
      await api('patch', `/users/${uid.acct2}`, 'acct').send({ name: 'x' }).expect(403);
      expect((await prisma.user.findUnique({ where: { id: uid.adminb } }))!.name).toBe('User adminb');
    });

    it('no puedes desactivarte a ti mismo; el único ADMIN no se degrada', async () => {
      await api('patch', `/users/${uid.admin}`, 'admin').send({ active: false }).expect(422);
      await api('patch', `/users/${uid.admin}`, 'admin').send({ role: 'VIEWER' }).expect(422);
      await api('patch', `/users/${uid.adminb}`, 'adminb').send({ role: 'ACCOUNTANT' }).expect(422);
      expect((await prisma.user.findUnique({ where: { id: uid.admin } }))!.role).toBe('ADMIN');
    });

    it('con otro admin disponible, igual no puedes desactivarte a ti mismo', async () => {
      await api('patch', `/users/${uid.e1}`, 'e1').send({ active: false }).expect(422);
      expect((await prisma.user.findUnique({ where: { id: uid.e1 } }))!.active).toBe(true);
    });

    it('el candado de admins es real: dos cambios simultáneos que se saltan el guard HTTP no vacían la empresa', async () => {
      const users = app.get(UsersService);
      const actor = (r: string) => ({ id: uid[r], email: email(r), role: UserRole.ADMIN, companyId: companyE });
      const rs = await Promise.allSettled([
        users.update(uid.e2, { role: UserRole.VIEWER }, actor('e1')),
        users.update(uid.e1, { role: UserRole.VIEWER }, actor('e2')),
      ]);
      expect(rs.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
      expect(rs.filter((r) => r.status === 'rejected')).toHaveLength(1);
      expect(await prisma.user.count({ where: { companyId: companyE, role: 'ADMIN', active: true } })).toBe(1);
    });

    it('el cambio de admins espera el candado de los ADMIN activos (no lee una foto vieja)', async () => {
      await prisma.user.updateMany({ where: { companyId: companyE }, data: { role: 'ADMIN', active: true } });
      // un tercer admin solo para tomar el candado: el UPDATE de e2 no lo toca, así que solo espera si el service pide el candado
      const users = app.get(UsersService);
      const actor = { id: uid.e1, email: email('e1'), role: UserRole.ADMIN, companyId: companyE };
      let finished = false;
      let pending: Promise<unknown> = Promise.resolve();
      await prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${uid.e3} FOR UPDATE`;
        pending = users.update(uid.e2, { role: UserRole.VIEWER }, actor).finally(() => { finished = true; });
        await sleep(500);
        expect(finished).toBe(false); // sigue esperando el candado
      });
      await pending;
      expect(finished).toBe(true);
      expect((await prisma.user.findUnique({ where: { id: uid.e2 } }))!.role).toBe('VIEWER');
    });

    it('tres admins que se degradan en círculo a la vez: la empresa siempre conserva un ADMIN', async () => {
      const rs = await Promise.all([
        api('patch', `/users/${uid.c2}`, 'c1').send({ role: 'VIEWER' }),
        api('patch', `/users/${uid.c3}`, 'c2').send({ role: 'VIEWER' }),
        api('patch', `/users/${uid.c1}`, 'c3').send({ role: 'VIEWER' }),
      ]);
      // los que llegan tarde ya no son ADMIN (403) o chocan con la regla del último admin (422)
      for (const r of rs) expect([200, 403, 422]).toContain(r.status);
      expect(rs.filter((r) => r.status === 200).length).toBeLessThanOrEqual(2);
      expect(await prisma.user.count({ where: { companyId: companyC, role: 'ADMIN', active: true } })).toBeGreaterThanOrEqual(1);
    });

    it('desactivar: el login y el token vigente dejan de servir al instante; reactivar los devuelve', async () => {
      await api('get', '/auth/me', 'acct2').expect(200);
      await api('patch', `/users/${uid.acct2}`, 'admin').send({ active: false }).expect(200);
      await api('get', '/auth/me', 'acct2').expect(401);
      await login(email('acct2')).expect(401);
      await api('patch', `/users/${uid.acct2}`, 'admin').send({ active: true }).expect(200);
      await api('get', '/auth/me', 'acct2').expect(200);
      await login(email('acct2')).expect(201);
    });

    it('reset de clave: la vieja y las sesiones abiertas dejan de servir', async () => {
      await sleep(1100); // el iat del JWT es en segundos
      await api('post', `/users/${uid.acct2}/reset-password`, 'acct').send({ password: 'Nueva-Clave-999' }).expect(403);
      await api('post', `/users/${uid.acct2}/reset-password`, 'admin').send({ password: 'corta' }).expect(400);
      await api('post', `/users/${uid.adminb}/reset-password`, 'admin').send({ password: 'Nueva-Clave-999' }).expect(404);
      await api('post', `/users/${uid.acct2}/reset-password`, 'admin').send({ password: 'Nueva-Clave-999' }).expect(201);
      await api('get', '/auth/me', 'acct2').expect(401);
      await login(email('acct2'), password).expect(401);
      const ok = await login(email('acct2'), 'Nueva-Clave-999').expect(201);
      token.acct2 = ok.body.access_token;
      await api('get', '/auth/me', 'acct2').expect(200);
    });

    it('cambiar la clave propia: valida la actual, devuelve token nuevo e invalida el anterior', async () => {
      await sleep(1100);
      await api('post', '/users/me/change-password', 'view').send({ currentPassword: 'mala', newPassword: 'Otra-Clave-12345' }).expect(401);
      await api('post', '/users/me/change-password', 'view').send({ currentPassword: password, newPassword: password }).expect(422);
      await api('post', '/users/me/change-password', 'view').send({ currentPassword: password, newPassword: 'corta' }).expect(400);
      const old = token.view;
      const res = await api('post', '/users/me/change-password', 'view').send({ currentPassword: password, newPassword: 'Otra-Clave-12345' }).expect(201);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.user).not.toHaveProperty('password');
      token.view = res.body.access_token;
      await request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${old}`).expect(401);
      await api('get', '/auth/me', 'view').expect(200);
      await login(email('view'), password).expect(401);
      await login(email('view'), 'Otra-Clave-12345').expect(201);
    });

    it('perfil propio: cualquier rol cambia su nombre, pero no su rol', async () => {
      const r = await api('patch', '/users/me', 'view').send({ name: 'Solo Lectura' }).expect(200);
      expect(r.body.name).toBe('Solo Lectura');
      await api('patch', '/users/me', 'view').send({ name: 'X', role: 'ADMIN' }).expect(400);
      expect((await prisma.user.findUnique({ where: { id: uid.view } }))!.role).toBe('VIEWER');
    });

    it('el login registra lastLoginAt y todo cambio queda en auditoría', async () => {
      await login(email('acct')).expect(201);
      const u = await prisma.user.findUnique({ where: { id: uid.acct } });
      expect(u!.lastLoginAt).not.toBeNull();
      const logs = await prisma.auditLog.findMany({ where: { companyId: companyA, entityName: 'User', entityId: uid.acct2 } });
      expect(logs.length).toBeGreaterThanOrEqual(3);
      expect(JSON.stringify(logs)).not.toMatch(/Nueva-Clave|\$2[aby]\$/); // jamás claves ni hashes en la auditoría
    });
  });

  describe('empresa', () => {
    it('cualquier rol la consulta; solo ADMIN la edita', async () => {
      const r = await api('get', '/company', 'view').expect(200);
      expect(r.body).toMatchObject({ id: companyA, baseCurrency: 'DOP' });
      await api('patch', '/company', 'acct').send({ name: 'X' }).expect(403);
      await api('patch', '/company', 'view').send({ name: 'X' }).expect(403);
    });

    it('edita datos y normaliza el RNC (guiones fuera); la otra empresa no se toca', async () => {
      const r = await api('patch', '/company', 'admin')
        .send({ name: 'Mi Empresa SRL', legalName: 'Mi Empresa, S.R.L.', address: 'Calle 1', taxId: '1-31-00001-9', email: 'info@mi.com', logoUrl: 'https://mi.com/logo.png' })
        .expect(200);
      expect(r.body).toMatchObject({ name: 'Mi Empresa SRL', taxId: '131000019', address: 'Calle 1', logoUrl: 'https://mi.com/logo.png' });
      expect((await api('get', '/company', 'adminb').expect(200)).body.name).toBe(`UC B ${sfx}`);
      const r2 = await api('patch', '/company', 'admin').send({ address: null }).expect(200);
      expect(r2.body.address).toBeNull();
    });

    it('valida: RNC de 9 u 11 dígitos, URL http(s), moneda ISO, mes 1-12, sin campos ajenos', async () => {
      for (const bad of [{ taxId: '123' }, { taxId: 'ABC123456' }, { logoUrl: 'javascript:alert(1)' }, { baseCurrency: 'dop' }, { fiscalYearStartMonth: 13 }, { name: '' }, { active: false }, { country: 'US' }, { id: 'x' }]) {
        await api('patch', '/company', 'admin').send(bad).expect(400);
      }
    });

    it('RNC repetido de otra empresa: 409', async () => {
      const b = (await api('get', '/company', 'adminb').expect(200)).body.taxId;
      await api('patch', '/company', 'admin').send({ taxId: b }).expect(409);
    });

    it('moneda base y mes fiscal: se pueden cambiar mientras no haya asientos/años, y luego quedan fijos', async () => {
      // empresa C: todavía vacía
      await api('patch', '/company', 'd1').send({ baseCurrency: 'USD', fiscalYearStartMonth: 7 }).expect(200);
      await prisma.fiscalYear.create({ data: { companyId: companyD, name: 'FY', startDate: new Date('2030-07-01'), endDate: new Date('2031-06-30') } });
      await api('patch', '/company', 'd1').send({ fiscalYearStartMonth: 1 }).expect(422);
      await api('patch', '/company', 'd1').send({ fiscalYearStartMonth: 7, baseCurrency: 'USD' }).expect(200); // mismo valor: no es un cambio

      // empresa A: con un asiento ya no se cambia la moneda
      const acc = await prisma.account.create({ data: { companyId: companyA, code: '1', name: 'Caja', type: 'ASSET' } });
      const acc2 = await prisma.account.create({ data: { companyId: companyA, code: '2', name: 'Cap', type: 'EQUITY' } });
      await api('post', '/accounting/journal-entries', 'admin').send({
        date: '2030-01-10', description: 'x', lines: [{ accountId: acc.id, debit: 10 }, { accountId: acc2.id, credit: 10 }],
      }).expect(201);
      await api('patch', '/company', 'admin').send({ baseCurrency: 'USD' }).expect(422);
      expect((await api('get', '/company', 'admin').expect(200)).body.baseCurrency).toBe('DOP');
    });

    it('los cambios quedan auditados con el antes y el después', async () => {
      const log = await prisma.auditLog.findFirst({ where: { companyId: companyA, entityName: 'Company' }, orderBy: { createdAt: 'asc' } });
      expect(JSON.stringify(log!.changes)).toContain('Mi Empresa SRL');
    });
  });
});
