import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Montos conocidos (empresa A), para poder verificar cada saldo a mano:
 *   E1 05-ene  Caja Dr 1000 / Ventas Cr 1000
 *   E2 10-ene  Gastos Dr 300 / Caja Cr 300   (hora 18:00Z: tiene que entrar en `to=2027-01-10`)
 *   E3 01-feb  Caja Dr 500 / Ventas Cr 500
 *   E4 03-feb  Banco Dr 200 / Caja Cr 200
 *   E5 05-feb  Caja Dr 999 / Ventas Cr 999   -> ANULADO, no debe aparecer en nada
 *   E6 07-ene  Banco Dr 50 / Caja Cr 50      (capturado al final: atrasado, debe ir en su fecha)
 *
 * Caja en orden cronológico: 1000, 950, 650, 1150, 950.
 */
describe('Reportes: libro diario y mayor general (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `rep-${r}-${sfx}@test.local`;

  let companyA: string;
  let companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let accB: string;

  const get = (url: string, who: string) =>
    request(app.getHttpServer())
      .get(url)
      .set('Authorization', `Bearer ${token[who]}`);

  const postEntry = (
    date: string,
    description: string,
    debitAcc: string,
    creditAcc: string,
    amount: number,
  ) =>
    request(app.getHttpServer())
      .post('/accounting/journal-entries')
      .set('Authorization', `Bearer ${token.admin}`)
      .send({
        date,
        description,
        lines: [
          { accountId: debitAcc, debit: amount },
          { accountId: creditAcc, credit: amount },
        ],
      })
      .expect(201);

  const n = (x: unknown) => Number(x);

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);

    const hash = await bcrypt.hash(password, 4);
    const a = await prisma.company.create({
      data: { name: `Rep A ${sfx}`, taxId: `REP-A-${sfx}` },
    });
    const b = await prisma.company.create({
      data: { name: `Rep B ${sfx}`, taxId: `REP-B-${sfx}` },
    });
    companyA = a.id;
    companyB = b.id;

    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA],
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

    const mk = async (code: string, name: string, type: 'ASSET' | 'INCOME' | 'EXPENSE') =>
      (
        await prisma.account.create({
          data: { companyId: companyA, code, name, type },
        })
      ).id;
    acc.caja = await mk('1101', 'Caja', 'ASSET');
    acc.banco = await mk('1102', 'Banco', 'ASSET');
    acc.ventas = await mk('4101', 'Ventas', 'INCOME');
    acc.gastos = await mk('5101', 'Gastos', 'EXPENSE');
    accB = (
      await prisma.account.create({
        data: { companyId: companyB, code: '1101', name: 'Caja B', type: 'ASSET' },
      })
    ).id;

    await postEntry('2027-01-05', 'Venta 1', acc.caja, acc.ventas, 1000);
    await postEntry('2027-01-10T18:00:00Z', 'Gasto 1', acc.gastos, acc.caja, 300);
    await postEntry('2027-02-01', 'Venta 2', acc.caja, acc.ventas, 500);
    await postEntry('2027-02-03', 'Depósito', acc.banco, acc.caja, 200);
    const e5 = await postEntry('2027-02-05', 'Venta anulada', acc.caja, acc.ventas, 999);
    await request(app.getHttpServer())
      .post(`/accounting/journal-entries/${e5.body.id}/void`)
      .set('Authorization', `Bearer ${token.admin}`)
      .send({ reason: 'Error de captura' })
      .expect(201);
    await postEntry('2027-01-07', 'Retiro atrasado', acc.banco, acc.caja, 50);
  });

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    await prisma.journalEntryLine.deleteMany({
      where: { journalEntry: { companyId: { in: ids } } },
    });
    await prisma.journalEntry.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.account.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  // ------------------------------------------------------------------
  describe('libro diario', () => {
    it('orden cronológico por fecha del asiento (el atrasado va en su lugar) y sin anulados', async () => {
      const res = await get('/reports/journal-book', 'view').expect(200);
      expect(res.body.data.map((e: any) => e.description)).toEqual([
        'Venta 1',
        'Retiro atrasado',
        'Gasto 1',
        'Venta 2',
        'Depósito',
      ]);
      expect(res.body.total).toBe(5);
    });

    it('totales de débito y crédito cuadran, por asiento y en general', async () => {
      const res = await get('/reports/journal-book', 'view').expect(200);
      expect(n(res.body.totalDebit)).toBe(2050);
      expect(n(res.body.totalCredit)).toBe(2050);
      for (const e of res.body.data) {
        expect(n(e.totalDebit)).toBe(n(e.totalCredit));
      }
    });

    it('cada línea trae código y nombre de la cuenta, con el "debe" primero', async () => {
      const res = await get('/reports/journal-book?limit=1', 'view').expect(200);
      const [first, second] = res.body.data[0].lines;
      expect(first).toMatchObject({ code: '1101', name: 'Caja' });
      expect(n(first.debit)).toBe(1000);
      expect(second).toMatchObject({ code: '4101', name: 'Ventas' });
      expect(n(second.credit)).toBe(1000);
    });

    it('rango inclusivo: `to=2027-01-10` incluye el asiento de las 18:00Z de ese día', async () => {
      const res = await get('/reports/journal-book?to=2027-01-10', 'view').expect(200);
      expect(res.body.data.map((e: any) => e.description)).toEqual([
        'Venta 1',
        'Retiro atrasado',
        'Gasto 1',
      ]);
      expect(n(res.body.totalDebit)).toBe(1350);
    });

    it('rango con from y to', async () => {
      const res = await get('/reports/journal-book?from=2027-02-01&to=2027-02-28', 'view').expect(200);
      expect(res.body.data.map((e: any) => e.description)).toEqual(['Venta 2', 'Depósito']);
      expect(n(res.body.totalDebit)).toBe(700);
    });

    it('paginación: sin repetir ni saltar asientos, y los totales son del rango completo', async () => {
      const seen: string[] = [];
      for (const page of [1, 2, 3]) {
        const res = await get(`/reports/journal-book?limit=2&page=${page}`, 'view').expect(200);
        expect(res.body.total).toBe(5);
        expect(n(res.body.totalDebit)).toBe(2050);
        seen.push(...res.body.data.map((e: any) => e.description));
      }
      expect(seen).toEqual(['Venta 1', 'Retiro atrasado', 'Gasto 1', 'Venta 2', 'Depósito']);
    });

    it('400 con fechas al revés, límite fuera de rango o página 0', async () => {
      await get('/reports/journal-book?from=2027-03-01&to=2027-01-01', 'view').expect(400);
      await get('/reports/journal-book?limit=101', 'view').expect(400);
      await get('/reports/journal-book?page=0', 'view').expect(400);
      await get('/reports/journal-book?from=no-es-fecha', 'view').expect(400);
    });
  });

  // ------------------------------------------------------------------
  describe('mayor general (resumen)', () => {
    const line = (body: any, code: string) => body.lines.find((l: any) => l.code === code);

    it('sin rango: saldos finales por naturaleza de la cuenta', async () => {
      const res = await get('/reports/general-ledger', 'view').expect(200);
      const caja = line(res.body, '1101');
      expect(caja).toMatchObject({ nature: 'DEBIT', type: 'ASSET' });
      expect([n(caja.openingBalance), n(caja.debit), n(caja.credit), n(caja.closingBalance)]).toEqual([0, 1500, 550, 950]);

      const ventas = line(res.body, '4101');
      expect(ventas.nature).toBe('CREDIT');
      // Ingreso: el saldo sale positivo del lado crédito (1000 + 500; el anulado no cuenta)
      expect(n(ventas.closingBalance)).toBe(1500);

      expect(n(line(res.body, '5101').closingBalance)).toBe(300);
      expect(n(line(res.body, '1102').closingBalance)).toBe(250);
      expect(n(res.body.totalDebit)).toBe(2050);
      expect(n(res.body.totalCredit)).toBe(2050);
    });

    it('con `from`: saldo inicial = todo lo anterior; cuentas sin movimiento pero con saldo siguen apareciendo', async () => {
      const res = await get('/reports/general-ledger?from=2027-02-01', 'view').expect(200);
      const caja = line(res.body, '1101');
      expect([n(caja.openingBalance), n(caja.debit), n(caja.credit), n(caja.closingBalance)]).toEqual([650, 500, 200, 950]);

      const ventas = line(res.body, '4101');
      expect([n(ventas.openingBalance), n(ventas.credit), n(ventas.closingBalance)]).toEqual([1000, 500, 1500]);

      const gastos = line(res.body, '5101'); // sin movimiento en febrero, pero arrastra 300
      expect([n(gastos.openingBalance), n(gastos.debit), n(gastos.closingBalance)]).toEqual([300, 0, 300]);

      const banco = line(res.body, '1102');
      expect([n(banco.openingBalance), n(banco.debit), n(banco.closingBalance)]).toEqual([50, 200, 250]);
    });

    it('rango cerrado en enero: solo cuentas con actividad hasta esa fecha', async () => {
      const res = await get('/reports/general-ledger?to=2027-01-31', 'view').expect(200);
      expect(n(line(res.body, '1101').closingBalance)).toBe(650);
      expect(n(line(res.body, '4101').closingBalance)).toBe(1000);
      expect(n(res.body.totalDebit)).toBe(1350);
    });

    it('consistente con la balanza de comprobación (mismos saldos por cuenta)', async () => {
      const ledger = await get('/reports/general-ledger', 'view').expect(200);
      const tb = await get('/accounting/trial-balance', 'view').expect(200);
      expect(ledger.body.lines).toHaveLength(tb.body.lines.length);
      for (const l of ledger.body.lines) {
        const t = tb.body.lines.find((x: any) => x.code === l.code);
        const expected = l.nature === 'DEBIT' ? n(t.balance) : -n(t.balance);
        expect(n(l.closingBalance)).toBeCloseTo(expected, 4);
      }
    });

    it('cada línea trae accountId, que es la llave para bajar al detalle', async () => {
      const res = await get('/reports/general-ledger', 'view').expect(200);
      expect(line(res.body, '1101').accountId).toBe(acc.caja);
    });
  });

  // ------------------------------------------------------------------
  describe('mayor general (detalle de una cuenta) y drill-down', () => {
    it('movimientos en orden cronológico con saldo corrido; el anulado no aparece', async () => {
      const res = await get(`/reports/general-ledger/${acc.caja}`, 'view').expect(200);
      expect(res.body.account).toMatchObject({ code: '1101', nature: 'DEBIT' });
      expect(res.body.movements.map((m: any) => m.description)).toEqual([
        'Venta 1',
        'Retiro atrasado',
        'Gasto 1',
        'Venta 2',
        'Depósito',
      ]);
      expect(res.body.movements.map((m: any) => n(m.balance))).toEqual([1000, 950, 650, 1150, 950]);
      expect(n(res.body.openingBalance)).toBe(0);
      expect(n(res.body.totalDebit)).toBe(1500);
      expect(n(res.body.totalCredit)).toBe(550);
      expect(n(res.body.closingBalance)).toBe(950);
      expect(res.body.total).toBe(5);
    });

    it('con `from`: parte del saldo inicial y el saldo final coincide con el último movimiento', async () => {
      const res = await get(`/reports/general-ledger/${acc.caja}?from=2027-02-01`, 'view').expect(200);
      expect(n(res.body.openingBalance)).toBe(650);
      expect(res.body.movements.map((m: any) => n(m.balance))).toEqual([1150, 950]);
      expect(n(res.body.closingBalance)).toBe(950);
    });

    it('el saldo corrido NO se reinicia al paginar', async () => {
      const balances: number[] = [];
      for (const page of [1, 2, 3]) {
        const res = await get(`/reports/general-ledger/${acc.caja}?limit=2&page=${page}`, 'view').expect(200);
        expect(res.body.total).toBe(5);
        balances.push(...res.body.movements.map((m: any) => n(m.balance)));
      }
      expect(balances).toEqual([1000, 950, 650, 1150, 950]);
    });

    it('cuenta de naturaleza crédito: el saldo corrido sube con los créditos', async () => {
      const res = await get(`/reports/general-ledger/${acc.ventas}`, 'view').expect(200);
      expect(res.body.account.nature).toBe('CREDIT');
      expect(res.body.movements.map((m: any) => n(m.balance))).toEqual([1000, 1500]);
      expect(n(res.body.closingBalance)).toBe(1500);
    });

    it('el detalle suma exactamente lo que dice el resumen', async () => {
      const summary = await get('/reports/general-ledger?from=2027-01-06&to=2027-02-04', 'view').expect(200);
      for (const l of summary.body.lines) {
        const d = await get(`/reports/general-ledger/${l.accountId}?from=2027-01-06&to=2027-02-04`, 'view').expect(200);
        expect(n(d.body.openingBalance)).toBeCloseTo(n(l.openingBalance), 4);
        expect(n(d.body.totalDebit)).toBeCloseTo(n(l.debit), 4);
        expect(n(d.body.totalCredit)).toBeCloseTo(n(l.credit), 4);
        expect(n(d.body.closingBalance)).toBeCloseTo(n(l.closingBalance), 4);
      }
    });

    it('DRILL-DOWN: de un movimiento se llega al asiento completo', async () => {
      const ledger = await get(`/reports/general-ledger/${acc.caja}`, 'view').expect(200);
      const first = ledger.body.movements[0];
      const entry = await get(`/accounting/journal-entries/${first.entryId}`, 'view').expect(200);
      expect(entry.body.description).toBe('Venta 1');
      const cajaLine = entry.body.lines.find((l: any) => l.accountId === acc.caja);
      expect(n(cajaLine.debit)).toBe(n(first.debit));
    });
  });

  // ------------------------------------------------------------------
  describe('seguridad y aislamiento', () => {
    it('401 sin token en los tres reportes', async () => {
      for (const url of [
        '/reports/journal-book',
        '/reports/general-ledger',
        `/reports/general-ledger/${acc.caja}`,
      ]) {
        await request(app.getHttpServer()).get(url).expect(401);
      }
    });

    it('la empresa B no ve nada de A en ningún reporte', async () => {
      const book = await get('/reports/journal-book', 'adminb').expect(200);
      expect(book.body.total).toBe(0);
      expect(n(book.body.totalDebit)).toBe(0);
      const summary = await get('/reports/general-ledger', 'adminb').expect(200);
      expect(summary.body.lines).toEqual([]);
    });

    it('404 al pedir el mayor de una cuenta de OTRA empresa (en ambos sentidos)', async () => {
      await get(`/reports/general-ledger/${acc.caja}`, 'adminb').expect(404);
      await get(`/reports/general-ledger/${accB}`, 'admin').expect(404);
    });

    it('400 con accountId que no es UUID y con fechas al revés', async () => {
      await get('/reports/general-ledger/no-es-uuid', 'view').expect(400);
      await get(`/reports/general-ledger/${acc.caja}?from=2027-03-01&to=2027-01-01`, 'view').expect(400);
      await get(`/reports/general-ledger/${acc.caja}?limit=501`, 'view').expect(400);
    });
  });
});