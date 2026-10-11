import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

describe('Presupuestos vs real (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `bud-${r}-${sfx}@test.local`;
  let companyId: string;
  let otherCompanyId: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let otherAccount: string;
  let budgetId: string;
  const num = (v: unknown) => Number(v);
  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const entry = (date: string, debit: string, credit: string, amount: number) =>
    api('post', '/accounting/journal-entries', 'acct')
      .send({ date, description: `${debit}/${credit}`, lines: [{ accountId: acc[debit], debit: amount }, { accountId: acc[credit], credit: amount }] })
      .expect(201);
  const vs = async (q = '') => (await api('get', `/budgets/${budgetId}/vs-actual${q}`, 'view').expect(200)).body;
  const row = (b: { rows: { code: string }[] }, code: string) => b.rows.find((r) => r.code === code) as any;

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyId = (await prisma.company.create({ data: { name: `Bud ${sfx}`, taxId: `BU-${sfx}` } })).id;
    otherCompanyId = (await prisma.company.create({ data: { name: `BudO ${sfx}`, taxId: `BO-${sfx}` } })).id;
    for (const [r, role] of [
      ['admin', UserRole.ADMIN], ['acct', UserRole.ACCOUNTANT], ['appr', UserRole.APPROVER], ['view', UserRole.VIEWER],
    ] as const) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    await prisma.user.create({ data: { email: email('o'), password: hash, name: 'o', role: UserRole.ADMIN, companyId: otherCompanyId } });
    token.o = (await request(app.getHttpServer()).post('/auth/login').send({ email: email('o'), password })).body.access_token;

    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId, code, name: key, type } })).id);
    await mk('banco', '1102', 'ASSET');
    await mk('capital', '3101', 'EQUITY');
    await mk('ventas', '4101', 'INCOME');
    await mk('alquiler', '5101', 'EXPENSE');
    await mk('nomina', '5102', 'EXPENSE');
    await mk('extra', '5199', 'EXPENSE'); // gasto sin presupuestar
    otherAccount = (await prisma.account.create({ data: { companyId: otherCompanyId, code: '4101', name: 'x', type: 'INCOME' } })).id;

    await entry('2027-01-01', 'banco', 'capital', 100000);
    await entry('2027-01-10', 'banco', 'ventas', 1200);   // ene ventas real 1200
    await entry('2027-02-10', 'banco', 'ventas', 800);    // feb ventas real 800
    await entry('2027-01-15', 'alquiler', 'banco', 500);  // ene alquiler real 500
    await entry('2027-02-15', 'alquiler', 'banco', 700);  // feb alquiler real 700
    await entry('2027-02-20', 'extra', 'banco', 50);      // sin presupuesto
    await entry('2028-01-10', 'banco', 'ventas', 9999);   // otro año: no cuenta
  });

  afterAll(async () => {
    for (const where of [{ companyId }, { companyId: otherCompanyId }]) {
      await prisma.budgetLine.deleteMany({ where: { budget: where } });
      await prisma.budget.deleteMany({ where });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
      await prisma.journalEntry.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where });
      await prisma.account.deleteMany({ where });
      await prisma.user.deleteMany({ where });
    }
    await prisma.company.deleteMany({ where: { id: { in: [companyId, otherCompanyId] } } });
    await app.close();
  });

  describe('cabecera', () => {
    it('crea (ACCOUNTANT), rechaza duplicado y roles/validación', async () => {
      await api('post', '/budgets', 'view').send({ name: 'Presupuesto 2027', year: 2027 }).expect(403);
      await api('post', '/budgets', 'acct').send({ name: 'x', year: 2027 }).expect(400);
      await api('post', '/budgets', 'acct').send({ name: 'Presupuesto 2027', year: 1900 }).expect(400);
      const r = await api('post', '/budgets', 'acct').send({ name: 'Presupuesto 2027', year: 2027, notes: 'n' }).expect(201);
      expect(r.body.status).toBe('DRAFT');
      budgetId = r.body.id;
      await api('post', '/budgets', 'acct').send({ name: 'Presupuesto 2027', year: 2027 }).expect(409);
    });
    it('lista con filtros y aísla por empresa', async () => {
      expect((await api('get', '/budgets?year=2027', 'view').expect(200)).body).toHaveLength(1);
      expect((await api('get', '/budgets?status=APPROVED', 'view').expect(200)).body).toHaveLength(0);
      expect((await api('get', '/budgets', 'o').expect(200)).body).toHaveLength(0);
      await api('get', `/budgets/${budgetId}`, 'o').expect(404);
      await api('get', `/budgets/${budgetId}/vs-actual`, 'o').expect(404);
      await api('patch', `/budgets/${budgetId}`, 'o').send({ notes: 'hack' }).expect(404);
    });
    it('no aprueba sin líneas', async () => {
      await api('post', `/budgets/${budgetId}/approve`, 'admin').expect(400);
    });
  });

  describe('líneas', () => {
    it('valida cuentas y duplicados', async () => {
      const L = (k: string, month: number, plannedAmount: number) => ({ accountId: acc[k], month, plannedAmount });
      await api('put', `/budgets/${budgetId}/lines`, 'view').send({ lines: [L('ventas', 1, 1)] }).expect(403);
      await api('put', `/budgets/${budgetId}/lines`, 'acct').send({ lines: [L('banco', 1, 1)] }).expect(400); // activo
      await api('put', `/budgets/${budgetId}/lines`, 'acct').send({ lines: [{ accountId: otherAccount, month: 1, plannedAmount: 1 }] }).expect(400);
      await api('put', `/budgets/${budgetId}/lines`, 'acct').send({ lines: [L('ventas', 13, 1)] }).expect(400);
      await api('put', `/budgets/${budgetId}/lines`, 'acct').send({ lines: [L('ventas', 1, -5)] }).expect(400);
      await api('put', `/budgets/${budgetId}/lines`, 'acct').send({ lines: [L('ventas', 1, 1), L('ventas', 1, 2)] }).expect(400);
      await api('put', `/budgets/${budgetId}/lines`, 'acct').send({ lines: [] }).expect(400);
      expect(num((await api('get', `/budgets/${budgetId}`, 'view').expect(200)).body.lines.length)).toBe(0); // nada se guardó
    });
    it('guarda, actualiza (upsert) y reemplaza', async () => {
      const L = (k: string, month: number, plannedAmount: number) => ({ accountId: acc[k], month, plannedAmount });
      await api('put', `/budgets/${budgetId}/lines`, 'acct')
        .send({ lines: [L('ventas', 1, 1000), L('ventas', 2, 1000), L('alquiler', 1, 600), L('alquiler', 2, 600), L('nomina', 1, 300)] })
        .expect(200);
      // upsert: cambia ventas ene a 1000.5 y no duplica
      const r = await api('put', `/budgets/${budgetId}/lines`, 'acct').send({ lines: [L('ventas', 1, 1000.5)] }).expect(200);
      expect(r.body.lines).toHaveLength(5);
      expect(num(r.body.totalPlanned)).toBeCloseTo(1000.5 + 1000 + 600 + 600 + 300, 4);
      await api('put', `/budgets/${budgetId}/lines`, 'acct').send({ lines: [L('ventas', 1, 1000)] }).expect(200);
    });
  });

  describe('presupuesto vs real con montos conocidos', () => {
    it('calcula variaciones correctas', async () => {
      const b = await vs();
      expect(b.totals.income).toMatchObject({ planned: '2000', actual: '2000', variance: '0' });
      // gastos: plan 600+600+300=1500; real 500+700+50=1250
      expect(num(b.totals.expense.planned)).toBe(1500);
      expect(num(b.totals.expense.actual)).toBe(1250);
      expect(num(b.totals.expense.variance)).toBe(-250);
      expect(num(b.totals.netResult.planned)).toBe(500);
      expect(num(b.totals.netResult.actual)).toBe(750);

      const ventas = row(b, '4101');
      expect([num(ventas.planned), num(ventas.actual), num(ventas.variance)]).toEqual([2000, 2000, 0]);
      expect(ventas.favorable).toBe(true);
      expect(ventas.months.map((m: any) => num(m.actual))).toEqual([1200, 800]);
      expect(ventas.months.map((m: any) => num(m.variance))).toEqual([200, -200]);
      expect(ventas.months.map((m: any) => m.favorable)).toEqual([true, false]);

      const alq = row(b, '5101');
      expect([num(alq.planned), num(alq.actual), num(alq.variance)]).toEqual([1200, 1200, 0]);
      expect(alq.months.map((m: any) => num(m.variance))).toEqual([-100, 100]);
      expect(alq.months.map((m: any) => m.favorable)).toEqual([true, false]); // gastar menos es favorable
      expect(alq.months[0].variancePct).toBe('-16.67');

      const nom = row(b, '5102'); // presupuestado y sin gasto
      expect([num(nom.planned), num(nom.actual)]).toEqual([300, 0]);
      expect(nom.favorable).toBe(true);

      const extra = row(b, '5199'); // gasto sin presupuesto
      expect(extra.budgeted).toBe(false);
      expect([num(extra.planned), num(extra.actual)]).toEqual([0, 50]);
      expect(extra.variancePct).toBeNull();
      expect(extra.favorable).toBe(false);
    });
    it('el año distinto y los asientos no POSTED no cuentan; filtro de meses', async () => {
      const b1 = await vs('?fromMonth=1&toMonth=1');
      expect(num(b1.totals.income.actual)).toBe(1200);
      expect(num(b1.totals.income.planned)).toBe(1000);
      expect(num(b1.totals.expense.actual)).toBe(500);
      const b2 = await vs('?fromMonth=2&toMonth=2');
      expect(num(b2.totals.expense.actual)).toBe(750);
      expect(num(b2.totals.income.planned)).toBe(1000);
      await api('get', `/budgets/${budgetId}/vs-actual?fromMonth=3&toMonth=2`, 'view').expect(400);
      await api('get', `/budgets/${budgetId}/vs-actual?toMonth=13`, 'view').expect(400);
    });
    it('un asiento anulado deja de contar', async () => {
      const e = await entry('2027-02-25', 'alquiler', 'banco', 1000);
      expect(num((await vs()).totals.expense.actual)).toBe(2250);
      await api('post', `/accounting/journal-entries/${e.body.id}/void`, 'admin').send({ reason: 'error de captura' });
      expect(num((await vs()).totals.expense.actual)).toBe(1250);
    });
  });

  describe('ciclo de estados', () => {
    it('solo ADMIN/APPROVER aprueba; aprobado no se edita', async () => {
      await api('post', `/budgets/${budgetId}/approve`, 'acct').expect(403);
      await api('post', `/budgets/${budgetId}/approve`, 'appr').expect(201);
      await api('post', `/budgets/${budgetId}/approve`, 'admin').expect(409);
      await api('patch', `/budgets/${budgetId}`, 'acct').send({ notes: 'z' }).expect(409);
      await api('delete', `/budgets/${budgetId}`, 'acct').expect(409);
      await api('put', `/budgets/${budgetId}/lines`, 'acct').send({ lines: [{ accountId: acc.ventas, month: 3, plannedAmount: 5 }] }).expect(409);
    });
    it('aprobaciones simultáneas: solo una gana', async () => {
      await api('post', `/budgets/${budgetId}/reopen`, 'acct').expect(403);
      await api('post', `/budgets/${budgetId}/reopen`, 'admin').expect(201);
      const rs = await Promise.all([1, 2, 3, 4].map(() => api('post', `/budgets/${budgetId}/approve`, 'admin')));
      expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409)).toHaveLength(3);
    });
    it('archiva solo si está aprobado y deja auditoría', async () => {
      await api('post', `/budgets/${budgetId}/archive`, 'admin').expect(201);
      await api('post', `/budgets/${budgetId}/archive`, 'admin').expect(409);
      const acts = (await prisma.auditLog.findMany({ where: { companyId, entityName: 'Budget', entityId: budgetId } })).map((a) => a.action);
      expect(acts).toEqual(expect.arrayContaining(['CREATE', 'UPDATE', 'APPROVE', 'CLOSE']));
    });
    it('un borrador sí se puede borrar', async () => {
      const r = await api('post', '/budgets', 'acct').send({ name: 'Borrar', year: 2027 }).expect(201);
      await api('put', `/budgets/${r.body.id}/lines`, 'acct').send({ lines: [{ accountId: acc.ventas, month: 1, plannedAmount: 5 }] }).expect(200);
      await api('delete', `/budgets/${r.body.id}`, 'acct').expect(200);
      await api('get', `/budgets/${r.body.id}`, 'acct').expect(404);
    });
  });
});
