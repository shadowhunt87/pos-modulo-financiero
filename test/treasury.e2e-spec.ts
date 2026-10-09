import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

describe('Tesorería (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `tre-${r}-${sfx}@test.local`;
  let companyA: string;
  let companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let bankId: string;
  let cashId: string;
  let recId: string;
  const e: Record<string, { id: string; lineId: string }> = {};

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const num = (v: unknown) => Number(v);

  // Asiento manual vía API de contabilidad; devuelve el id de la línea del banco
  const entry = async (key: string, date: string, description: string, reference: string, debit: string, credit: string, amount: number) => {
    const res = await api('post', '/accounting/journal-entries', 'acct').send({
      date, description, reference, lines: [{ accountId: acc[debit], debit: amount }, { accountId: acc[credit], credit: amount }],
    }).expect(201);
    const line = res.body.lines.find((l: { accountId: string }) => l.accountId === acc.banco);
    e[key] = { id: res.body.id, lineId: line?.id };
  };
  const txs = async (qs = '') => (await api('get', `/bank-accounts/${bankId}/transactions?limit=200${qs}`, 'view').expect(200)).body;

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `T A ${sfx}`, taxId: `T-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `T B ${sfx}`, taxId: `T-B-${sfx}` } })).id;
    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['appr', UserRole.APPROVER, companyA],
      ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ];
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type } })).id);
    await mk('banco', '1102', 'ASSET'); await mk('caja', '1101', 'ASSET'); await mk('banco2', '1103', 'ASSET');
    await mk('ventas', '4101', 'INCOME'); await mk('gastos', '5101', 'EXPENSE');
    await mk('gastosBanc', '5201', 'EXPENSE'); await mk('ingFin', '4201', 'INCOME');
    await api('post', '/journals/defaults', 'admin').expect(201);
    await entry('E1', '2027-03-02', 'Depósito cliente A', 'DEP-001', 'banco', 'ventas', 1000);
    await entry('E2', '2027-03-05', 'Depósito cliente B', 'DEP-002', 'banco', 'ventas', 500);
    await entry('E3', '2027-03-10', 'Cheque proveedor', 'CHK-1001', 'gastos', 'banco', 300);
    await entry('E4', '2027-03-31', 'Depósito en tránsito', 'DEP-003', 'banco', 'ventas', 200);
  });

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.bankMatch.deleteMany({ where: { bankTransaction: { bankAccount: where } } });
    await prisma.bankTransaction.deleteMany({ where: { bankAccount: where } });
    await prisma.bankReconciliation.deleteMany({ where });
    await prisma.bankRule.deleteMany({ where });
    await prisma.bankAccount.deleteMany({ where });
    await prisma.cashRegister.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('cuentas y cajas', () => {
    it('solo ADMIN crea; la cuenta contable debe ser un activo libre', async () => {
      const body = (over = {}) => ({ bankName: 'Banco X', accountNumber: '001', glAccountId: acc.banco, ...over });
      await api('post', '/bank-accounts', 'acct').send(body()).expect(403);
      await api('post', '/bank-accounts', 'admin').send(body({ glAccountId: acc.ventas })).expect(422);
      bankId = (await api('post', '/bank-accounts', 'admin').send(body()).expect(201)).body.id;
      await api('post', '/bank-accounts', 'admin').send(body({ accountNumber: '002' })).expect(409);
    });
    it('crea una caja con su cuenta contable', async () => {
      cashId = (await api('post', '/cash-registers', 'admin').send({ name: 'Caja chica', glAccountId: acc.caja }).expect(201)).body.id;
      const list = (await api('get', '/cash-registers', 'view').expect(200)).body;
      expect(list).toHaveLength(1);
    });
    it('otra empresa no ve la cuenta', async () => {
      await api('get', `/bank-accounts/${bankId}`, 'adminb').expect(404);
    });
  });

  describe('importación de extractos', () => {
    const csv = [
      'Fecha,Descripcion,Debito,Credito,Referencia',
      '02/03/2027,DEPOSITO CLIENTE,,1000.00,DEP-001',
      '05/03/2027,DEPOSITO CLIENTE,,"500.00",DEP-002',
      '15/03/2027,COMISION BANCARIA,25.00,,',
      '20/03/2027,INTERES GANADO,,10.00,',
    ].join('\n');

    it('importa un CSV (fechas dd/mm/aaaa, débito/crédito) y re-importar no duplica', async () => {
      const r1 = (await api('post', `/bank-accounts/${bankId}/import`, 'acct').send({ csv }).expect(201)).body;
      expect([r1.total, r1.imported, r1.skipped]).toEqual([4, 4, 0]);
      const r2 = (await api('post', `/bank-accounts/${bankId}/import`, 'acct').send({ csv }).expect(201)).body;
      expect([r2.imported, r2.skipped]).toEqual([0, 4]);
      const list = await txs();
      expect(list.total).toBe(4);
      expect(list.data.map((t: { amount: string }) => num(t.amount)).sort((a: number, b: number) => a - b)).toEqual([-25, 10, 500, 1000]);
    });
    it('todo o nada: una fila inválida no importa nada', async () => {
      const bad = 'Fecha,Descripcion,Monto\n01/04/2027,OK,10\n99/99/2027,MAL,10';
      const res = await api('post', `/bank-accounts/${bankId}/import`, 'acct').send({ csv: bad }).expect(422);
      expect(res.body.totalErrors).toBe(1);
      expect((await txs()).total).toBe(4);
    });
    it('400 si se envían csv y rows a la vez; VIEWER no importa', async () => {
      await api('post', `/bank-accounts/${bankId}/import`, 'acct').send({ csv, rows: [{ date: '2027-03-01', description: 'x', amount: 1 }] }).expect(400);
      await api('post', `/bank-accounts/${bankId}/import`, 'view').send({ csv }).expect(403);
    });
  });

  describe('reglas y categorización', () => {
    it('las reglas crean el asiento de comisiones e intereses', async () => {
      await api('post', '/bank-rules', 'acct').send({ name: 'Comisión', matchText: 'COMISION', accountId: acc.gastosBanc }).expect(403);
      await api('post', '/bank-rules', 'admin').send({ name: 'Comisión', matchText: 'COMISION', accountId: acc.gastosBanc }).expect(201);
      await api('post', '/bank-rules', 'admin').send({ name: 'Intereses', matchText: 'interes', accountId: acc.ingFin }).expect(201);
      const res = (await api('post', `/bank-accounts/${bankId}/apply-rules`, 'acct').expect(201)).body;
      expect(res.categorized).toBe(2);
      const fee = (await txs('&q=COMISION')).data[0];
      expect(fee.status).toBe('MATCHED');
      const match = await prisma.bankMatch.findFirstOrThrow({ where: { bankTransactionId: fee.id }, include: { journalEntryLine: { include: { journalEntry: { include: { lines: true } } } } } });
      const lines = match.journalEntryLine.journalEntry.lines.map((l) => ({ a: l.accountId, d: num(l.debit), c: num(l.credit) }));
      expect(lines).toEqual(expect.arrayContaining([{ a: acc.gastosBanc, d: 25, c: 0 }, { a: acc.banco, d: 0, c: 25 }]));
    });
  });

  describe('conciliación bancaria', () => {
    it('sugiere y enlaza los depósitos de monto exacto', async () => {
      const sug = (await api('get', `/bank-accounts/${bankId}/suggestions`, 'view').expect(200)).body;
      expect(sug).toHaveLength(2);
      expect(sug.every((s: { candidates: unknown[] }) => s.candidates.length === 1)).toBe(true);
      const auto = (await api('post', `/bank-accounts/${bankId}/auto-match`, 'acct').expect(201)).body;
      expect(auto).toMatchObject({ matched: 2, ambiguous: 0 });
      expect((await txs('&status=PENDING')).total).toBe(0);
    });

    it('con un saldo de extracto equivocado muestra la diferencia y no se puede completar', async () => {
      const bad = (await api('post', '/bank-reconciliations', 'acct').send({ bankAccountId: bankId, statementDate: '2027-03-31', statementBalance: 1400 }).expect(201)).body;
      expect(num(bad.summary.difference)).toBe(-85);
      expect(bad.summary.canComplete).toBe(false);
      await api('post', `/bank-reconciliations/${bad.id}/complete`, 'appr').expect(422);
      await api('delete', `/bank-reconciliations/${bad.id}`, 'acct').expect(200);
    });

    it('con el saldo correcto cuadra: depósito en tránsito y cheque pendiente', async () => {
      const rec = (await api('post', '/bank-reconciliations', 'acct').send({ bankAccountId: bankId, statementDate: '2027-03-31', statementBalance: 1485 }).expect(201)).body;
      recId = rec.id;
      const s = rec.summary;
      expect([num(s.bookBalance), num(s.difference), s.canComplete]).toEqual([1385, 0, true]);
      expect(s.depositsInTransit.map((x: { amount: string }) => num(x.amount))).toEqual([200]);
      expect(s.outstandingPayments.map((x: { amount: string }) => num(x.amount))).toEqual([-300]);
    });

    it('ACCOUNTANT prepara pero no cierra; APPROVER completa y los asientos quedan protegidos', async () => {
      await api('post', `/bank-reconciliations/${recId}/complete`, 'acct').expect(403);
      const done = (await api('post', `/bank-reconciliations/${recId}/complete`, 'appr').expect(201)).body;
      expect(done).toMatchObject({ status: 'COMPLETED', reconciledTransactions: 4 });
      expect((await txs('&status=RECONCILED')).total).toBe(4);
      await api('post', `/accounting/journal-entries/${e.E1.id}/void`, 'appr').send({ reason: 'x' }).expect(422);
      await api('post', '/bank-reconciliations', 'acct').send({ bankAccountId: bankId, statementDate: '2027-03-15', statementBalance: 0 }).expect(422);
    });

    it('reabrir libera los movimientos y los asientos; se puede volver a completar', async () => {
      await api('post', `/bank-reconciliations/${recId}/reopen`, 'acct').expect(403);
      await api('post', `/bank-reconciliations/${recId}/reopen`, 'admin').expect(201);
      expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: e.E1.id } })).reconciled).toBe(false);
      expect((await txs('&status=MATCHED')).total).toBe(4);
      await api('post', `/bank-reconciliations/${recId}/complete`, 'appr').expect(201);
      expect((await prisma.journalEntry.findUniqueOrThrow({ where: { id: e.E1.id } })).reconciled).toBe(true);
    });
  });

  describe('enlaces manuales, ignorados y transferencias', () => {
    let big: string;
    it('un depósito del banco puede cubrir varios asientos (deben sumar exacto)', async () => {
      await entry('E5', '2027-04-01', 'Cobro 1', 'C-1', 'banco', 'ventas', 400);
      await entry('E6', '2027-04-01', 'Cobro 2', 'C-2', 'banco', 'ventas', 300);
      big = (await api('post', `/bank-accounts/${bankId}/transactions`, 'acct').send({ date: '2027-04-02', description: 'DEPOSITO AGRUPADO', amount: 700 }).expect(201)).body.id;
      await api('post', `/bank-transactions/${big}/match`, 'acct').send({ journalEntryLineIds: [e.E5.lineId] }).expect(422);
      await api('post', `/bank-transactions/${big}/match`, 'acct').send({ journalEntryLineIds: [e.E5.lineId, e.E6.lineId] }).expect(201);
      expect((await txs('&q=AGRUPADO')).data[0].status).toBe('MATCHED');
      await api('post', `/bank-transactions/${big}/unmatch`, 'acct').expect(201);
      expect((await txs('&q=AGRUPADO')).data[0].status).toBe('PENDING');
      await api('post', `/bank-transactions/${big}/match`, 'acct').send({ journalEntryLineIds: [e.E5.lineId, e.E6.lineId] }).expect(201);
    });
    it('una línea ya conciliada no se reutiliza; los movimientos se pueden ignorar y restaurar', async () => {
      const dup = (await api('post', `/bank-accounts/${bankId}/transactions`, 'acct').send({ date: '2027-04-03', description: 'DUPLICADO', amount: 400 }).expect(201)).body.id;
      await api('post', `/bank-transactions/${dup}/match`, 'acct').send({ journalEntryLineIds: [e.E5.lineId] }).expect(422);
      expect((await api('post', `/bank-transactions/${dup}/ignore`, 'acct').expect(201)).body.status).toBe('IGNORED');
      expect((await api('post', `/bank-transactions/${dup}/restore`, 'acct').expect(201)).body.status).toBe('PENDING');
      await api('post', `/bank-transactions/${big}/ignore`, 'acct').expect(422);
    });
    it('transferencia banco → caja mueve los saldos del mayor', async () => {
      const t = { fromType: 'BANK', fromId: bankId, toType: 'CASH', toId: cashId, amount: 100, date: '2027-04-05' };
      await api('post', '/treasury/transfers', 'acct').send({ ...t, toType: 'BANK', toId: bankId }).expect(400);
      await api('post', '/treasury/transfers', 'acct').send(t).expect(201);
      const bank = (await api('get', `/bank-accounts/${bankId}`, 'view').expect(200)).body;
      expect(num(bank.glBalance)).toBe(1985); // 1385 + 400 + 300 - 100
      expect(bank.pendingTransactions).toBe(1);
      const cash = (await api('get', '/cash-registers', 'view').expect(200)).body[0];
      expect(num(cash.glBalance)).toBe(100);
    });
  });
});