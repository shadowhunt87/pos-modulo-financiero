import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Razones financieras con montos conocidos (calculados a mano).
 * Apertura 31-dic-2029: Activo 200,000 (AC 100,000) | Pasivo 100,000 (PC 40,000) | Patrimonio 100,000.
 * T1 2030 (90 días): ventas 90,000, costo 48,000, gastos op 12,000, deprec. 3,000, intereses 2,000,
 * otros ingresos 1,000, ISR 4,000 => utilidad neta 22,000. Cierre: Activo 242,000 | Pasivo 120,000 | Patrimonio 122,000.
 */
describe('Razones financieras (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `fr-${r}-${sfx}@test.local`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const entry = (date: string, description: string, lines: [string, number, number][]) =>
    api('post', '/accounting/journal-entries', 'admin').send({
      date, description,
      lines: lines.map(([a, debit, credit]) => ({ accountId: acc[a], ...(debit ? { debit } : { credit }) })),
    }).expect(201);
  const ratios = async (from: string, to: string, who = 'view') =>
    (await api('get', `/reports/financial-ratios?from=${from}&to=${to}`, who).expect(200)).body;
  const val = (body: { ratios: { key: string; value: string | null }[] }, key: string) => {
    const r = body.ratios.find((x) => x.key === key);
    expect(r).toBeDefined();
    return r!.value === null ? null : Number(r!.value);
  };

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `FR A ${sfx}`, taxId: `2${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '1')}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `FR B ${sfx}`, taxId: `1${sfx.padStart(8, '0').slice(-8).replace(/\D/g, '2')}` } })).id;
    for (const [r, role, companyId] of [['admin', UserRole.ADMIN, companyA], ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB]] as const) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE', category: string | null) =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type, category: category as never } })).id);
    await mk('caja', '1101', 'ASSET', 'CASH_AND_EQUIVALENTS');
    await mk('cxc', '1201', 'ASSET', 'ACCOUNTS_RECEIVABLE');
    await mk('inv', '1301', 'ASSET', 'INVENTORY');
    await mk('prepago', '1401', 'ASSET', 'PREPAID_AND_OTHER_CURRENT_ASSETS');
    await mk('equipos', '1501', 'ASSET', 'PROPERTY_PLANT_EQUIPMENT');
    await mk('cxp', '2101', 'LIABILITY', 'ACCOUNTS_PAYABLE');
    await mk('prestCorto', '2201', 'LIABILITY', 'SHORT_TERM_DEBT');
    await mk('prestLargo', '2301', 'LIABILITY', 'LONG_TERM_DEBT');
    await mk('capital', '3101', 'EQUITY', 'SHARE_CAPITAL');
    await mk('utilAcum', '3201', 'EQUITY', 'RETAINED_EARNINGS');
    await mk('ventas', '4101', 'INCOME', 'OPERATING_REVENUE');
    await mk('otrosIng', '4201', 'INCOME', 'OTHER_REVENUE');
    await mk('costo', '5101', 'EXPENSE', 'COST_OF_SALES');
    await mk('gastoOp', '5201', 'EXPENSE', 'OPERATING_EXPENSE');
    await mk('deprec', '5301', 'EXPENSE', 'DEPRECIATION_AMORTIZATION');
    await mk('interes', '5401', 'EXPENSE', 'FINANCE_COST');
    await mk('isr', '5501', 'EXPENSE', 'INCOME_TAX');
    await mk('sinCat', '5601', 'EXPENSE', null);

    await entry('2029-12-31', 'Apertura', [
      ['caja', 50000, 0], ['cxc', 30000, 0], ['inv', 20000, 0], ['equipos', 100000, 0],
      ['cxp', 0, 25000], ['prestCorto', 0, 15000], ['prestLargo', 0, 60000], ['capital', 0, 100000],
    ]);
    await entry('2030-01-15', 'Venta a crédito', [['cxc', 90000, 0], ['ventas', 0, 90000]]);
    await entry('2030-02-10', 'Cobro', [['caja', 70000, 0], ['cxc', 0, 70000]]);
    await entry('2030-02-15', 'Costo de ventas', [['costo', 48000, 0], ['inv', 0, 18000], ['cxp', 0, 30000]]);
    await entry('2030-03-01', 'Gastos operativos', [['gastoOp', 12000, 0], ['caja', 0, 12000]]);
    await entry('2030-03-20', 'Otros ingresos', [['caja', 1000, 0], ['otrosIng', 0, 1000]]);
    await entry('2030-03-25', 'Pago a proveedores', [['cxp', 10000, 0], ['caja', 0, 10000]]);
    await entry('2030-03-28', 'Gastos prepagados', [['prepago', 5000, 0], ['caja', 0, 5000]]);
    await entry('2030-03-31', 'Depreciación', [['deprec', 3000, 0], ['equipos', 0, 3000]]);
    await entry('2030-03-31', 'Intereses', [['interes', 2000, 0], ['caja', 0, 2000]]);
    await entry('2030-03-31', 'ISR', [['isr', 4000, 0], ['caja', 0, 4000]]);
  }, 60000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.auditLog.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.fiscalYear.updateMany({ where, data: { closingEntryId: null } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.fiscalPeriod.deleteMany({ where });
    await prisma.fiscalYear.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.accountingSettings.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  let q1: Awaited<ReturnType<typeof ratios>>;

  it('T1 2030: estado de resultados y balance con las categorías correctas', async () => {
    q1 = await ratios('2030-01-01', '2030-03-31');
    expect(q1).toMatchObject({ periodDays: 90, balancesBasis: 'average', balanced: true, complete: true, unclassified: [] });
    expect(q1.warnings.join(' ')).toMatch(/90 días/); // período corto: no anualizado
    const s = Object.fromEntries(Object.entries(q1.statement).map(([k, v]) => [k, Number(v)]));
    expect(s).toEqual({
      operatingRevenue: 90000, otherRevenue: 1000, costOfSales: 48000, grossProfit: 42000, operatingExpenses: 15000,
      depreciationAndAmortization: 3000, ebitda: 30000, ebit: 27000, financeCost: 2000, otherExpense: 0, incomeTax: 4000,
      totalIncome: 91000, totalExpenses: 69000, netIncome: 22000,
    });
    const c = Object.fromEntries(Object.entries(q1.balance.closing).map(([k, v]) => [k, Number(v)]));
    expect(c).toEqual({
      cash: 88000, receivables: 50000, inventory: 2000, currentAssets: 145000, payables: 45000, currentLiabilities: 60000,
      totalAssets: 242000, totalLiabilities: 120000, totalEquity: 122000,
    });
    expect(Number(q1.balance.opening.totalAssets)).toBe(200000);
    expect(Number(q1.balance.opening.currentLiabilities)).toBe(40000);
  });

  it('T1 2030: liquidez y endeudamiento', () => {
    expect(val(q1, 'currentRatio')).toBe(2.4167); // 145,000 / 60,000
    expect(val(q1, 'quickRatio')).toBe(2.3); // (88,000 + 50,000) / 60,000
    expect(val(q1, 'cashRatio')).toBe(1.4667);
    expect(val(q1, 'workingCapital')).toBe(85000);
    expect(val(q1, 'debtToAssets')).toBe(49.5868); // 120,000 / 242,000, sobre el cociente exacto
    expect(val(q1, 'debtToEquity')).toBe(0.9836);
    expect(val(q1, 'equityMultiplier')).toBe(1.9836);
    expect(val(q1, 'interestCoverage')).toBe(13.5); // EBIT 27,000 / 2,000
  });

  it('T1 2030: rentabilidad (ROA y ROE sobre saldos promedio)', () => {
    expect(val(q1, 'grossMargin')).toBe(46.6667);
    expect(val(q1, 'operatingMargin')).toBe(30);
    expect(val(q1, 'netMargin')).toBe(24.1758); // 22,000 / 91,000
    expect(val(q1, 'roa')).toBe(9.9548); // 22,000 / ((200,000 + 242,000) / 2)
    expect(val(q1, 'roe')).toBe(19.8198); // 22,000 / ((100,000 + 122,000) / 2)
  });

  it('T1 2030: actividad (cobro, pago, inventario y ciclo de efectivo)', () => {
    expect(val(q1, 'receivablesTurnover')).toBe(2.25); // 90,000 / 40,000
    expect(val(q1, 'daysSalesOutstanding')).toBe(40);
    expect(val(q1, 'payablesTurnover')).toBe(1.3714); // 48,000 / 35,000
    expect(val(q1, 'daysPayablesOutstanding')).toBe(65.625);
    expect(val(q1, 'inventoryTurnover')).toBe(4.3636); // 48,000 / 11,000
    expect(val(q1, 'daysInventoryOutstanding')).toBe(20.625);
    expect(val(q1, 'cashConversionCycle')).toBe(-5);
  });

  it('el saldo inicial es el del día anterior a "from" (lo que se mueve el mismo día "from" no cuenta como inicial)', async () => {
    const r = await ratios('2030-01-15', '2030-03-31'); // el 15-ene se facturaron 90,000
    expect(Number(r.balance.opening.receivables)).toBe(30000);
    expect(Number(r.balance.opening.totalAssets)).toBe(200000);
    expect(r.periodDays).toBe(76);
    expect(Number(r.statement.operatingRevenue)).toBe(90000); // y la venta del día from sí entra al período
  });

  it('cada razón trae grupo, fórmula y unidad', () => {
    expect(q1.ratios).toHaveLength(20);
    for (const r of q1.ratios) {
      expect(['LIQUIDITY', 'LEVERAGE', 'PROFITABILITY', 'ACTIVITY']).toContain(r.group);
      expect(['ratio', 'percent', 'days', 'amount']).toContain(r.unit);
      expect(r.formula.length).toBeGreaterThan(5);
    }
    expect(new Set(q1.ratios.map((r: { key: string }) => r.key)).size).toBe(20);
  });

  it('coincide con el estado de resultados y el balance general', async () => {
    const is = (await api('get', '/reports/income-statement?from=2030-01-01&to=2030-03-31', 'view').expect(200)).body;
    const bs = (await api('get', '/reports/balance-sheet?asOf=2030-03-31&periodStart=2030-01-01', 'view').expect(200)).body;
    expect(Number(q1.statement.netIncome)).toBe(Number(is.netIncome));
    expect(Number(q1.statement.totalIncome)).toBe(Number(is.totalIncome));
    expect(Number(q1.balance.closing.totalAssets)).toBe(Number(bs.totalAssets));
    expect(Number(q1.balance.closing.totalEquity)).toBe(Number(bs.totalEquity));
  });

  it('primer período de la empresa (sin saldos previos): usa el saldo final y lo avisa; sin ventas no hay márgenes', async () => {
    const r = await ratios('2029-12-01', '2029-12-31');
    expect(r).toMatchObject({ balancesBasis: 'closing', periodDays: 31 });
    expect(val(r, 'currentRatio')).toBe(2.5);
    expect(val(r, 'equityMultiplier')).toBe(2);
    expect(val(r, 'debtToEquity')).toBe(1);
    expect(val(r, 'receivablesTurnover')).toBe(0);
    expect(val(r, 'roa')).toBe(0);
    for (const k of ['grossMargin', 'operatingMargin', 'netMargin', 'daysSalesOutstanding', 'interestCoverage', 'cashConversionCycle']) {
      expect(val(r, k)).toBeNull();
      expect(r.ratios.find((x: { key: string }) => x.key === k).note).toEqual(expect.any(String));
    }
  });

  it('cuentas sin categoría con movimiento se reportan y marcan el resultado como incompleto', async () => {
    await entry('2030-04-10', 'Gasto sin clasificar', [['sinCat', 1000, 0], ['caja', 0, 1000]]);
    const r = await ratios('2030-04-01', '2030-04-30');
    expect(r.complete).toBe(false);
    expect(r.unclassified).toEqual([expect.objectContaining({ code: '5601', section: 'EXPENSE', amount: '1000' })]);
    expect(r.warnings.join(' ')).toMatch(/sin categoría|no tienen categoría/);
    expect(Number(r.statement.netIncome)).toBe(-1000);
    // y T1 no se ve afectado por un movimiento de abril
    const again = await ratios('2030-01-01', '2030-03-31');
    expect(again.complete).toBe(true);
    expect(again.ratios).toEqual(q1.ratios);
  });

  it('un año cerrado da las mismas razones que antes de cerrarlo (el asiento de cierre no las altera)', async () => {
    await api('post', '/journals/defaults', 'admin').expect(201);
    await api('put', '/settings/accounting', 'admin').send({ retainedEarningsAccountId: acc.utilAcum }).expect(200);
    const y = (await api('post', '/fiscal-years', 'admin').send({ name: '2030', startDate: '2030-01-01', endDate: '2030-12-31' }).expect(201)).body;
    await api('post', `/fiscal-years/${y.id}/close`, 'admin').expect(201);
    const after = await ratios('2030-01-01', '2030-03-31');
    expect(after.statement).toEqual(q1.statement);
    expect(after.ratios).toEqual(q1.ratios);
    expect(after.balance).toEqual(q1.balance);
  });

  it('patrimonio negativo: deuda/patrimonio, apalancamiento y ROE no se calculan', async () => {
    await entry('2031-01-10', 'Pérdida grande', [['gastoOp', 200000, 0], ['cxp', 0, 200000]]);
    const r = await ratios('2031-01-01', '2031-01-31');
    expect(Number(r.balance.closing.totalEquity)).toBe(-79000);
    for (const k of ['debtToEquity', 'equityMultiplier', 'roe']) {
      expect(val(r, k)).toBeNull();
      expect(r.ratios.find((x: { key: string }) => x.key === k).note).toMatch(/patrimonio/);
    }
    expect(val(r, 'debtToAssets')).not.toBeNull();
  });

  it('validaciones, roles y aislamiento', async () => {
    await api('get', '/reports/financial-ratios', 'view').expect(400);
    await api('get', '/reports/financial-ratios?from=2030-01-01', 'view').expect(400);
    await api('get', '/reports/financial-ratios?from=2030-02-01&to=2030-01-01', 'view').expect(400);
    await api('get', '/reports/financial-ratios?from=hoy&to=2030-01-01', 'view').expect(400);
    await request(app.getHttpServer()).get('/reports/financial-ratios?from=2030-01-01&to=2030-03-31').expect(401);
    const b = await ratios('2030-01-01', '2030-03-31', 'adminb');
    expect(b).toMatchObject({ complete: true, unclassified: [], balanced: true });
    expect(Number(b.statement.netIncome)).toBe(0);
    expect(Number(b.balance.closing.totalAssets)).toBe(0);
    expect(val(b, 'currentRatio')).toBeNull();
    expect(val(b, 'workingCapital')).toBe(0);
  });
});