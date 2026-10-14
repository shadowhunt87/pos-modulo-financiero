import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Semáforo financiero sobre los mismos datos de financial-ratios.e2e-spec.ts (calculados a mano):
 * Apertura 31-dic-2029: Activo 200,000 | Pasivo 100,000 | Patrimonio 100,000.
 * T1 2030 (90 días): utilidad neta 22,000; ingresos totales 91,000; cierre Activo 242,000 | Pasivo 120,000.
 * Razón corriente 145,000 / 60,000 = 2.4167 (verde, límite 1.5). Endeudamiento 120,000 / 242,000 = 49.5868 %
 * (verde, límite 50). ROA 22,000 / 221,000 = 9.9548 % del trimestre => 9.9548 × 365 / 90 = 40.3722 % anualizado.
 * Margen EBITDA 30,000 / 90,000 = 33.3333 % (verde, límite 15).
 */
describe('Semáforo financiero (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `fa-${r}-${sfx}@test.local`;
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
  type Item = { key: string; value: string | null; evaluatedValue: string | null; color: string; status: string; message: string; annualized: boolean; label: string; note?: string };
  const health = async (from: string, to: string, who = 'view') =>
    (await api('get', `/financial-analysis/health?from=${from}&to=${to}`, who).expect(200)).body as { items: Item[]; warnings: string[]; summary: Record<string, number>; periodDays: number };
  const item = (h: { items: Item[] }, key: string) => {
    const i = h.items.find((x) => x.key === key);
    expect(i, key).toBeDefined();
    return i!;
  };
  const binary = (r: request.Test) => r.buffer(true).parse((res, cb) => {
    const chunks: Buffer[] = [];
    res.on('data', (c: Buffer) => chunks.push(c));
    res.on('end', () => cb(null, Buffer.concat(chunks)));
  });

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `FA A ${sfx}`, taxId: `FA-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `FA B ${sfx}`, taxId: `FA-B-${sfx}` } })).id;
    const users = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['appr', UserRole.APPROVER, companyA],
      ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ] as const;
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE', category: string) =>
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
    await mk('ventas', '4101', 'INCOME', 'OPERATING_REVENUE');
    await mk('otrosIng', '4201', 'INCOME', 'OTHER_REVENUE');
    await mk('costo', '5101', 'EXPENSE', 'COST_OF_SALES');
    await mk('gastoOp', '5201', 'EXPENSE', 'OPERATING_EXPENSE');
    await mk('deprec', '5301', 'EXPENSE', 'DEPRECIATION_AMORTIZATION');
    await mk('interes', '5401', 'EXPENSE', 'FINANCE_COST');
    await mk('isr', '5501', 'EXPENSE', 'INCOME_TAX');

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
    await prisma.ratioThreshold.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('semáforo', () => {
    it('T1 2030: razón corriente y endeudamiento en verde, con su frase para el dueño', async () => {
      const h = await health('2030-01-01', '2030-03-31');
      expect(h.periodDays).toBe(90);
      expect(item(h, 'currentRatio')).toMatchObject({ value: '2.4167', color: 'GREEN', status: 'Bien' });
      expect(item(h, 'currentRatio').message).toContain('2.42 pesos');
      expect(item(h, 'debtToAssets')).toMatchObject({ value: '49.5868', color: 'GREEN' });
      expect(item(h, 'ebitdaMargin')).toMatchObject({ value: '33.3333', color: 'GREEN' });
      // Sin semáforo por defecto (depende del sector): solo describe
      expect(item(h, 'inventoryTurnover').color).toBe('NONE');
    });

    it('ROA del trimestre (9.9548 %) se evalúa anualizado: 40.3722 % y se rotula', async () => {
      const h = await health('2030-01-01', '2030-03-31');
      expect(item(h, 'roa')).toMatchObject({ value: '9.9548', evaluatedValue: '40.3722', annualized: true, color: 'GREEN' });
      expect(item(h, 'roa').label).toContain('anualizado');
      expect(h.warnings.join(' ')).toMatch(/anualizados/);
      // Año completo: no se anualiza
      expect(item(await health('2030-01-01', '2030-12-31'), 'roa').annualized).toBe(false);
    });

    it('denominador cero: gris "Sin dato" con la nota del generador', async () => {
      const h = await health('2031-01-01', '2031-01-31'); // sin ventas en el período
      expect(item(h, 'grossMargin')).toMatchObject({ value: null, color: 'GRAY', status: 'Sin dato' });
      expect(item(h, 'grossMargin').message).toContain('No hay ingresos operativos');
      expect(h.summary.gray).toBeGreaterThan(0);
    });
  });

  describe('límites', () => {
    it('mover el verde del endeudamiento a 49.5868 sigue verde; a 49.58 pasa a amarillo', async () => {
      await api('put', '/financial-analysis/thresholds', 'acct').send({ thresholds: [{ ratioKey: 'debtToAssets', greenAt: 49.5868, redAt: 70 }] }).expect(200);
      expect(item(await health('2030-01-01', '2030-03-31'), 'debtToAssets').color).toBe('GREEN');
      await api('put', '/financial-analysis/thresholds', 'admin').send({ thresholds: [{ ratioKey: 'debtToAssets', greenAt: 49.58, redAt: 70 }] }).expect(200);
      expect(item(await health('2030-01-01', '2030-03-31'), 'debtToAssets')).toMatchObject({ color: 'YELLOW', status: 'Atención' });
    });

    it('solo ADMIN y ACCOUNTANT cambian límites; incoherentes o de una razón inexistente: 400', async () => {
      const body = { thresholds: [{ ratioKey: 'currentRatio', greenAt: 2, redAt: 1 }] };
      await api('put', '/financial-analysis/thresholds', 'appr').send(body).expect(403);
      await api('put', '/financial-analysis/thresholds', 'view').send(body).expect(403);
      await api('delete', '/financial-analysis/thresholds/currentRatio', 'view').expect(403);
      // Razón corriente: más es mejor, el verde no puede estar por debajo del rojo
      const bad = await api('put', '/financial-analysis/thresholds', 'admin').send({ thresholds: [{ ratioKey: 'currentRatio', greenAt: 1, redAt: 2 }] }).expect(400);
      expect(bad.body.message).toContain('mayor o igual');
      await api('put', '/financial-analysis/thresholds', 'admin').send({ thresholds: [{ ratioKey: 'noExiste', greenAt: 1, redAt: 0 }] }).expect(400);
      await api('delete', '/financial-analysis/thresholds/noExiste', 'admin').expect(400);
    });

    it('los límites de A no afectan a B; DELETE vuelve al valor por defecto y queda en la bitácora', async () => {
      const b = (await api('get', '/financial-analysis/thresholds', 'adminb').expect(200)).body as { ratioKey: string; greenAt: string; custom: boolean }[];
      expect(b.find((t) => t.ratioKey === 'debtToAssets')).toMatchObject({ greenAt: '50', custom: false });
      const after = (await api('delete', '/financial-analysis/thresholds/debtToAssets', 'acct').expect(200)).body as typeof b;
      expect(after.find((t) => t.ratioKey === 'debtToAssets')).toMatchObject({ greenAt: '50', custom: false });
      expect(item(await health('2030-01-01', '2030-03-31'), 'debtToAssets').color).toBe('GREEN');
      const logs = await prisma.auditLog.findMany({ where: { companyId: companyA, entityName: 'RatioThreshold' } });
      expect(logs.map((l) => l.action).sort()).toEqual(['CREATE', 'DELETE', 'UPDATE']);
    });

    it('una razón sin semáforo por defecto se puede activar para la empresa', async () => {
      await api('put', '/financial-analysis/thresholds', 'acct').send({ thresholds: [{ ratioKey: 'daysInventoryOutstanding', greenAt: 30, redAt: 90 }] }).expect(200);
      const i = item(await health('2030-01-01', '2030-03-31'), 'daysInventoryOutstanding');
      expect(['GREEN', 'YELLOW', 'RED']).toContain(i.color);
      await api('delete', '/financial-analysis/thresholds/daysInventoryOutstanding', 'acct').expect(200);
    });
  });

  describe('tendencia, comparación e indicadores', () => {
    it('tendencia enero a marzo de 2030: 3 puntos; más de 24 o desde > hasta: 400', async () => {
      const t = (await api('get', '/financial-analysis/trend?from=2030-01&to=2030-03&keys=currentRatio,netMargin', 'view').expect(200)).body;
      expect(t.points.map((p: { period: string }) => p.period)).toEqual(['2030-01', '2030-02', '2030-03']);
      expect(t.points[2].values.currentRatio).toMatchObject({ value: '2.4167', color: 'GREEN' });
      expect(t.labels.currentRatio).toBe('Razón corriente');
      expect((await api('get', '/financial-analysis/trend?from=2030-01&to=2030-12&granularity=QUARTER', 'view').expect(200)).body.points).toHaveLength(4);
      await api('get', '/financial-analysis/trend?from=2028-01&to=2030-01', 'view').expect(400); // 25 meses
      await api('get', '/financial-analysis/trend?from=2030-03&to=2030-01', 'view').expect(400);
      await api('get', '/financial-analysis/trend?from=2030-01&to=2030-03&keys=a,b,c,d,e', 'view').expect(400);
    });

    it('comparar T1 2030 con T1 2029: diferencias y si mejoró', async () => {
      const c = (await api('get', '/financial-analysis/compare?from=2030-01-01&to=2030-03-31', 'view').expect(200)).body;
      expect(c.previous).toMatchObject({ from: '2029-01-01', to: '2029-03-31' });
      const nm = c.items.find((i: { key: string }) => i.key === 'netMargin');
      // T1 2029 no tiene ingresos: sin dato anterior, sin diferencia
      expect(nm).toMatchObject({ current: '24.1758', previous: null, difference: null, improved: null });
      await api('get', '/financial-analysis/compare?from=2030-01-01&to=2030-03-31&compareFrom=2029-01-01', 'view').expect(400);
    });

    it('indicadores del Panel: 6 claves para cualquier rol y solo de su empresa', async () => {
      const k = (await api('get', '/financial-analysis/kpis', 'view').expect(200)).body;
      expect(k.items.map((i: { key: string }) => i.key)).toEqual(['currentRatio', 'quickRatio', 'debtToAssets', 'netMargin', 'daysSalesOutstanding', 'ebitda']);
      expect(k.items[0].title).toBe('¿Puedo pagar lo que debo pronto?');
      const kb = (await api('get', '/financial-analysis/kpis', 'adminb').expect(200)).body;
      expect(kb.items.find((i: { key: string }) => i.key === 'ebitda').current).toBe('0');
    });

    it('exportaciones: PDF empieza con %PDF y el Excel trae "Razón corriente"', async () => {
      const pdf = await binary(api('get', '/financial-analysis/export/health?from=2030-01-01&to=2030-03-31&format=pdf', 'view')).expect(200);
      expect(pdf.headers['content-type']).toBe('application/pdf');
      expect((pdf.body as Buffer).subarray(0, 4).toString()).toBe('%PDF');
      const xlsx = await binary(api('get', '/financial-analysis/export/compare?from=2030-01-01&to=2030-03-31&format=xlsx', 'view')).expect(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(xlsx.body as Buffer);
      const texts: string[] = [];
      wb.eachSheet((ws) => ws.eachRow((r) => r.eachCell((c) => texts.push(c.text))));
      expect(texts).toContain('Razón corriente');
      await api('get', '/financial-analysis/export/health?from=2030-01-01&to=2030-03-31&format=doc', 'view').expect(400);
    });
  });
});
