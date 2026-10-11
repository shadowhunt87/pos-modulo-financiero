import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { PostingService } from '../src/posting/posting.service.js';

/* eslint-disable @typescript-eslint/no-explicit-any */
describe('Cierre de año fiscal y apertura de saldos (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `fy-${r}-${sfx}@test.local`;
  let companyId: string;
  let companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  const accB: Record<string, string> = {};
  const userId: Record<string, string> = {};
  const y: Record<string, string> = {};
  let partnerA: string;
  let partnerB: string;
  const num = (v: unknown) => Number(v);
  const api = (m: 'get' | 'post' | 'put' | 'patch' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const entry = (date: string, debit: string, credit: string, amount: number) =>
    api('post', '/accounting/journal-entries', 'acct').send({
      date, description: `${debit}/${credit}`, lines: [{ accountId: acc[debit], debit: amount }, { accountId: acc[credit], credit: amount }],
    });
  const balance = async (asOf: string) => (await api('get', `/reports/balance-sheet?asOf=${asOf}`, 'view').expect(200)).body;
  const closingEntry = (yearId: string) =>
    prisma.journalEntry.findFirst({ where: { companyId, type: 'CLOSING', sourceId: yearId, status: 'POSTED' }, include: { lines: true } });
  const linesOf = (e: any) => Object.fromEntries(e.lines.map((l: any) => [l.accountId, [num(l.debit), num(l.credit)]]));

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyId = (await prisma.company.create({ data: { name: `FY ${sfx}`, taxId: `FY-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `FYB ${sfx}`, taxId: `FB-${sfx}` } })).id;
    for (const [r, role, cid] of [
      ['admin', UserRole.ADMIN, companyId], ['acct', UserRole.ACCOUNTANT, companyId],
      ['appr', UserRole.APPROVER, companyId], ['view', UserRole.VIEWER, companyId], ['adminb', UserRole.ADMIN, companyB],
    ] as const) {
      userId[r] = (await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId: cid } })).id;
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (store: Record<string, string>, cid: string, key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE') =>
      (store[key] = (await prisma.account.create({ data: { companyId: cid, code, name: key, type } })).id);
    await mk(acc, companyId, 'banco', '1102', 'ASSET');
    await mk(acc, companyId, 'cxc', '1201', 'ASSET');
    await mk(acc, companyId, 'capital', '3101', 'EQUITY');
    await mk(acc, companyId, 'util', '3201', 'EQUITY');
    await mk(acc, companyId, 'ventas', '4101', 'INCOME');
    await mk(acc, companyId, 'costo', '5101', 'EXPENSE');
    await mk(acc, companyId, 'gastos', '5102', 'EXPENSE');
    await mk(accB, companyB, 'banco', '1102', 'ASSET');
    await mk(accB, companyB, 'capital', '3101', 'EQUITY');
    partnerA = (await prisma.partner.create({ data: { companyId, type: 'CUSTOMER', name: 'Cliente A' } })).id;
    partnerB = (await prisma.partner.create({ data: { companyId: companyB, type: 'CUSTOMER', name: 'Cliente B' } })).id;
    await api('post', '/journals/defaults', 'admin').expect(201);
    await api('post', '/journals/defaults', 'adminb').expect(201);
  });

  afterAll(async () => {
    for (const where of [{ companyId }, { companyId: companyB }]) {
      await prisma.budgetLine.deleteMany({ where: { budget: where } });
      await prisma.budget.deleteMany({ where });
      await prisma.fiscalYear.updateMany({ where, data: { closingEntryId: null } });
      await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
      await prisma.journalEntry.deleteMany({ where });
      await prisma.fiscalPeriod.deleteMany({ where });
      await prisma.fiscalYear.deleteMany({ where });
      await prisma.auditLog.deleteMany({ where });
      await prisma.journal.deleteMany({ where });
      await prisma.accountingSettings.deleteMany({ where });
      await prisma.partner.deleteMany({ where });
      await prisma.account.deleteMany({ where });
      await prisma.user.deleteMany({ where });
    }
    await prisma.company.deleteMany({ where: { id: { in: [companyId, companyB] } } });
    await app.close();
  });

  describe('apertura de saldos', () => {
    const lines = () => [
      { accountId: acc.banco, debit: 50000 },
      { accountId: acc.cxc, debit: 2000, partnerId: partnerA },
      { accountId: acc.capital, credit: 52000 },
    ];
    it('valida roles, cuadre, cuentas y terceros', async () => {
      const body = { date: '2027-01-01', lines: lines() };
      await api('post', '/opening-balances', 'view').send(body).expect(403);
      await api('post', '/opening-balances', 'appr').send(body).expect(403);
      await api('post', '/opening-balances', 'acct')
        .send({ date: '2027-01-01', lines: [{ accountId: acc.banco, debit: 100 }, { accountId: acc.capital, credit: 50 }] }).expect(422);
      await api('post', '/opening-balances', 'acct')
        .send({ date: '2027-01-01', lines: [{ accountId: accB.banco, debit: 100 }, { accountId: acc.capital, credit: 100 }] }).expect(400);
      await api('post', '/opening-balances', 'acct')
        .send({ date: '2027-01-01', lines: [{ accountId: acc.banco, debit: 100, partnerId: partnerB }, { accountId: acc.capital, credit: 100 }] }).expect(400);
      await api('post', '/opening-balances', 'acct')
        .send({ date: '2027-01-01', lines: [{ accountId: acc.banco, debit: 100, credit: 100 }, { accountId: acc.capital, credit: 100 }] }).expect(400);
      await api('post', '/opening-balances', 'acct').send({ date: '2027-01-01', lines: [{ accountId: acc.banco, debit: 1 }] }).expect(400);
      expect((await api('get', '/opening-balances', 'view').expect(200)).body.entry).toBeNull(); // nada quedó a medias
    });
    it('crea el asiento OPENING y no admite un segundo', async () => {
      const r = await api('post', '/opening-balances', 'acct').send({ date: '2027-01-01', lines: lines() }).expect(201);
      expect(r.body).toMatchObject({ type: 'OPENING', status: 'POSTED' });
      expect(r.body.number).toMatch(/^AP-/);
      expect(r.body.lines).toHaveLength(3);
      await api('post', '/opening-balances', 'admin').send({ date: '2027-01-01', lines: lines() }).expect(409);
      const g = (await api('get', '/opening-balances', 'view').expect(200)).body;
      expect([num(g.totalDebit), num(g.totalCredit)]).toEqual([52000, 52000]);
      const bs = await balance('2027-01-01');
      expect([num(bs.totalAssets), num(bs.totalEquity), bs.balanced]).toEqual([52000, 52000, true]);
    });
    it('apertura simultánea: solo una gana', async () => {
      const body = { date: '2027-01-01', lines: [{ accountId: accB.banco, debit: 700 }, { accountId: accB.capital, credit: 700 }] };
      const rs = await Promise.all([1, 2, 3, 4].map(() => api('post', '/opening-balances', 'adminb').send(body)));
      expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409)).toHaveLength(3);
    });
    it('el asiento de apertura se puede anular y rehacer', async () => {
      const g = (await api('get', '/opening-balances', 'adminb').expect(200)).body.entry;
      await api('post', `/accounting/journal-entries/${g.id}/void`, 'adminb').send({ reason: 'saldos mal cargados' }).expect(201);
      expect((await api('get', '/opening-balances', 'adminb').expect(200)).body.entry).toBeNull();
      const body = { date: '2027-01-01', lines: [{ accountId: accB.banco, debit: 900 }, { accountId: accB.capital, credit: 900 }] };
      const r = await api('post', '/opening-balances', 'adminb').send(body).expect(201);
      expect(r.body.id).not.toBe(g.id);
    });
  });

  describe('años fiscales', () => {
    it('crea años, genera períodos y valida solapes', async () => {
      await api('post', '/fiscal-years', 'acct').send({ name: '2026', startDate: '2026-01-01', endDate: '2026-12-31' }).expect(403);
      await api('post', '/fiscal-years', 'admin').send({ name: 'x', startDate: '2027-12-31', endDate: '2027-01-01' }).expect(400);
      const y26 = await api('post', '/fiscal-years', 'admin')
        .send({ name: '2026', startDate: '2026-01-01', endDate: '2026-12-31', generatePeriods: false }).expect(201);
      y.y26 = y26.body.id;
      expect(y26.body.periods).toHaveLength(0);
      const y27 = await api('post', '/fiscal-years', 'admin').send({ name: '2027', startDate: '2027-01-01', endDate: '2027-12-31' }).expect(201);
      y.y27 = y27.body.id;
      expect(y27.body.periods).toHaveLength(12);
      expect(y27.body.periods[0].name).toBe('Enero 2027');
      expect(y27.body.periods[1].endDate).toBe('2027-02-28T23:59:59.999Z');
      expect(y27.body.periods[11].endDate).toBe('2027-12-31T23:59:59.999Z');
      const y28 = await api('post', '/fiscal-years', 'admin').send({ name: '2028', startDate: '2028-01-01', endDate: '2028-12-31' }).expect(201);
      y.y28 = y28.body.id;
      await api('post', '/fiscal-years', 'admin').send({ name: 'sol', startDate: '2027-06-01', endDate: '2028-06-01' }).expect(409);
      expect((await api('get', '/fiscal-years', 'view').expect(200)).body).toHaveLength(3);
    });
  });

  describe('cierre de 2027', () => {
    it('prepara los movimientos del año', async () => {
      await entry('2027-03-10', 'banco', 'ventas', 10000).expect(201);
      await entry('2027-04-15', 'costo', 'banco', 4000).expect(201);
      await entry('2027-06-20', 'gastos', 'banco', 1500).expect(201);
      const journal = await prisma.journal.findFirstOrThrow({ where: { companyId, type: 'GENERAL' } });
      await prisma.journalEntry.create({
        data: { companyId, journalId: journal.id, number: 'DG-BORRADOR', date: new Date('2027-05-01'), description: 'borrador', status: 'DRAFT', createdById: userId.admin },
      });
    });
    it('la vista previa muestra el resultado y lo que impide cerrar', async () => {
      const p = (await api('get', `/fiscal-years/${y.y27}/closing-preview`, 'view').expect(200)).body;
      expect(p.canClose).toBe(false);
      expect(p.issues.join('|')).toMatch(/borrador/);
      expect(p.issues.join('|')).toMatch(/2026/);
      expect(p.issues.join('|')).toMatch(/Utilidades acumuladas/);
      expect([num(p.totalIncome), num(p.totalExpenses), num(p.netResult)]).toEqual([10000, 5500, 4500]);
      expect(p.income.map((l: any) => [l.code, num(l.balance)])).toEqual([['4101', 10000]]);
      expect(p.expenses.map((l: any) => [l.code, num(l.balance)])).toEqual([['5101', 4000], ['5102', 1500]]);
    });
    it('no cierra con pendientes (422) ni con rol equivocado (403)', async () => {
      await api('post', `/fiscal-years/${y.y27}/close`, 'acct').expect(403);
      const r = await api('post', `/fiscal-years/${y.y27}/close`, 'admin').expect(422);
      expect(r.body.issues.length).toBe(3);
      expect(await closingEntry(y.y27)).toBeNull(); // no dejó nada a medias
    });
    it('al resolver los pendientes cierra el año anterior (sin movimientos) y bloquea su fecha', async () => {
      await api('put', '/settings/accounting', 'admin').send({ retainedEarningsAccountId: acc.banco }).expect(422); // debe ser patrimonio
      await api('put', '/settings/accounting', 'admin').send({ retainedEarningsAccountId: acc.util }).expect(200);
      await prisma.journalEntry.deleteMany({ where: { companyId, status: 'DRAFT' } });

      await api('post', `/fiscal-years/${y.y27}/close`, 'admin').expect(422); // 2026 sigue abierto
      const c26 = await api('post', `/fiscal-years/${y.y26}/close`, 'admin').expect(201);
      expect(c26.body.closingEntryId).toBeNull();
      expect(c26.body.year.status).toBe('CLOSED');
      // sin períodos definidos, el año cerrado igual bloquea la fecha
      const r = await entry('2026-05-01', 'banco', 'ventas', 100).expect(422);
      expect(r.body.message).toMatch(/año fiscal "2026" está cerrado/);
    });
    it('cierra 2027: asiento de cierre correcto, períodos cerrados', async () => {
      const r = await api('post', `/fiscal-years/${y.y27}/close`, 'admin').expect(201);
      expect([num(r.body.totalIncome), num(r.body.totalExpenses), num(r.body.netResult)]).toEqual([10000, 5500, 4500]);
      expect(r.body.entryNumber).toMatch(/^CI-/);
      expect(r.body.year).toMatchObject({ status: 'CLOSED', closingEntryId: r.body.closingEntryId });

      const e = (await closingEntry(y.y27))!;
      expect(e.type).toBe('CLOSING');
      expect(e.date.toISOString()).toBe('2027-12-31T23:59:59.999Z');
      expect(e.lines).toHaveLength(4);
      expect(linesOf(e)).toEqual({
        [acc.ventas]: [10000, 0], [acc.costo]: [0, 4000], [acc.gastos]: [0, 1500], [acc.util]: [0, 4500],
      });
      const year = (await api('get', `/fiscal-years/${y.y27}`, 'view').expect(200)).body;
      expect(year.periods.every((p: any) => p.status === 'CLOSED')).toBe(true);
      await api('post', `/fiscal-years/${y.y27}/close`, 'admin').expect(409);
    });
    it('los reportes siguen mostrando el año cerrado y el balance cuadra', async () => {
      const is = (await api('get', '/reports/income-statement?from=2027-01-01&to=2027-12-31', 'view').expect(200)).body;
      expect([num(is.totalIncome), num(is.totalExpenses), num(is.netIncome)]).toEqual([10000, 5500, 4500]);
      const bs = await balance('2027-12-31');
      expect([num(bs.totalAssets), num(bs.totalEquity)]).toEqual([56500, 56500]);
      expect([num(bs.netIncomeOfPeriod), num(bs.netIncomePriorPeriods), bs.balanced]).toEqual([0, 0, true]);
      expect(bs.equity.map((l: any) => [l.code, num(l.amount)])).toEqual([['3101', 52000], ['3201', 4500]]);
      // antes del asiento de cierre el resultado aparece como "del período", sin duplicarse
      const mid = await balance('2027-06-30');
      expect([num(mid.netIncomeOfPeriod), num(mid.totalAssets), num(mid.totalEquity), mid.balanced]).toEqual([4500, 56500, 56500, true]);
    });
    it('presupuesto vs real no se anula por el asiento de cierre', async () => {
      const b = (await api('post', '/budgets', 'acct').send({ name: 'P2027', year: 2027 }).expect(201)).body;
      await api('put', `/budgets/${b.id}/lines`, 'acct').send({ lines: [{ accountId: acc.ventas, month: 3, plannedAmount: 9000 }] }).expect(200);
      const v = (await api('get', `/budgets/${b.id}/vs-actual`, 'view').expect(200)).body;
      expect([num(v.totals.income.actual), num(v.totals.expense.actual)]).toEqual([10000, 5500]);
    });
    it('el servicio de posteo (facturas, pagos, tesorería) también respeta el año cerrado', async () => {
      const posting = app.get(PostingService, { strict: false });
      const user = { id: userId.admin, email: email('admin'), role: UserRole.ADMIN, companyId };
      const post = (date: string) =>
        prisma.$transaction((tx) =>
          posting.post(tx, user, {
            date: new Date(date), description: 'x', journalType: 'GENERAL', sourceType: 'MANUAL',
            lines: [
              { accountId: acc.banco, debit: new Prisma.Decimal(10), credit: new Prisma.Decimal(0) },
              { accountId: acc.ventas, debit: new Prisma.Decimal(0), credit: new Prisma.Decimal(10) },
            ],
          }),
        );
      await expect(post('2027-11-01T12:00:00Z')).rejects.toThrow(/cerrado/); // período cerrado
      await expect(post('2026-05-01T12:00:00Z')).rejects.toThrow(/año fiscal "2026" está cerrado/); // sin períodos
    });
    it('el año cerrado protege su contabilidad', async () => {
      const r = await entry('2027-11-01', 'banco', 'ventas', 100).expect(422);
      expect(r.body.message).toMatch(/cerrado/);
      const e = (await closingEntry(y.y27))!;
      const v = await api('post', `/accounting/journal-entries/${e.id}/void`, 'appr').send({ reason: 'probando' }).expect(422);
      expect(v.body.message).toMatch(/reabriendo el año/);
      const year = (await api('get', `/fiscal-years/${y.y27}`, 'view').expect(200)).body;
      await api('post', `/accounting/fiscal-periods/${year.periods[0].id}/reopen`, 'admin').expect(409);
    });
  });

  describe('2028: cierres simultáneos y reapertura', () => {
    it('cierre simultáneo: gana uno y queda un solo asiento de cierre', async () => {
      await entry('2028-02-01', 'banco', 'ventas', 2000).expect(201);
      const rs = await Promise.all([1, 2, 3, 4].map(() => api('post', `/fiscal-years/${y.y28}/close`, 'admin')));
      expect(rs.filter((r) => r.status === 201)).toHaveLength(1);
      expect(rs.filter((r) => r.status === 409)).toHaveLength(3);
      const e = (await closingEntry(y.y28))!;
      expect(linesOf(e)).toEqual({ [acc.ventas]: [2000, 0], [acc.util]: [0, 2000] });
      expect(await prisma.journalEntry.count({ where: { companyId, type: 'CLOSING', status: 'POSTED' } })).toBe(2);
      const bs = await balance('2028-12-31');
      expect([num(bs.totalAssets), num(bs.totalEquity), bs.balanced]).toEqual([58500, 58500, true]);
    });
    it('reabrir: orden, rol, motivo, y deja todo editable otra vez', async () => {
      await api('post', `/fiscal-years/${y.y27}/reopen`, 'admin').send({ reason: 'ajuste' }).expect(409); // 2028 sigue cerrado
      await api('post', `/fiscal-years/${y.y28}/reopen`, 'acct').send({ reason: 'x' }).expect(403);
      await api('post', `/fiscal-years/${y.y28}/reopen`, 'admin').send({}).expect(400);
      const before = (await prisma.fiscalYear.findUniqueOrThrow({ where: { id: y.y28 } })).closingEntryId!;
      const r = await api('post', `/fiscal-years/${y.y28}/reopen`, 'admin').send({ reason: 'faltaba una factura' }).expect(201);
      expect(r.body).toMatchObject({ status: 'OPEN', closingEntryId: null });
      expect(r.body.periods.every((p: any) => p.status === 'OPEN')).toBe(true);
      const old = await prisma.journalEntry.findUniqueOrThrow({ where: { id: before } });
      expect(old.status).toBe('VOIDED');
      expect(old.voidReason).toMatch(/Reapertura.*faltaba una factura/);
      await api('post', `/fiscal-years/${y.y28}/reopen`, 'admin').send({ reason: 'otra vez' }).expect(409);

      // con el año abierto el resultado vuelve a verse como "del período" y el balance sigue cuadrando
      const bs = await balance('2028-12-31');
      expect([num(bs.netIncomeOfPeriod), num(bs.totalAssets), num(bs.totalEquity), bs.balanced]).toEqual([2000, 58500, 58500, true]);
      await entry('2028-03-01', 'banco', 'ventas', 500).expect(201);
    });
    it('vuelve a cerrar con el movimiento nuevo', async () => {
      const r = await api('post', `/fiscal-years/${y.y28}/close`, 'admin').expect(201);
      expect(num(r.body.netResult)).toBe(2500);
      expect(linesOf((await closingEntry(y.y28))!)).toEqual({ [acc.ventas]: [2500, 0], [acc.util]: [0, 2500] });
      const bs = await balance('2028-12-31');
      expect([num(bs.totalAssets), num(bs.totalEquity), bs.balanced]).toEqual([59000, 59000, true]);
    });
    it('reabre en orden inverso y 2027 puede cerrarse de nuevo', async () => {
      await api('post', `/fiscal-years/${y.y28}/reopen`, 'admin').send({ reason: 'orden' }).expect(201);
      await api('post', `/fiscal-years/${y.y27}/reopen`, 'admin').send({ reason: 'orden' }).expect(201);
      expect(await closingEntry(y.y27)).toBeNull();
      const bs = await balance('2027-12-31');
      expect([num(bs.netIncomeOfPeriod), bs.balanced]).toEqual([4500, true]);
      await api('post', `/fiscal-years/${y.y27}/close`, 'admin').expect(201);
      expect(linesOf((await closingEntry(y.y27))!)[acc.util]).toEqual([0, 4500]);
    });
  });

  describe('aislamiento y auditoría', () => {
    it('otra empresa no ve ni toca los años', async () => {
      expect((await api('get', '/fiscal-years', 'adminb').expect(200)).body).toHaveLength(0);
      await api('get', `/fiscal-years/${y.y27}`, 'adminb').expect(404);
      await api('get', `/fiscal-years/${y.y27}/closing-preview`, 'adminb').expect(404);
      await api('post', `/fiscal-years/${y.y27}/close`, 'adminb').expect(404);
      await api('post', `/fiscal-years/${y.y27}/reopen`, 'adminb').send({ reason: 'x' }).expect(404);
    });
    it('queda en el AuditLog', async () => {
      const acts = await prisma.auditLog.findMany({ where: { companyId, entityName: 'FiscalYear' } });
      expect(acts.filter((a) => a.action === 'CLOSE').length).toBeGreaterThanOrEqual(4);
      expect(acts.some((a) => (a.changes as any)?.action === 'REOPEN')).toBe(true);
    });
  });
});