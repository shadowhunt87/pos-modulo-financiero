import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * "Enviar comentario": todos los roles envían y ven los suyos; solo el ADMIN ve y gestiona
 * los de su empresa. Límites: 2.000 caracteres y 20 comentarios por usuario por hora.
 * Dos empresas (A y B) para comprobar el aislamiento.
 */
describe('Comentarios (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `fb-${r}-${sfx}@test.local`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const userId: Record<string, string> = {};

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const send = (who: string, body: Record<string, unknown> = {}) =>
    api('post', '/feedback', who).send({ kind: 'CONFUSING', message: 'No encontré dónde crear un cliente', route: '/sales/invoices/new', ...body });

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `FB A ${sfx}`, taxId: `2${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '3')}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `FB B ${sfx}`, taxId: `1${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '4')}` } })).id;
    const users = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['appr', UserRole.APPROVER, companyA],
      ['view', UserRole.VIEWER, companyA], ['spam', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
      ['viewb', UserRole.VIEWER, companyB],
    ] as const;
    for (const [r, role, companyId] of users) {
      userId[r] = (await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } })).id;
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
  }, 60000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.feedback.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  // ------------------------------------------------------------------
  describe('Enviar', () => {
    it('los 4 roles de hoy pueden enviar; empresa, usuario, fecha y navegador los pone el servidor', async () => {
      for (const who of ['admin', 'acct', 'appr', 'view', 'adminb']) {
        const res = await send(who, { message: `Comentario de ${who}` }).set('User-Agent', `Navegador-${who}`).expect(201);
        expect(res.body).toMatchObject({ kind: 'CONFUSING', status: 'NEW', route: '/sales/invoices/new', response: null, taskRef: null });
        expect(res.body).not.toHaveProperty('userAgent'); // quien lo envía no necesita verlo de vuelta
        const row = await prisma.feedback.findUniqueOrThrow({ where: { id: res.body.id } });
        expect(row.userId).toBe(userId[who]);
        expect(row.companyId).toBe(who === 'adminb' ? companyB : companyA);
        expect(row.userAgent).toBe(`Navegador-${who}`);
      }
    });

    it('queda en la bitácora sin copiar el texto', async () => {
      const res = await send('acct', { kind: 'BROKEN', message: 'Texto que no debe ir a la bitácora' }).expect(201);
      const log = await prisma.auditLog.findFirstOrThrow({ where: { entityName: 'Feedback', entityId: res.body.id } });
      expect(log).toMatchObject({ action: 'CREATE', userId: userId.acct, companyId: companyA });
      expect(JSON.stringify(log.changes)).not.toContain('bitácora');
    });

    it('el texto se guarda tal cual (sin recortar ni escapar): el escape es al mostrarlo', async () => {
      const message = '  <script>alert("x")</script> & "comillas"\nsegunda línea  ';
      const res = await send('view', { kind: 'IDEA', message }).expect(201);
      expect(res.body.message).toBe(message);
    });

    it('2.000 caracteres sí; 2.001 no (400)', async () => {
      await send('acct', { message: 'a'.repeat(2000) }).expect(201);
      await send('acct', { message: 'a'.repeat(2001) }).expect(400);
    });

    it('validaciones: mensaje vacío o solo espacios, tipo inválido, ruta larga o sin "/", campos faltantes', async () => {
      await send('acct', { message: '' }).expect(400);
      await send('acct', { message: '   \n ' }).expect(400);
      await send('acct', { kind: 'OTRO' }).expect(400);
      await send('acct', { route: '/' + 'x'.repeat(200) }).expect(400);
      await send('acct', { route: 'sales' }).expect(400);
      await api('post', '/feedback', 'acct').send({ kind: 'IDEA', route: '/x' }).expect(400);
      await api('post', '/feedback', 'acct').send({ kind: 'IDEA', message: 'Hola' }).expect(400);
    });

    it('no se puede colar empresa, usuario, estado ni respuesta por el body (400)', async () => {
      for (const extra of [{ companyId: companyB }, { userId: userId.admin }, { status: 'DONE' }, { response: 'x' }, { userAgent: 'x' }]) {
        await send('view', extra).expect(400);
      }
    });

    it('sin token: 401', async () => {
      await request(app.getHttpServer()).post('/feedback').send({ kind: 'IDEA', message: 'x', route: '/' }).expect(401);
      await request(app.getHttpServer()).get('/feedback/mine').expect(401);
    });
  });

  // ------------------------------------------------------------------
  describe('Límite por hora', () => {
    it('20 por usuario por hora: el 21.º da 429 y los demás usuarios no se ven afectados', async () => {
      for (let i = 1; i <= 20; i++) await send('spam', { message: `n.º ${i}` }).expect(201);
      const res = await send('spam', { message: 'n.º 21' }).expect(429);
      expect(res.body.message).toMatch(/20 comentarios en la última hora/);
      await send('view', { message: 'otro usuario sigue pudiendo' }).expect(201);
    });

    it('10 envíos simultáneos con 5 cupos libres: entran exactamente 5', async () => {
      // Se "envejecen" 5 de los 20 para dejar 5 libres y se mandan 10 a la vez
      const old = await prisma.feedback.findMany({ where: { userId: userId.spam }, select: { id: true }, take: 5 });
      await prisma.feedback.updateMany({
        where: { id: { in: old.map((o) => o.id) } }, data: { createdAt: new Date(Date.now() - 61 * 60_000) },
      });
      const results = await Promise.all(Array.from({ length: 10 }, (_, i) => send('spam', { message: `simultáneo ${i}` })));
      const codes = results.map((r) => r.status);
      expect(codes.filter((c) => c === 201)).toHaveLength(5);
      expect(codes.filter((c) => c === 429)).toHaveLength(5);
    });

    it('los de hace más de una hora no cuentan', async () => {
      await prisma.feedback.updateMany({ where: { userId: userId.spam }, data: { createdAt: new Date(Date.now() - 61 * 60_000) } });
      await send('spam', { message: 'pasada la hora' }).expect(201);
    });
  });

  // ------------------------------------------------------------------
  describe('Mis comentarios', () => {
    it('cada usuario ve solo los suyos (también el ADMIN), del más nuevo al más viejo', async () => {
      for (const who of ['admin', 'acct', 'view', 'adminb', 'viewb']) {
        const res = await api('get', '/feedback/mine', who).expect(200);
        const own = await prisma.feedback.count({ where: { userId: userId[who] } });
        expect(res.body.total).toBe(own);
        for (const f of res.body.data) {
          const row = await prisma.feedback.findUniqueOrThrow({ where: { id: f.id } });
          expect(row.userId).toBe(userId[who]);
          expect(f).not.toHaveProperty('userAgent');
        }
        const dates = res.body.data.map((f: { createdAt: string }) => f.createdAt);
        expect(dates).toEqual([...dates].sort((a: string, b: string) => b.localeCompare(a)));
      }
      expect((await api('get', '/feedback/mine', 'viewb').expect(200)).body.total).toBe(0);
    });

    it('paginación: limit entre 1 y 100', async () => {
      const res = await api('get', '/feedback/mine?page=2&limit=5', 'spam').expect(200);
      expect(res.body).toMatchObject({ page: 2, limit: 5 });
      expect(res.body.data).toHaveLength(5);
      await api('get', '/feedback/mine?limit=101', 'spam').expect(400);
      await api('get', '/feedback/mine?page=0', 'spam').expect(400);
    });
  });

  // ------------------------------------------------------------------
  describe('Comentarios recibidos (ADMIN)', () => {
    it('solo el ADMIN lista; ACCOUNTANT, APPROVER y VIEWER reciben 403', async () => {
      for (const who of ['acct', 'appr', 'view']) await api('get', '/feedback', who).expect(403);
    });

    it('el ADMIN ve todos los de su empresa y ninguno de la otra, con quién lo envió', async () => {
      const res = await api('get', '/feedback?limit=100', 'admin').expect(200);
      expect(res.body.total).toBe(await prisma.feedback.count({ where: { companyId: companyA } }));
      const senders = new Set(res.body.data.map((f: { userId: string }) => f.userId));
      expect(senders.has(userId.adminb)).toBe(false);
      const fromAcct = res.body.data.find((f: { userId: string }) => f.userId === userId.acct);
      expect(fromAcct.user).toEqual({ id: userId.acct, name: 'acct', email: email('acct'), role: 'ACCOUNTANT' });
      expect(fromAcct).toHaveProperty('userAgent');

      const b = await api('get', '/feedback', 'adminb').expect(200);
      expect(b.body.total).toBe(1);
      expect(b.body.data[0].userId).toBe(userId.adminb);
    });

    it('filtros por tipo y estado', async () => {
      const ideas = await api('get', '/feedback?kind=IDEA', 'admin').expect(200);
      expect(ideas.body.total).toBeGreaterThan(0);
      expect(ideas.body.data.every((f: { kind: string }) => f.kind === 'IDEA')).toBe(true);
      const done = await api('get', '/feedback?status=DONE', 'admin').expect(200);
      expect(done.body.total).toBe(0);
      await api('get', '/feedback?status=OTRO', 'admin').expect(400);
      await api('get', '/feedback?kind=OTRO', 'admin').expect(400);
    });
  });

  // ------------------------------------------------------------------
  describe('Gestionar (ADMIN)', () => {
    let fbId: string;
    beforeAll(async () => {
      fbId = (await send('view', { kind: 'BROKEN', message: 'No me deja guardar la factura' }).expect(201)).body.id;
    });

    it('el ADMIN cambia estado, respuesta y referencia de tarea; queda en la bitácora; quien lo envió lo ve', async () => {
      const res = await api('patch', `/feedback/${fbId}`, 'admin')
        .send({ status: 'DONE', response: 'Resuelto en la versión 0.2-fase 2', taskRef: '#123' }).expect(200);
      expect(res.body).toMatchObject({ status: 'DONE', response: 'Resuelto en la versión 0.2-fase 2', taskRef: '#123' });
      const log = await prisma.auditLog.findFirstOrThrow({ where: { entityName: 'Feedback', entityId: fbId, action: 'UPDATE' } });
      expect(log.changes).toMatchObject({ before: { status: 'NEW' }, after: { status: 'DONE', taskRef: '#123' } });
      const mine = await api('get', '/feedback/mine', 'view').expect(200);
      expect(mine.body.data.find((f: { id: string }) => f.id === fbId)).toMatchObject({ status: 'DONE', taskRef: '#123' });
    });

    it('cambio parcial: solo lo enviado; "" o null borran la respuesta y la referencia', async () => {
      await api('patch', `/feedback/${fbId}`, 'admin').send({ status: 'PLANNED' }).expect(200);
      let row = await prisma.feedback.findUniqueOrThrow({ where: { id: fbId } });
      expect(row).toMatchObject({ status: 'PLANNED', response: 'Resuelto en la versión 0.2-fase 2', taskRef: '#123' });
      await api('patch', `/feedback/${fbId}`, 'admin').send({ response: '', taskRef: null }).expect(200);
      row = await prisma.feedback.findUniqueOrThrow({ where: { id: fbId } });
      expect(row).toMatchObject({ status: 'PLANNED', response: null, taskRef: null });
    });

    it('ACCOUNTANT, APPROVER, VIEWER y hasta quien lo envió reciben 403', async () => {
      for (const who of ['acct', 'appr', 'view']) {
        await api('patch', `/feedback/${fbId}`, who).send({ status: 'WONT_DO' }).expect(403);
      }
    });

    it('el ADMIN de otra empresa recibe 404 y no cambia nada', async () => {
      await api('patch', `/feedback/${fbId}`, 'adminb').send({ status: 'WONT_DO', response: 'x' }).expect(404);
      expect((await prisma.feedback.findUniqueOrThrow({ where: { id: fbId } })).status).toBe('PLANNED');
    });

    it('validaciones: vacío, estado inválido, respuesta > 1.000, referencia > 100, id no UUID, inexistente, campos extra', async () => {
      await api('patch', `/feedback/${fbId}`, 'admin').send({}).expect(400);
      await api('patch', `/feedback/${fbId}`, 'admin').send({ status: 'CERRADO' }).expect(400);
      await api('patch', `/feedback/${fbId}`, 'admin').send({ response: 'r'.repeat(1000) }).expect(200);
      await api('patch', `/feedback/${fbId}`, 'admin').send({ response: 'r'.repeat(1001) }).expect(400);
      await api('patch', `/feedback/${fbId}`, 'admin').send({ taskRef: 't'.repeat(101) }).expect(400);
      await api('patch', `/feedback/${fbId}`, 'admin').send({ message: 'otro texto' }).expect(400);
      await api('patch', '/feedback/no-es-uuid', 'admin').send({ status: 'DONE' }).expect(400);
      await api('patch', '/feedback/00000000-0000-4000-8000-000000000000', 'admin').send({ status: 'DONE' }).expect(404);
    });
  });
});
