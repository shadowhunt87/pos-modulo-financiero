import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { FiscalParametersService } from '../src/fiscal/fiscal-parameters.service.js';
import { applyLoad, parseCatalog, planLoad } from '../src/fiscal/fiscal-loader.js';

/**
 * R9 (plan v0.3, Fase 2 / paquetes N2a-N2d): valores fiscales con vigencia, cargador de solo inserción,
 * ficha fiscal, enlace de impuestos y cálculo de facturas con el valor vigente en la fecha del documento.
 * Claves TEST_* propias de esta prueba (se borran al final con la sesión de mantenimiento).
 */
describe('Parámetros fiscales con vigencia (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let params: FiscalParametersService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `fis-${r}-${sfx}@test.local`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let supplier: string, customer: string, itbis: string, retTest: string, retCard: string, retItbisTest: string;
  const K = `TEST_${sfx.toUpperCase()}`;
  const key = (s: string) => `${K}_${s}`;

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const catalog = (parameters: unknown[], validations: unknown[] = []) => JSON.stringify({ parameters, validations });
  const load = async (text: string, commit = 'abc1234') => {
    const parsed = parseCatalog(text);
    if (!parsed.file) return { ok: false, errors: parsed.errors };
    return applyLoad(prisma, parsed.file, text, { fileName: 'prueba.json', gitCommit: commit, loadedBy: 'e2e' });
  };
  const purchase = (issueDate: string, over: Record<string, unknown> = {}) =>
    (api('post', '/invoices', 'acct').send({
      type: 'PURCHASE', partnerId: supplier, issueDate, ncf: `B01${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}`, dgiiExpenseType: '02', issueNow: true,
      lines: [{ description: 'Servicio', quantity: 1, unitPrice: 10000, taxRateId: itbis }], withholdings: [{ taxRateId: retTest }], ...over,
    }));
  const countRows = () => prisma.fiscalParameter.count();

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    params = app.get(FiscalParametersService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `FIS A ${sfx}`, taxId: `FIS-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `FIS B ${sfx}`, taxId: `FIS-B-${sfx}` } })).id;
    const users: [string, UserRole, string][] = [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['appr', UserRole.APPROVER, companyA],
      ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ];
    for (const [r, role, companyId] of users) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (k: string, code: string, type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE') =>
      (acc[k] = (await prisma.account.create({ data: { companyId: companyA, code, name: k, type } })).id);
    await mk('cxc', '1201', 'ASSET'); await mk('cxp', '2101', 'LIABILITY'); await mk('ventas', '4101', 'INCOME');
    await mk('gastos', '5101', 'EXPENSE'); await mk('itbisPagar', '2201', 'LIABILITY'); await mk('itbisAdel', '1301', 'ASSET');
    await mk('retCobrar', '1302', 'ASSET'); await mk('retPagar', '2202', 'LIABILITY');
    await api('post', '/journals/defaults', 'admin').expect(201);
    for (const t of ['B01', 'B04']) await api('post', '/ncf/sequences', 'admin').send({ ncfType: t, rangeStart: 1, rangeEnd: 100 }).expect(201);
    await api('put', '/settings/accounting', 'admin').send({
      receivableAccountId: acc.cxc, payableAccountId: acc.cxp, salesIncomeAccountId: acc.ventas, purchaseExpenseAccountId: acc.gastos,
    }).expect(200);
    supplier = (await api('post', '/partners', 'acct').send({ type: 'SUPPLIER', name: 'Proveedor SRL', taxId: '101010101', taxIdType: 'RNC' }).expect(201)).body.id;
    customer = (await api('post', '/partners', 'acct').send({ type: 'CUSTOMER', name: 'Cliente SRL', taxId: '131123456', taxIdType: 'RNC' }).expect(201)).body.id;
    const tax = async (body: Record<string, unknown>) => (await api('post', '/tax-rates', 'acct').send(body).expect(201)).body.id as string;
    itbis = await tax({ name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: acc.itbisPagar, purchaseAccountId: acc.itbisAdel });
    retTest = await tax({ name: 'Ret prueba', rate: 99, type: 'ISR_WITHHOLDING', salesAccountId: acc.retCobrar, purchaseAccountId: acc.retPagar });
    retCard = await tax({ name: 'Ret tarjeta', rate: 99, type: 'ITBIS_WITHHOLDING', salesAccountId: acc.retCobrar, purchaseAccountId: acc.retPagar });
    retItbisTest = await tax({ name: 'Ret ITBIS prueba', rate: 30, type: 'ITBIS_WITHHOLDING', salesAccountId: acc.retCobrar, purchaseAccountId: acc.retPagar });

    // TEST_RET: 10 % hasta el 30-jun-2026 y 15 % desde el 1-jul-2026 (base SUBTOTAL); TEST_CARD 2 % base TOTAL
    const r = await load(catalog([
      { key: key('RET'), kind: 'RATE', validFrom: '2025-01-01', value: '10', base: 'SUBTOTAL', source: 'Prueba e2e' },
      { key: key('RET'), kind: 'RATE', validFrom: '2026-07-01', value: '15', base: 'SUBTOTAL', source: 'Prueba e2e' },
      { key: key('CARD'), kind: 'RATE', validFrom: '2025-01-01', value: '2', base: 'TOTAL', source: 'Prueba e2e' },
      { key: key('ITBISRET'), kind: 'RATE', validFrom: '2025-01-01', value: '30', base: 'ITBIS', source: 'Prueba e2e' },
      { key: key('LINE'), kind: 'RATE', validFrom: '2025-01-01', value: '18', source: 'Prueba e2e' },
    ]));
    expect(r.errors).toEqual([]);
  }, 60_000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.paymentAllocation.deleteMany({ where: { payment: where } });
    await prisma.payment.deleteMany({ where });
    await prisma.invoiceWithholding.deleteMany({ where: { invoice: where } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: where } });
    await prisma.invoice.updateMany({ where, data: { relatedInvoiceId: null } });
    await prisma.invoice.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.ncfSequence.deleteMany({ where });
    await prisma.documentSequence.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.accountingSettings.deleteMany({ where });
    await prisma.taxRate.deleteMany({ where });
    await prisma.partner.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.companyFiscalProfile.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    // Las claves TEST_* de esta prueba: solo con la sesión de mantenimiento (el trigger lo impide sin ella)
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.fiscal_maintenance = 'on'`);
      const rows = await tx.fiscalParameter.findMany({ where: { key: { startsWith: K } }, select: { id: true } });
      const ids2 = rows.map((x) => x.id);
      await tx.fiscalParameterValidation.deleteMany({ where: { parameterId: { in: ids2 } } });
      // Primero las revisiones (si se borra la fila anterior, su FK pondría null en la revisión: un UPDATE prohibido)
      while (await tx.fiscalParameter.count({ where: { id: { in: ids2 }, supersededBy: { isNot: null } } })) {
        await tx.fiscalParameter.deleteMany({ where: { id: { in: ids2 }, supersededBy: { is: null } } });
      }
      await tx.fiscalParameter.deleteMany({ where: { id: { in: ids2 } } });
      await tx.fiscalParameterLoad.deleteMany({ where: { fileName: 'prueba.json', parameters: { none: {} }, validations: { none: {} } } });
    });
    await app.close();
  }, 60_000);

  describe('valueAt y lectura', () => {
    it('toma el valor vigente en la fecha (10 % en junio, 15 % en julio)', async () => {
      expect((await params.valueAt(key('RET'), new Date('2026-06-15'))).value!.toString()).toBe('10');
      expect((await params.valueAt(key('RET'), new Date('2026-07-15'))).value!.toString()).toBe('15');
    });

    it('sin valor: 422 en español; antes del 2025-01-01: 422', async () => {
      await expect(params.valueAt(key('NADA'), new Date('2026-06-15'))).rejects.toThrow(/No hay un valor vigente de .* para el 15\/06\/2026; avísanos/);
      await expect(params.valueAt(key('RET'), new Date('2024-12-31'))).rejects.toThrow('El sistema tiene valores fiscales desde el 01/01/2025');
    });

    it('todo entra «Por validar» hasta una validación con nombre', async () => {
      expect((await params.valueAt(key('CARD'), new Date('2026-06-15'))).status).toBe('POR_VALIDAR');
      const r = await load(catalog([], [{ key: key('CARD'), validFrom: '2025-01-01', validatedBy: 'Contadora de prueba', validatedAt: '2026-10-14' }]));
      expect(r.ok).toBe(true);
      expect((await params.valueAt(key('CARD'), new Date('2026-06-15'))).status).toBe('OFICIAL');
    });

    it('GET /fiscal/parameters responde a los 5 roles; el historial de una clave también', async () => {
      for (const who of ['admin', 'acct', 'appr', 'view', 'adminb']) {
        const res = await api('get', '/fiscal/parameters?date=2026-07-15', who).expect(200);
        expect(res.body.find((p: { key: string }) => p.key === key('RET'))).toMatchObject({ value: '15', status: 'POR_VALIDAR', base: 'SUBTOTAL' });
      }
      const h = await api('get', `/fiscal/parameters/${key('RET')}`, 'view').expect(200);
      expect(h.body.map((x: { value: string }) => x.value)).toEqual(['15', '10']);
      await api('get', `/fiscal/parameters/${key('NADA')}`, 'view').expect(404);
    });

    it('no hay rutas ni métodos para cambiar valores; la base impide modificar o borrar', async () => {
      const methods = Object.getOwnPropertyNames(FiscalParametersService.prototype);
      expect(methods.filter((m) => /update|delete|remove|create|save|set/i.test(m))).toEqual([]);
      await api('put', `/fiscal/parameters/${key('RET')}`, 'admin').send({ value: '1' }).expect(404);
      const row = await prisma.fiscalParameter.findFirstOrThrow({ where: { key: key('RET') } });
      await expect(prisma.fiscalParameter.updateMany({ where: { id: row.id }, data: { value: '1' } })).rejects.toThrow(/no se modifican/);
      await expect(prisma.fiscalParameter.deleteMany({ where: { id: row.id } })).rejects.toThrow(/no se modifican/);
    });
  });

  describe('cargador', () => {
    it('--dry-run no escribe nada; un campo desconocido o un kind inválido rechazan todo', async () => {
      const before = await countRows();
      const text = catalog([{ key: key('NEW'), kind: 'RATE', validFrom: '2025-01-01', value: '5', source: 'x' }]);
      const plan = await planLoad(prisma, parseCatalog(text).file!, text);
      expect(plan).toMatchObject({ ok: true, newRows: [expect.objectContaining({ key: key('NEW') })] });
      expect(await countRows()).toBe(before);
      expect(parseCatalog(catalog([{ key: key('X'), kind: 'RATE', validFrom: '2025-01-01', value: '5', source: 'x', extra: 1 }])).errors[0]).toMatch(/campo desconocido "extra"/);
      expect(parseCatalog(catalog([{ key: key('X'), kind: 'PORCENTAJE', validFrom: '2025-01-01', value: '5', source: 'x' }])).errors[0]).toMatch(/"kind" inválido/);
      expect(await countRows()).toBe(before);
    });

    it('una tasa sin valor desde el 2025-01-01 rechaza el catálogo completo y no escribe nada', async () => {
      const before = await countRows();
      const r = await load(catalog([
        { key: key('OK'), kind: 'RATE', validFrom: '2025-01-01', value: '5', source: 'x' },
        { key: key('LATE'), kind: 'RATE', validFrom: '2026-01-01', value: '5', source: 'x' },
      ]));
      expect(r.ok).toBe(false);
      expect(r.errors.join(' ')).toMatch(/LATE: falta su valor desde el 2025-01-01/);
      expect(await countRows()).toBe(before);
    });

    it('cargar el mismo archivo dos veces no duplica; guarda sha256 y commit', async () => {
      const text = catalog([{ key: key('TWICE'), kind: 'AMOUNT', validFrom: '2025-01-01', value: '100', source: 'x' }]);
      const r1 = await load(text, 'deadbeef1');
      const before = await countRows();
      const r2 = await load(text, 'deadbeef1');
      expect([r1.ok, r2.ok, r2.skipped, await countRows()]).toEqual([true, true, 1, before]);
      const l = await prisma.fiscalParameterLoad.findUniqueOrThrow({ where: { id: (r1 as { loadId: string }).loadId } });
      expect(l).toMatchObject({ gitCommit: 'deadbeef1', sha256: expect.stringMatching(/^[0-9a-f]{64}$/) });
    });

    it('la misma fila con otro valor se rechaza: se corrige con una revisión', async () => {
      const r = await load(catalog([{ key: key('TWICE'), kind: 'AMOUNT', validFrom: '2025-01-01', value: '200', source: 'x' }]));
      expect(r.errors[0]).toMatch(/ya existe con otros datos: no se cambia; carga la revisión 2/);
    });
  });

  describe('facturas con impuestos enlazados', () => {
    it('enlace incompatible → 422; enlace correcto → la factura usa el valor vigente en su fecha', async () => {
      const bad = await api('put', `/fiscal/tax-links/${retTest}`, 'acct').send({ parameterKey: key('ITBISRET') }).expect(422);
      expect(bad.body.message).toMatch(/solo sirve para una retención de ITBIS/);
      await api('put', `/fiscal/tax-links/${itbis}`, 'acct').send({ parameterKey: key('RET') }).expect(422);
      await api('put', `/fiscal/tax-links/${retTest}`, 'view').send({ parameterKey: key('RET') }).expect(403);
      await api('put', `/fiscal/tax-links/${retTest}`, 'acct').send({ parameterKey: key('RET') }).expect(200);
      await api('put', `/fiscal/tax-links/${retCard}`, 'acct').send({ parameterKey: key('CARD') }).expect(200);
      await api('put', `/fiscal/tax-links/${retTest}`, 'adminb').send({ parameterKey: key('RET') }).expect(404);
    });

    it('compra de 10,000: retención 1,000 en junio y 1,500 en julio; guarda appliedRate y fiscalParameterId', async () => {
      const jun = (await purchase('2026-06-15').expect(201)).body;
      const jul = (await purchase('2026-07-15').expect(201)).body;
      expect([jun.withholdingTotal, jul.withholdingTotal].map(Number)).toEqual([1000, 1500]);
      const w = await prisma.invoiceWithholding.findFirstOrThrow({ where: { invoiceId: jul.id } });
      const p = await params.valueAt(key('RET'), new Date('2026-07-15'));
      expect([w.appliedRate?.toString(), w.fiscalParameterId]).toEqual(['15', p.id]);
      const l = await prisma.invoiceLine.findFirstOrThrow({ where: { invoiceId: jul.id } });
      expect([l.appliedRate?.toString(), l.fiscalParameterId]).toEqual(['18', null]); // ITBIS sin enlazar: su tasa, sin parámetro
    });

    it('la base que manda el cliente se ignora en un impuesto enlazado', async () => {
      const inv = (await purchase('2026-07-15', { withholdings: [{ taxRateId: retTest, base: 1 }] }).expect(201)).body;
      expect(Number(inv.withholdingTotal)).toBe(1500);
    });

    it('borrador con fecha de junio emitido en julio usa junio (1,000)', async () => {
      const draft = (await purchase('2026-06-20', { issueNow: false }).expect(201)).body;
      const issued = (await api('post', `/invoices/${draft.id}/issue`, 'acct').send({}).expect(201)).body;
      expect(Number(issued.withholdingTotal)).toBe(1000);
    });

    it('nota de crédito de 4,000 sobre una factura de junio, emitida en julio → 400 (hereda junio)', async () => {
      const jun = (await purchase('2026-06-10').expect(201)).body;
      const nc = (await api('post', '/invoices', 'acct').send({
        type: 'CREDIT_NOTE', partnerId: supplier, relatedInvoiceId: jun.id, issueDate: '2026-07-20', ncf: 'B0400000077', issueNow: true,
        lines: [{ description: 'Devolución', quantity: 1, unitPrice: 4000, taxRateId: itbis }], withholdings: [{ taxRateId: retTest }],
      }).expect(201)).body;
      expect(Number(nc.withholdingTotal)).toBe(400);
    });

    it('2 % con base TOTAL sobre 10,000 + ITBIS 18 % → 236', async () => {
      const inv = (await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: '2026-07-15', ncfType: 'B01', dgiiIncomeType: '01', issueNow: true,
        lines: [{ description: 'Venta', quantity: 1, unitPrice: 10000, taxRateId: itbis }], withholdings: [{ taxRateId: retCard }],
      }).expect(201)).body;
      expect(Number(inv.withholdingTotal)).toBe(236);
    });

    it('impuesto enlazado antes del 2025-01-01 → 422; cambiar la tasa de un impuesto enlazado → 422', async () => {
      const res = await purchase('2024-12-20').expect(422);
      expect(res.body.message).toBe('El sistema tiene valores fiscales desde el 01/01/2025');
      await api('patch', `/tax-rates/${retTest}`, 'acct').send({ rate: 20 }).expect(422);
    });

    it('effective?date devuelve la tasa de cada fecha', async () => {
      const jun = (await api('get', '/fiscal/tax-rates/effective?date=2026-06-15', 'view').expect(200)).body;
      const jul = (await api('get', '/fiscal/tax-rates/effective?date=2026-07-15', 'view').expect(200)).body;
      expect([jun[retTest].rate, jul[retTest].rate, jul[retTest].base, jul[itbis].linked]).toEqual(['10', '15', 'SUBTOTAL', false]);
    });

    it('una revisión nueva reemplaza al valor y el informe lista las facturas que usaron el anterior', async () => {
      const text = catalog([{ key: key('RET'), kind: 'RATE', validFrom: '2026-07-01', revision: 2, value: '16', base: 'SUBTOTAL', source: 'Corrección e2e' }]);
      const r = await load(text);
      expect(r.ok).toBe(true);
      expect(r.revisions).toHaveLength(1);
      expect(r.affected.length).toBeGreaterThanOrEqual(2); // las compras de julio
      expect(r.affected.every((a) => a.companyId === companyA)).toBe(true);
      expect((await params.valueAt(key('RET'), new Date('2026-07-15'))).value!.toString()).toBe('16');
      const inv = (await purchase('2026-07-15').expect(201)).body;
      expect(Number(inv.withholdingTotal)).toBe(1600);
    });

    it('sugerencias: lo que coincide se sugiere, lo enlazado se marca; nada se enlaza solo', async () => {
      const res = await api('get', '/fiscal/tax-links/suggestions', 'acct').expect(200);
      const byId = Object.fromEntries(res.body.map((s: { taxRateId: string }) => [s.taxRateId, s]));
      expect(byId[retTest].status).toBe('ENLAZADO');
      expect(byId[itbis].status).toMatch(/SUGERIDO|AMBIGUO/);
      expect((await prisma.taxRate.findUniqueOrThrow({ where: { id: itbis } })).parameterKey).toBeNull();
    });
  });

  describe('ficha fiscal y avisos', () => {
    it('ficha en blanco: el aviso del Panel pide completarla', async () => {
      const res = await api('get', '/fiscal/alerts', 'view').expect(200);
      expect(res.body).toEqual(expect.arrayContaining([expect.objectContaining({ code: 'PROFILE_INCOMPLETE', link: '/company/fiscal' })]));
    });

    it('ADMIN guarda; los demás leen y reciben 403; la empresa B no ve la de A', async () => {
      const body = { dgiiClassification: 'PEQUENO', taxRegime: 'ORDINARIO', legalForm: 'SRL', accountingFramework: 'NIIF_PYMES', isWithholdingAgent: true };
      for (const who of ['acct', 'appr', 'view']) await api('put', '/fiscal/profile', who).send(body).expect(403);
      const saved = (await api('put', '/fiscal/profile', 'admin').send(body).expect(200)).body;
      expect(saved).toMatchObject({ ...body, complete: true, closingMonth: 12, closingMonthAllowed: true });
      expect((await api('get', '/fiscal/profile', 'view').expect(200)).body.legalForm).toBe('SRL');
      expect((await api('get', '/fiscal/profile', 'adminb').expect(200)).body).toMatchObject({ legalForm: null, complete: false });
      expect(await prisma.auditLog.count({ where: { companyId: companyA, entityName: 'CompanyFiscalProfile' } })).toBe(1);
      const alerts = (await api('get', '/fiscal/alerts', 'view').expect(200)).body;
      expect(alerts.find((a: { code: string }) => a.code === 'PROFILE_INCOMPLETE')).toBeUndefined();
      await api('put', '/fiscal/profile', 'admin').send({ legalForm: 'INVENTADA' }).expect(400);
    });

    it('avisa de impuestos sin enlazar', async () => {
      const alerts = (await api('get', '/fiscal/alerts', 'view').expect(200)).body;
      expect(alerts.find((a: { code: string }) => a.code === 'TAX_UNLINKED').text).toMatch(/no se actualiza solo/);
    });
  });
});
