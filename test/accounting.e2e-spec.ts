import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Requiere Postgres arriba con TODAS las migraciones aplicadas
 * (incluida 20260929120000_accounting_checks). Crea sus propias empresas con
 * sufijo único y las borra al final; no toca tus datos.
 */
describe('Contabilidad (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `acc-${r}-${sfx}@test.local`;

  let companyA: string;
  let companyB: string;
  const token: Record<string, string> = {};

  // ids de cuentas de la empresa A
  const acc: Record<string, string> = {};
  let accB: string; // cuenta de la empresa B

  const api = (method: 'get' | 'post' | 'patch', url: string, who: string) =>
    request(app.getHttpServer())[method](url).set('Authorization', `Bearer ${token[who]}`);

  const entryBody = (over: Record<string, unknown> = {}) => ({
    date: '2027-03-10',
    description: 'Venta de contado',
    lines: [
      { accountId: acc.caja, debit: 100 },
      { accountId: acc.ventas, credit: 100 },
    ],
    ...over,
  });

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);

    const hash = await bcrypt.hash(password, 4);
    const a = await prisma.company.create({ data: { name: `Acc A ${sfx}`, taxId: `ACC-A-${sfx}` } });
    const b = await prisma.company.create({ data: { name: `Acc B ${sfx}`, taxId: `ACC-B-${sfx}` } });
    companyA = a.id;
    companyB = b.id;

    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA],
      ['acct', UserRole.ACCOUNTANT, companyA],
      ['appr', UserRole.APPROVER, companyA],
      ['view', UserRole.VIEWER, companyA],
      ['adminb', UserRole.ADMIN, companyB],
    ];
    for (const [r, role, companyId] of users) {
      await prisma.user.create({
        data: { email: email(r), password: hash, name: r, role, companyId },
      });
      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: email(r), password });
      token[r] = res.body.access_token;
    }

    const bAcc = await prisma.account.create({
      data: { companyId: companyB, code: '1101', name: 'Caja B', type: 'ASSET' },
    });
    accB = bAcc.id;
  });

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { companyId: { in: ids } } } });
    await prisma.journalEntry.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.fiscalPeriod.deleteMany({ where: { companyId: { in: ids } } });
    // hijas primero (auto-relación)
    await prisma.account.deleteMany({ where: { companyId: { in: ids }, parentId: { not: null } } });
    await prisma.account.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.costCenter.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  // ------------------------------------------------------------------
  describe('plan de cuentas', () => {
    it('ADMIN y ACCOUNTANT crean cuentas', async () => {
      const mk = async (who: string, code: string, name: string, type: string, key: string, parentId?: string) => {
        const res = await api('post', '/accounting/accounts', who).send({ code, name, type, parentId }).expect(201);
        acc[key] = res.body.id;
      };
      await mk('admin', '1000', 'Activos', 'ASSET', 'activos');
      await mk('acct', '1101', 'Caja', 'ASSET', 'caja', acc.activos);
      await mk('acct', '1102', 'Banco', 'ASSET', 'banco');
      await mk('acct', '4101', 'Ventas', 'INCOME', 'ventas');
      await mk('acct', '5101', 'Gastos varios', 'EXPENSE', 'gastos');
      await mk('acct', '2101', 'Cuentas por pagar', 'LIABILITY', 'cxp');
    });

    it('VIEWER no puede crear (403) pero sí leer (200)', async () => {
      await api('post', '/accounting/accounts', 'view')
        .send({ code: '9999', name: 'x', type: 'ASSET' }).expect(403);
      const res = await api('get', '/accounting/accounts', 'view').expect(200);
      expect(res.body.length).toBeGreaterThanOrEqual(6);
    });

    it('409 con código duplicado', async () => {
      await api('post', '/accounting/accounts', 'admin')
        .send({ code: '1101', name: 'Otra caja', type: 'ASSET' }).expect(409);
    });

    it('422 si el hijo no es del mismo tipo que el padre', async () => {
      await api('post', '/accounting/accounts', 'admin')
        .send({ code: '1199', name: 'Raro', type: 'EXPENSE', parentId: acc.activos }).expect(422);
    });

    it('404 si el padre es de OTRA empresa', async () => {
      await api('post', '/accounting/accounts', 'admin')
        .send({ code: '1198', name: 'Fuga', type: 'ASSET', parentId: accB }).expect(404);
    });

    it('400 con code inválido y con campos que el DTO no declara', async () => {
      await api('post', '/accounting/accounts', 'admin')
        .send({ code: 'con espacios!', name: 'x', type: 'ASSET' }).expect(400);
      await api('post', '/accounting/accounts', 'admin')
        .send({ code: '7001', name: 'x', type: 'ASSET', companyId: companyB }).expect(400);
    });

    it('aislamiento: la empresa B no ve ni toca las cuentas de A', async () => {
      const list = await api('get', '/accounting/accounts', 'adminb').expect(200);
      expect(list.body.map((a: any) => a.id)).not.toContain(acc.caja);
      await api('get', `/accounting/accounts/${acc.caja}`, 'adminb').expect(404);
      await api('patch', `/accounting/accounts/${acc.caja}`, 'adminb').send({ name: 'hack' }).expect(404);
    });

    it('PATCH: no permite ciclos ni ser padre de sí misma; sí renombrar', async () => {
      await api('patch', `/accounting/accounts/${acc.activos}`, 'admin')
        .send({ parentId: acc.caja }).expect(422); // ciclo: caja es hija de activos
      await api('patch', `/accounting/accounts/${acc.activos}`, 'admin')
        .send({ parentId: acc.activos }).expect(422);
      const res = await api('patch', `/accounting/accounts/${acc.banco}`, 'acct')
        .send({ name: 'Banco Popular' }).expect(200);
      expect(res.body.name).toBe('Banco Popular');
    });

    it('no se puede desactivar una cuenta con subcuentas activas', async () => {
      await api('patch', `/accounting/accounts/${acc.activos}`, 'admin')
        .send({ active: false }).expect(422);
    });
  });

  // ------------------------------------------------------------------
  describe('asientos: partida doble', () => {
    it('crea un asiento cuadrado, POSTED, con createdBy y líneas', async () => {
      const res = await api('post', '/accounting/journal-entries', 'acct').send(entryBody()).expect(201);
      expect(res.body.status).toBe('POSTED');
      expect(res.body.lines).toHaveLength(2);
      expect(res.body.companyId).toBe(companyA);
    });

    it('422 si no cuadra', async () => {
      const res = await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ lines: [{ accountId: acc.caja, debit: 100 }, { accountId: acc.ventas, credit: 90 }] }))
        .expect(422);
      expect(res.body.message).toMatch(/no cuadra/);
    });

    it('decimales exactos: 0.1 + 0.2 = 0.3 (sin error de coma flotante)', async () => {
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({
          lines: [
            { accountId: acc.caja, debit: 0.1 },
            { accountId: acc.banco, debit: 0.2 },
            { accountId: acc.ventas, credit: 0.3 },
          ],
        })).expect(201);
    });

    it('400 con línea que tiene débito y crédito a la vez, o ninguno, o negativo', async () => {
      const bad = (line: object) =>
        api('post', '/accounting/journal-entries', 'acct')
          .send(entryBody({ lines: [line, { accountId: acc.ventas, credit: 50 }] }));
      await bad({ accountId: acc.caja, debit: 50, credit: 50 }).expect(400);
      await bad({ accountId: acc.caja }).expect(400);
      await bad({ accountId: acc.caja, debit: -50 }).expect(400);
    });

    it('400 con menos de 2 líneas y con más de 4 decimales', async () => {
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ lines: [{ accountId: acc.caja, debit: 10 }] })).expect(400);
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ lines: [{ accountId: acc.caja, debit: 10.12345 }, { accountId: acc.ventas, credit: 10.12345 }] }))
        .expect(400);
    });

    it('rechaza cuentas de otra empresa (400) y cuentas con subcuentas (422)', async () => {
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ lines: [{ accountId: accB, debit: 10 }, { accountId: acc.ventas, credit: 10 }] }))
        .expect(400);
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ lines: [{ accountId: acc.activos, debit: 10 }, { accountId: acc.ventas, credit: 10 }] }))
        .expect(422);
    });

    it('rechaza cuentas inactivas (422)', async () => {
      await api('patch', `/accounting/accounts/${acc.gastos}`, 'admin').send({ active: false }).expect(200);
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ lines: [{ accountId: acc.gastos, debit: 10 }, { accountId: acc.caja, credit: 10 }] }))
        .expect(422);
      await api('patch', `/accounting/accounts/${acc.gastos}`, 'admin').send({ active: true }).expect(200);
    });

    it('VIEWER y APPROVER no crean asientos (403)', async () => {
      await api('post', '/accounting/journal-entries', 'view').send(entryBody()).expect(403);
      await api('post', '/accounting/journal-entries', 'appr').send(entryBody()).expect(403);
    });

    it('un asiento fallido NO deja nada a medias (atomicidad)', async () => {
      const before = await prisma.journalEntry.count({ where: { companyId: companyA } });
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ lines: [{ accountId: acc.caja, debit: 10 }, { accountId: accB, credit: 10 }] }))
        .expect(400);
      expect(await prisma.journalEntry.count({ where: { companyId: companyA } })).toBe(before);
    });
  });

  // ------------------------------------------------------------------
  describe('CHECK en la base de datos (última defensa)', () => {
    it('la BD rechaza una línea con débito y crédito aunque se salten el service', async () => {
      const entry = await prisma.journalEntry.create({
        data: {
          companyId: companyA, date: new Date('2027-03-11'), description: 'directo',
          createdById: (await prisma.user.findUniqueOrThrow({ where: { email: email('admin') } })).id,
        },
      });
      await expect(
        prisma.journalEntryLine.create({
          data: { journalEntryId: entry.id, accountId: acc.caja, debit: 5, credit: 5 },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.journalEntryLine.create({
          data: { journalEntryId: entry.id, accountId: acc.caja, debit: 0, credit: 0 },
        }),
      ).rejects.toThrow();
      await prisma.journalEntry.delete({ where: { id: entry.id } });
    });
  });

  // ------------------------------------------------------------------
  describe('períodos fiscales', () => {
    let marzo: string;

    it('solo ADMIN crea períodos (403 al contador)', async () => {
      await api('post', '/accounting/fiscal-periods', 'acct')
        .send({ name: 'Marzo 2027', startDate: '2027-03-01', endDate: '2027-03-31' }).expect(403);
      const res = await api('post', '/accounting/fiscal-periods', 'admin')
        .send({ name: 'Marzo 2027', startDate: '2027-03-01', endDate: '2027-03-31' }).expect(201);
      marzo = res.body.id;
      expect(res.body.status).toBe('OPEN');
    });

    it('409 si se solapa; 400 si las fechas están al revés', async () => {
      await api('post', '/accounting/fiscal-periods', 'admin')
        .send({ name: 'Solapado', startDate: '2027-03-31', endDate: '2027-04-15' }).expect(409);
      await api('post', '/accounting/fiscal-periods', 'admin')
        .send({ name: 'Al revés', startDate: '2027-05-10', endDate: '2027-05-01' }).expect(400);
    });

    it('cerrar: 403 al contador, 200 al admin, 409 si ya está cerrado', async () => {
      await api('post', `/accounting/fiscal-periods/${marzo}/close`, 'acct').expect(403);
      const res = await api('post', `/accounting/fiscal-periods/${marzo}/close`, 'admin').expect(201);
      expect(res.body.status).toBe('CLOSED');
      expect(res.body.closedAt).toBeTruthy();
      await api('post', `/accounting/fiscal-periods/${marzo}/close`, 'admin').expect(409);
    });

    it('período CERRADO: bloquea asientos, incluso el último día a media tarde', async () => {
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ date: '2027-03-15' })).expect(422);
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ date: '2027-03-31T18:00:00Z' })).expect(422);
    });

    it('fuera del período cerrado sigue permitido', async () => {
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ date: '2027-04-01' })).expect(201);
    });

    it('anular un asiento dentro de un período cerrado es 422', async () => {
      // el asiento del 2027-03-10 se creó antes de cerrar marzo
      const list = await api('get', '/accounting/journal-entries?from=2027-03-10&to=2027-03-10', 'admin').expect(200);
      const id = list.body.data[0].id;
      await api('post', `/accounting/journal-entries/${id}/void`, 'admin')
        .send({ reason: 'error' }).expect(422);
    });

    it('reabrir (solo ADMIN) vuelve a permitir asientos', async () => {
      await api('post', `/accounting/fiscal-periods/${marzo}/reopen`, 'acct').expect(403);
      await api('post', `/accounting/fiscal-periods/${marzo}/reopen`, 'admin').expect(201);
      await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ date: '2027-03-15' })).expect(201);
    });

    it('la empresa B no ve ni cierra períodos de A', async () => {
      const list = await api('get', '/accounting/fiscal-periods', 'adminb').expect(200);
      expect(list.body).toEqual([]);
      await api('post', `/accounting/fiscal-periods/${marzo}/close`, 'adminb').expect(404);
    });
  });

  // ------------------------------------------------------------------
  describe('anulación y balance de comprobación', () => {
    it('APPROVER anula; el contador no (403); doble anulación 409; sin motivo 400', async () => {
      const created = await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ date: '2027-06-01', lines: [{ accountId: acc.caja, debit: 777 }, { accountId: acc.ventas, credit: 777 }] }))
        .expect(201);
      const id = created.body.id;

      await api('post', `/accounting/journal-entries/${id}/void`, 'acct').send({ reason: 'x' }).expect(403);
      await api('post', `/accounting/journal-entries/${id}/void`, 'appr').send({}).expect(400);
      const res = await api('post', `/accounting/journal-entries/${id}/void`, 'appr')
        .send({ reason: 'Monto equivocado' }).expect(201);
      // R2 (N1): el original sigue contabilizado y queda enlazado a su reverso
      expect(res.body.status).toBe('POSTED');
      expect(res.body.reversedBy?.id).toBeTruthy();
      await api('post', `/accounting/journal-entries/${id}/void`, 'admin').send({ reason: 'otra vez' }).expect(409);
    });

    it('carrera: dos anulaciones simultáneas del mismo asiento, gana exactamente una', async () => {
      const created = await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ date: '2027-06-03' })).expect(201);
      const id = created.body.id;
      const voidIt = () =>
        api('post', `/accounting/journal-entries/${id}/void`, 'admin').send({ reason: 'carrera' });
      const codes = (await Promise.all([voidIt(), voidIt()])).map((r) => r.status).sort();
      expect(codes).toEqual([201, 409]);
      // y queda UN solo registro de auditoría, no dos
      expect(await prisma.auditLog.count({ where: { entityId: id, action: 'VOID' } })).toBe(1);
    });

    it('no se anula un asiento conciliado (422)', async () => {
      const created = await api('post', '/accounting/journal-entries', 'acct')
        .send(entryBody({ date: '2027-06-02' })).expect(201);
      await prisma.journalEntry.update({ where: { id: created.body.id }, data: { reconciled: true } });
      await api('post', `/accounting/journal-entries/${created.body.id}/void`, 'admin')
        .send({ reason: 'x' }).expect(422);
    });

    it('trial balance: cuadra y los asientos anulados se cancelan con su reverso', async () => {
      const res = await api('get', '/accounting/trial-balance', 'view').expect(200);
      expect(res.body.balanced).toBe(true);
      expect(Number(res.body.totalDebit)).toBe(Number(res.body.totalCredit));

      const caja = res.body.lines.find((l: any) => l.code === '1101');
      // 100 (10-mar) + 0.1 (0.1+0.2 caja) + 100 (1-abr) + 100 (15-mar) + 100 (2-jun conciliado) = 400.1 de saldo.
      // El de 777 y el de la carrera (100, 3-jun) están reversados: su débito sigue en la columna y su reverso lo acredita.
      expect(Number(caja.debit)).toBeCloseTo(400.1 + 777 + 100, 4);
      expect(Number(caja.credit)).toBeCloseTo(777 + 100, 4);
      expect(Number(caja.balance)).toBeCloseTo(400.1, 4);
    });

    it('trial balance con rango de fechas', async () => {
      const res = await api('get', '/accounting/trial-balance?from=2027-04-01&to=2027-04-30', 'view').expect(200);
      const caja = res.body.lines.find((l: any) => l.code === '1101');
      expect(Number(caja.debit)).toBe(100);
      expect(res.body.balanced).toBe(true);
    });

    it('trial balance de la empresa B está vacío (aislamiento)', async () => {
      const res = await api('get', '/accounting/trial-balance', 'adminb').expect(200);
      expect(res.body.lines).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  describe('listado, detalle y auditoría', () => {
    it('lista con paginación, filtro de estado y aislamiento', async () => {
      const res = await api('get', '/accounting/journal-entries?limit=2&page=1', 'view').expect(200);
      expect(res.body.data.length).toBeLessThanOrEqual(2);
      expect(res.body.total).toBeGreaterThan(2);

      // R2 (N1): los reversados siguen POSTED; se listan con ?reversed=true
      const reversed = await api('get', '/accounting/journal-entries?reversed=true', 'view').expect(200);
      expect(reversed.body.data.every((e: any) => e.status === 'POSTED' && e.reversedBy?.id)).toBe(true);
      expect(reversed.body.total).toBe(2);
      const voided = await api('get', '/accounting/journal-entries?status=VOIDED', 'view').expect(200);
      expect(voided.body.total).toBe(0);

      const other = await api('get', '/accounting/journal-entries', 'adminb').expect(200);
      expect(other.body.total).toBe(0);
    });

    it('400 con limit > 100 o status inválido', async () => {
      await api('get', '/accounting/journal-entries?limit=500', 'view').expect(400);
      await api('get', '/accounting/journal-entries?status=NOPE', 'view').expect(400);
    });

    it('detalle trae código y nombre de cada cuenta; 404 desde otra empresa', async () => {
      const list = await api('get', '/accounting/journal-entries?limit=1', 'view').expect(200);
      const id = list.body.data[0].id;
      const res = await api('get', `/accounting/journal-entries/${id}`, 'view').expect(200);
      expect(res.body.lines[0].account.code).toBeDefined();
      await api('get', `/accounting/journal-entries/${id}`, 'adminb').expect(404);
      await api('get', '/accounting/journal-entries/no-es-uuid', 'view').expect(400);
    });

    it('todo queda en el AuditLog con usuario y acción', async () => {
      const logs = await prisma.auditLog.findMany({ where: { companyId: companyA } });
      const has = (entityName: string, action: string) =>
        logs.some((l) => l.entityName === entityName && l.action === action);
      expect(has('Account', 'CREATE')).toBe(true);
      expect(has('Account', 'UPDATE')).toBe(true);
      expect(has('FiscalPeriod', 'CREATE')).toBe(true);
      expect(has('FiscalPeriod', 'UPDATE')).toBe(true);
      expect(has('JournalEntry', 'CREATE')).toBe(true);
      expect(has('JournalEntry', 'VOID')).toBe(true);
      const voidLog = logs.find((l) => l.action === 'VOID')!;
      expect((voidLog.changes as any).reason).toBe('Monto equivocado');
    });

    it('sin token: 401 en todo el módulo', async () => {
      for (const url of ['/accounting/accounts', '/accounting/journal-entries', '/accounting/trial-balance', '/accounting/fiscal-periods']) {
        await request(app.getHttpServer()).get(url).expect(401);
      }
    });
  });
});
