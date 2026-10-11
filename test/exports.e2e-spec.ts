import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { ExportsService } from '../src/exports/exports.service.js';
import { renderPdf } from '../src/exports/pdf.renderer.js';
import { renderXlsx } from '../src/exports/xlsx.renderer.js';
import type { TableDoc } from '../src/exports/table-doc.js';

/**
 * Exportación a Excel y PDF con montos conocidos.
 * Ene-2031: capital 100,000 -> caja. Feb-2031: venta 25,500.75 (caja) y gasto 8,200.25 (caja).
 * Caja: Dr 125,500.75 Cr 8,200.25 = 117,300.50. Utilidad = 17,300.50. 20-feb: CxC 3,000 / CxP 3,000 (sin efecto en caja).
 * Balanza: 136,701.00 = 136,701.00. Activos 120,300.50 = Pasivos 3,000 + Patrimonio 117,300.50.
 */
describe('Exportación Excel / PDF (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let svc: ExportsService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `exp-${r}-${sfx}@test.local`;
  const RNC = '130000019'; // empresa DGII
  const RNC_A = '131000001';
  let companyA: string, companyB: string, companyD: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  const accD: Record<string, string> = {};
  const id: Record<string, string> = {};
  let itbis: string, bank: string, cust: string, supp: string;

  const api = (url: string, who: string) => request(app.getHttpServer()).get(url).set('Authorization', `Bearer ${token[who]}`);
  const post = (url: string, who: string) => request(app.getHttpServer()).post(url).set('Authorization', `Bearer ${token[who]}`);
  const binary = (r: request.Test) => r.buffer(true).parse((res, cb) => {
    const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c)));
  });
  const entry = (date: string, description: string, lines: [string, number, number][]) =>
    post('/accounting/journal-entries', 'admin').send({
      date, description, lines: lines.map(([a, debit, credit]) => ({ accountId: acc[a], ...(debit ? { debit } : { credit }) })),
    }).expect(201);

  const readXlsx = async (buf: Buffer) => {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as never);
    return wb;
  };
  /** Todas las filas de una hoja como arreglos de valores */
  const rowsOf = (ws: ExcelJS.Worksheet) => {
    const out: (string | number | null)[][] = [];
    ws.eachRow((r) => out.push((r.values as unknown[]).slice(1).map((v) => (v === undefined ? null : (v as string | number | null)))));
    return out;
  };
  const find = (rows: (string | number | null)[][], text: string) => rows.find((r) => r.includes(text));
  /** Texto de un PDF generado SIN compresión: pdfkit escribe los textos como hex dentro de TJ */
  const pdfText = (buf: Buffer) => {
    const s = buf.toString('latin1');
    let out = '';
    for (const m of s.matchAll(/<([0-9a-fA-F]+)>/g)) out += Buffer.from(m[1], 'hex').toString('latin1');
    return out;
  };

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    svc = app.get(ExportsService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `Exportación Ñandú ${sfx}`, taxId: RNC_A } })).id;
    companyB = (await prisma.company.create({ data: { name: `Exp B ${sfx}`, taxId: '131999999' } })).id;
    companyD = (await prisma.company.create({ data: { name: `Exp DGII ${sfx}`, taxId: RNC } })).id;
    for (const [r, role, companyId] of [['admin', UserRole.ADMIN, companyA], ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB], ['dgii', UserRole.ADMIN, companyD]] as const) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, name: string, type: string, extra: Record<string, unknown> = {}) =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name, type: type as never, ...extra } })).id);
    await mk('caja', '1101', 'Caja general', 'ASSET', { category: 'CASH_AND_EQUIVALENTS', cashFlowCategory: 'CASH_EQUIVALENT' });
    await mk('capital', '3101', 'Capital social', 'EQUITY', { category: 'SHARE_CAPITAL', cashFlowCategory: 'FINANCING' });
    await mk('ventas', '4101', 'Ventas', 'INCOME', { category: 'OPERATING_REVENUE' });
    await mk('gasto', '5101', '=1+1 Gastos de operación ñ', 'EXPENSE', { category: 'OPERATING_EXPENSE' });
    await mk('cxc', '1201', 'Cuentas por cobrar', 'ASSET', { cashFlowCategory: 'OPERATING' }); await mk('cxp', '2101', 'Cuentas por pagar', 'LIABILITY', { cashFlowCategory: 'OPERATING' });
    await mk('itbisPagar', '2201', 'ITBIS por pagar', 'LIABILITY'); await mk('itbisAdel', '1301', 'ITBIS adelantado', 'ASSET');
    await mk('banco', '1102', 'Banco', 'ASSET');
    await post('/journals/defaults', 'admin').expect(201);
    await entry('2031-01-05', 'Aporte', [['caja', 100000, 0], ['capital', 0, 100000]]);
    await entry('2031-02-10', 'Venta', [['caja', 25500.75, 0], ['ventas', 0, 25500.75]]);
    await entry('2031-02-15', 'Gasto', [['gasto', 8200.25, 0], ['caja', 0, 8200.25]]);
    await entry('2031-02-20', 'Compra a crédito (no afecta caja)', [['cxc', 3000, 0], ['cxp', 0, 3000]]);

    // ---- DGII (marzo 2025) en su propia empresa
    const mkD = async (key: string, code: string, name: string, type: string) =>
      (accD[key] = (await prisma.account.create({ data: { companyId: companyD, code, name, type: type as never } })).id);
    await mkD('cxc', '1201', 'Cuentas por cobrar', 'ASSET'); await mkD('cxp', '2101', 'Cuentas por pagar', 'LIABILITY');
    await mkD('ventas', '4101', 'Ventas', 'INCOME'); await mkD('gasto', '5101', 'Gastos', 'EXPENSE');
    await mkD('itbisPagar', '2201', 'ITBIS por pagar', 'LIABILITY'); await mkD('itbisAdel', '1301', 'ITBIS adelantado', 'ASSET');
    await mkD('banco', '1102', 'Banco', 'ASSET');
    await post('/journals/defaults', 'dgii').expect(201);
    for (const t of ['B01', 'B02']) await post('/ncf/sequences', 'dgii').send({ ncfType: t, rangeStart: 1, rangeEnd: 100 }).expect(201);
    await request(app.getHttpServer()).put('/settings/accounting').set('Authorization', `Bearer ${token.dgii}`).send({
      receivableAccountId: accD.cxc, payableAccountId: accD.cxp, salesIncomeAccountId: accD.ventas, purchaseExpenseAccountId: accD.gasto,
    }).expect(200);
    const partner = async (body: Record<string, unknown>) => (await post('/partners', 'dgii').send(body).expect(201)).body.id as string;
    cust = await partner({ type: 'CUSTOMER', name: 'Cliente Ñoño SRL', taxId: '131123456', taxIdType: 'RNC' });
    supp = await partner({ type: 'SUPPLIER', name: 'Proveedor SA', taxId: '101010101', taxIdType: 'RNC' });
    itbis = (await post('/tax-rates', 'dgii').send({ name: 'ITBIS 18%', rate: 18, type: 'ITBIS', salesAccountId: accD.itbisPagar, purchaseAccountId: accD.itbisAdel }).expect(201)).body.id;
    bank = (await prisma.bankAccount.create({ data: { companyId: companyD, bankName: 'Banco X', accountNumber: '001', glAccountId: accD.banco } })).id;
    const inv = async (key: string, body: Record<string, unknown>) =>
      (id[key] = (await post('/invoices', 'dgii').send({ issueNow: true, lines: [{ description: 'Item', quantity: 1, unitPrice: 1000, taxRateId: itbis }], ...body }).expect(201)).body.id);
    await inv('S1', { type: 'SALE', partnerId: cust, ncfType: 'B01', issueDate: '2025-03-05', dgiiIncomeType: '01' });
    await post('/payments', 'dgii').send({ direction: 'RECEIVED', partnerId: cust, date: '2025-03-10', amount: 1180, method: 'BANK_TRANSFER', bankAccountId: bank, allocations: [{ invoiceId: id.S1, amount: 1180 }] }).expect(201);
    await inv('P1', { type: 'PURCHASE', partnerId: supp, ncf: 'B0100000101', issueDate: '2025-03-04', dgiiExpenseType: '02' });
    await post('/payments', 'dgii').send({ direction: 'MADE', partnerId: supp, date: '2025-03-06', amount: 1180, method: 'BANK_TRANSFER', bankAccountId: bank, allocations: [{ invoiceId: id.P1, amount: 1180 }] }).expect(201);
    await inv('P2', { type: 'PURCHASE', partnerId: supp, ncf: 'B0100000102', issueDate: '2025-03-08' }); // sin tipo de gasto => error 606
    await inv('S5', { type: 'SALE', partnerId: cust, ncfType: 'B01', issueDate: '2025-03-18', dgiiIncomeType: '01' });
    await post(`/invoices/${id.S5}/void`, 'dgii').send({ reason: 'Error', reasonCode: '03' }).expect(201);
    await prisma.invoice.update({ where: { id: id.S5 }, data: { voidedAt: new Date('2025-04-02T15:00:00Z') } });
  }, 120000);

  afterAll(async () => {
    const ids = [companyA, companyB, companyD].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.paymentAllocation.deleteMany({ where: { payment: where } });
    await prisma.payment.deleteMany({ where });
    await prisma.invoiceWithholding.deleteMany({ where: { invoice: where } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: where } });
    await prisma.invoice.updateMany({ where, data: { relatedInvoiceId: null } });
    await prisma.invoice.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.bankAccount.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.ncfSequence.deleteMany({ where });
    await prisma.documentSequence.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.accountingSettings.deleteMany({ where });
    await prisma.taxRate.deleteMany({ where });
    await prisma.partner.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  const MONEY = '#,##0.00;[Red]-#,##0.00';

  describe('Excel', () => {
    it('balanza: cifras como NÚMEROS con formato, totales que cuadran y encabezado de empresa', async () => {
      const r = await binary(api('/exports/trial-balance?format=xlsx&from=2031-01-01&to=2031-12-31', 'view')).expect(200);
      expect(r.headers['content-type']).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      expect(r.headers['content-disposition']).toBe('attachment; filename="balanza-de-comprobacion_2031-12-31.xlsx"');
      const wb = await readXlsx(r.body as Buffer);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Balanza de comprobación']);
      const ws = wb.worksheets[0];
      const rows = rowsOf(ws);
      expect(rows[0][0]).toBe(`Exportación Ñandú ${sfx}  -  RNC ${RNC_A}`);
      expect(rows[1][0]).toBe('Balanza de comprobación');
      expect(rows[2][0]).toBe('Del 2031-01-01 al 2031-12-31');
      const header = rows.findIndex((x) => x[0] === 'Código');
      expect(rows[header]).toEqual(['Código', 'Cuenta', 'Tipo', 'Débito', 'Crédito', 'Saldo']);
      expect(rows.slice(header + 1, header + 7)).toEqual([
        ['1101', 'Caja general', 'Activo', 125500.75, 8200.25, 117300.5],
        ['1201', 'Cuentas por cobrar', 'Activo', 3000, 0, 3000],
        ['2101', 'Cuentas por pagar', 'Pasivo', 0, 3000, -3000],
        ['3101', 'Capital social', 'Patrimonio', 0, 100000, -100000],
        ['4101', 'Ventas', 'Ingreso', 0, 25500.75, -25500.75],
        ['5101', '=1+1 Gastos de operación ñ', 'Gasto', 8200.25, 0, 8200.25],
      ]);
      expect(find(rows, 'Totales')).toEqual(['Totales', '', '', 136701, 136701]);
      let headerNo = 0;
      ws.eachRow((r) => { if (!headerNo && r.getCell(1).value === 'Código') headerNo = r.number; });
      const cajaDebit = ws.getRow(headerNo + 1).getCell(4);
      expect(typeof cajaDebit.value).toBe('number');
      expect(cajaDebit.numFmt).toBe(MONEY);
      // un texto que parece fórmula se guarda como TEXTO, nunca como fórmula
      const nameCell = ws.getRow(headerNo + 6).getCell(2);
      expect(nameCell.type).toBe(ExcelJS.ValueType.String);
      expect(nameCell.formula).toBeUndefined();
      expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: headerNo });
    });

    it('balanza con rango: solo febrero', async () => {
      const wb = await readXlsx((await binary(api('/exports/trial-balance?format=xlsx&from=2031-02-01&to=2031-02-28', 'view')).expect(200)).body);
      const rows = rowsOf(wb.worksheets[0]);
      expect(find(rows, '1101')).toEqual(['1101', 'Caja general', 'Activo', 25500.75, 8200.25, 17300.5]);
      expect(find(rows, '3101')).toBeUndefined();
      expect(find(rows, 'Totales')).toEqual(['Totales', '', '', 36701, 36701]);
    });

    it('estado de resultados', async () => {
      const wb = await readXlsx((await binary(api('/exports/income-statement?format=xlsx&from=2031-01-01&to=2031-12-31', 'view')).expect(200)).body);
      expect(wb.worksheets[0].name).toBe('Estado de resultados');
      const rows = rowsOf(wb.worksheets[0]);
      expect(find(rows, 'Total ingresos')).toEqual(['', 'Total ingresos', 25500.75]);
      expect(find(rows, 'Total gastos')).toEqual(['', 'Total gastos', 8200.25]);
      expect(find(rows, 'RESULTADO NETO')).toEqual(['', 'RESULTADO NETO', 17300.5]);
      expect(find(rows, '4101')).toEqual(['4101', 'Ventas', 25500.75]);
    });

    it('balance general: activos = pasivo + patrimonio', async () => {
      const wb = await readXlsx((await binary(api('/exports/balance-sheet?format=xlsx&asOf=2031-02-28', 'view')).expect(200)).body);
      const rows = rowsOf(wb.worksheets[0]);
      expect(find(rows, 'Total activos')).toEqual(['', 'Total activos', 120300.5]);
      expect(find(rows, 'Total pasivos')).toEqual(['', 'Total pasivos', 3000]);
      expect(find(rows, 'Resultado del período')).toEqual(['', 'Resultado del período', 17300.5]);
      expect(find(rows, 'Total patrimonio')).toEqual(['', 'Total patrimonio', 117300.5]);
      expect(find(rows, 'TOTAL PASIVO + PATRIMONIO')).toEqual(['', 'TOTAL PASIVO + PATRIMONIO', 120300.5]);
    });

    it('flujo de efectivo cuadra con la variación real de caja', async () => {
      const wb = await readXlsx((await binary(api('/exports/cash-flow?format=xlsx&from=2031-01-01&to=2031-12-31', 'view')).expect(200)).body);
      const rows = rowsOf(wb.worksheets[0]);
      expect(find(rows, 'Flujo neto de operación')).toEqual(['', 'Flujo neto de operación', 17300.5]);
      expect(find(rows, 'Flujo neto de financiamiento')).toEqual(['', 'Flujo neto de financiamiento', 100000]);
      expect(find(rows, 'Efectivo al final del período')).toEqual(['', 'Efectivo al final del período', 117300.5]);
      expect(find(rows, 'Diferencia sin explicar')).toEqual(['', 'Diferencia sin explicar', 0]);
    });

    it('razones financieras: dos hojas, porcentajes con su formato', async () => {
      const wb = await readXlsx((await binary(api('/exports/financial-ratios?format=xlsx&from=2031-01-01&to=2031-12-31', 'view')).expect(200)).body);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Estado de resultados', 'Razones']);
      expect(find(rowsOf(wb.worksheets[0]), 'Utilidad neta')).toEqual(['Utilidad neta', 17300.5]);
      const ratios = wb.worksheets[1];
      const fmts = new Set<string>();
      ratios.eachRow((r) => r.eachCell((c) => { if (typeof c.value === 'number' && c.numFmt) fmts.add(c.numFmt); }));
      expect(fmts.has('0.00"%"')).toBe(true);
      const roe = ratios.getRows(1, ratios.rowCount)!.find((r) => r.getCell(2).value === 'Margen neto');
      expect(roe).toBeDefined();
      expect(roe!.getCell(4).value).toBeCloseTo((17300.5 / 25500.75) * 100, 3);
    });

    it('mayor general', async () => {
      const wb = await readXlsx((await binary(api('/exports/general-ledger?format=xlsx&to=2031-12-31', 'view')).expect(200)).body);
      const rows = rowsOf(wb.worksheets[0]);
      expect(find(rows, '1101')).toEqual(['1101', 'Caja general', 0, 125500.75, 8200.25, 117300.5]);
      expect(find(rows, '2101')).toEqual(['2101', 'Cuentas por pagar', 0, 0, 3000, 3000]);
      expect(find(rows, 'Totales')).toEqual(['Totales', '', undefined, 136701, 136701]);
    });

    it('mayor general con rango: saldo inicial = lo anterior al rango', async () => {
      const wb = await readXlsx((await binary(api('/exports/general-ledger?format=xlsx&from=2031-02-01&to=2031-02-28', 'view')).expect(200)).body);
      const rows = rowsOf(wb.worksheets[0]);
      expect(find(rows, '1101')).toEqual(['1101', 'Caja general', 100000, 25500.75, 8200.25, 117300.5]);
    });

    it('otra empresa no ve estas cuentas', async () => {
      const wb = await readXlsx((await binary(api('/exports/trial-balance?format=xlsx', 'adminb')).expect(200)).body);
      const rows = rowsOf(wb.worksheets[0]);
      expect(find(rows, '1101')).toBeUndefined();
      expect(rows[0][0]).toBe(`Exp B ${sfx}  -  RNC 131999999`);
    });
  });

  describe('PDF', () => {
    it('HTTP: es un PDF válido, descarga como attachment', async () => {
      const r = await binary(api('/exports/balance-sheet?format=pdf&asOf=2031-02-28', 'view')).expect(200);
      const b = r.body as Buffer;
      expect(r.headers['content-type']).toBe('application/pdf');
      expect(r.headers['content-disposition']).toBe('attachment; filename="balance-general_2031-02-28.pdf"');
      expect(r.headers['x-content-type-options']).toBe('nosniff');
      expect(b.subarray(0, 5).toString()).toBe('%PDF-');
      expect(b.subarray(-8).toString()).toContain('%%EOF');
    });

    it('contenido: empresa, título, cifras exactas y numeración (sin comprimir para poder leerlo)', async () => {
      const doc = await svc.trialBalance({ format: 'pdf', from: '2031-01-01', to: '2031-12-31' }, { id: 'x', email: 'x', role: 'ADMIN' as never, companyId: companyA });
      const { data } = await svc.render(doc, 'pdf', { compress: false });
      const t = pdfText(data);
      expect(t).toContain(`Exportación Ñandú ${sfx}  -  RNC ${RNC_A}`.replace('ó', 'ó'));
      expect(t).toContain('Balanza de comprobación');
      expect(t).toContain('Del 2031-01-01 al 2031-12-31');
      for (const s of ['1101', 'Caja general', '125,500.75', '8,200.25', '117,300.50', '-100,000.00', '136,701.00', 'Totales', 'Pagina 1 de 1']) {
        expect(t).toContain(s);
      }
      expect(t).not.toContain('Pagina 2');
    });

    it('estado de resultados y balance en PDF traen el resultado neto', async () => {
      const u = { id: 'x', email: 'x', role: 'ADMIN' as never, companyId: companyA };
      const is = pdfText((await svc.render(await svc.incomeStatementDoc({ format: 'pdf', from: '2031-01-01', to: '2031-12-31' }, u), 'pdf', { compress: false })).data);
      expect(is).toContain('RESULTADO NETO');
      expect(is).toContain('17,300.50');
      const bs = pdfText((await svc.render(await svc.balanceSheetDoc({ format: 'pdf', asOf: '2031-02-28' }, u), 'pdf', { compress: false })).data);
      expect(bs).toContain('TOTAL PASIVO + PATRIMONIO');
      expect(bs).toContain('117,300.50');
    });

    const bigDoc = (n: number): TableDoc => ({
      title: 'Prueba grande', fileBase: 'x', company: { name: 'Empresa' },
      sections: [{
        title: 'S', columns: [{ header: 'Código' }, { header: 'Descripción', w: 3 }, { header: 'Monto', fmt: 'money' }],
        rows: Array.from({ length: n }, (_, i) => ({ cells: [`C${i}`, i === 5 ? 'Texto larguísimo '.repeat(40) : i === 6 ? 'Mayor o igual ≥ 5' : `Fila ${i}`, i + 0.5] })),
        totals: ['Total', '', 1],
      }],
    });

    it('muchas filas: salta de página, repite el encabezado y no pierde filas', async () => {
      const data = await renderPdf(bigDoc(150), { compress: false });
      const t = pdfText(data);
      const pages = Number(/Pagina 1 de (\d+)/.exec(t)![1]);
      expect(pages).toBeGreaterThan(2);
      expect(t).toContain(`Pagina ${pages} de ${pages}`);
      expect((t.match(/Monto/g) ?? []).length).toBe(pages); // encabezado en cada página
      for (const i of [0, 60, 149]) expect(t).toContain(`C${i}`);
      expect(t).toContain('Fila 149');
      expect(t).toContain('149.50');
      expect((data.toString('latin1').match(/\/Type \/Page\b/g) ?? []).length).toBe(pages);
    });

    it('texto largo se recorta con "..." y caracteres fuera de WinAnsi salen como "?" (no corruptos)', async () => {
      const t = pdfText(await renderPdf(bigDoc(10), { compress: false }));
      expect(t).toContain('...');
      expect(t).not.toContain('Texto larguísimo '.repeat(10));
      expect(t).toContain('Mayor o igual ? 5');
    });

    it('documento vacío: dice "Sin datos" y sigue siendo un PDF válido', async () => {
      const d = bigDoc(0);
      d.sections[0].totals = undefined;
      const data = await renderPdf(d, { compress: false });
      expect(pdfText(data)).toContain('Sin datos para el período');
      expect(data.subarray(-8).toString()).toContain('%%EOF');
    });

    it('comprimido (el default) también es válido y más chico', async () => {
      const a = await renderPdf(bigDoc(150), { compress: false });
      const b = await renderPdf(bigDoc(150));
      expect(b.length).toBeLessThan(a.length);
      expect(b.subarray(0, 5).toString()).toBe('%PDF-');
    });
  });

  describe('Excel: hojas', () => {
    it('nombres de hoja: sin caracteres inválidos, máx. 31 y únicos', async () => {
      const mk = (title: string) => ({ title, columns: [{ header: 'A' }], rows: [{ cells: ['x'] }] });
      const wb = await readXlsx(await renderXlsx({
        title: 'T', fileBase: 'x', company: { name: 'E' },
        sections: [mk('Ventas/Compras: [2031]'), mk('Una hoja con un nombre larguísimo que pasa de 31'), mk('Una hoja con un nombre larguísimo que pasa de 31'), mk('ventas compras  2031 ')],
      }));
      const names = wb.worksheets.map((w) => w.name);
      expect(names.every((n) => n.length <= 31 && !/[\\/*?:[\]]/.test(n))).toBe(true);
      expect(new Set(names.map((n) => n.toLowerCase())).size).toBe(4);
    });
  });

  describe('DGII', () => {
    it('606: detalle, totales, resumen y observaciones (hay un error por falta de tipo de gasto)', async () => {
      const wb = await readXlsx((await binary(api('/exports/dgii/606?format=xlsx&period=2025-03', 'dgii')).expect(200)).body);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Detalle 606', 'Resumen', 'Observaciones']);
      const det = rowsOf(wb.worksheets[0]);
      const header = det.find((r) => r[0] === 'Factura')!;
      const col = (name: string) => header.indexOf(name);
      const p1 = det.find((r) => r[col('NCF')] === 'B0100000101')!;
      expect(p1[col('RNC/Cédula')]).toBe('101010101');
      expect(p1[col('Total facturado')]).toBe(1000);
      expect(p1[col('ITBIS facturado')]).toBe(180);
      expect(p1[col('ITBIS retenido')]).toBe(0);
      expect(p1[col('ITBIS por adelantar')]).toBe(180);
      expect(p1[col('ISR retenido')]).toBe(0);
      expect(p1[col('Forma de pago')]).toBe('02');
      expect(header).toContain('ITBIS al costo'); // columnas de detalle completas en Excel
      const totals = det.find((r) => r[0] === 'Totales')!;
      expect(totals[col('Total facturado')]).toBe(2000);
      expect(totals[col('ITBIS facturado')]).toBe(360);
      const summary = rowsOf(wb.worksheets[1]);
      expect(find(summary, 'Registros')).toEqual(['Registros', 2]);
      expect(find(summary, 'NO se puede generar el TXT: corrija los errores')).toBeDefined();
      const obs = rowsOf(wb.worksheets[2]);
      expect(obs.some((r) => r[0] === 'ERROR' && String(r[3]).includes('tipo de bienes y servicios'))).toBe(true);
    });

    it('607: la venta cobrada y la forma de pago', async () => {
      const wb = await readXlsx((await binary(api('/exports/dgii/607?format=xlsx&period=202503', 'dgii')).expect(200)).body);
      const det = rowsOf(wb.worksheets[0]);
      const header = det.find((r) => r[0] === 'Factura')!;
      const s1 = det.find((r) => r[header.indexOf('RNC/Cédula')] === '131123456' && r[0] !== 'Factura')!;
      expect(s1[header.indexOf('Monto facturado')]).toBe(1000);
      expect(s1[header.indexOf('ITBIS facturado')]).toBe(180);
      expect(s1[header.indexOf('Cheque/transferencia')]).toBe(1180);
      for (const z of ['ITBIS retenido', 'ISR retenido', 'Efectivo', 'Tarjeta', 'Crédito', 'Otras formas']) expect(s1[header.indexOf(z)]).toBe(0);
      expect(find(rowsOf(wb.worksheets[1]), 'Total facturado')).toEqual(['Total facturado', 1000 + 0]);
    });

    it('608: el comprobante anulado en abril', async () => {
      const wb = await readXlsx((await binary(api('/exports/dgii/608?format=xlsx&period=2025-04', 'dgii')).expect(200)).body);
      const rows = rowsOf(wb.worksheets[0]);
      const ncf = (await prisma.invoice.findUniqueOrThrow({ where: { id: id.S5 } })).ncf!;
      expect(find(rows, ncf)).toEqual([expect.any(String), ncf, '20250318', '03']);
      const empty = rowsOf((await readXlsx((await binary(api('/exports/dgii/608?format=xlsx&period=2025-03', 'dgii')).expect(200)).body)).worksheets[0]);
      expect(find(empty, ncf)).toBeUndefined();
    });

    it('606 en PDF: hoja horizontal con las columnas principales, sin las de detalle', async () => {
      const r = await binary(api('/exports/dgii/606?format=pdf&period=2025-03', 'dgii')).expect(200);
      expect((r.body as Buffer).toString('latin1')).toContain('/MediaBox [0 0 841.89 595.28]');
      const doc = await svc.dgiiDoc('606', { format: 'pdf', period: '2025-03' }, { id: 'x', email: 'x', role: 'ADMIN' as never, companyId: companyD });
      const t = pdfText((await svc.render(doc, 'pdf', { compress: false })).data);
      expect(t).toContain('DGII Formato 606 - Compras');
      expect(t).toContain('B0100000101');
      expect(t).toContain('Total facturado');
      expect(t).not.toContain('ITBIS al costo');
    });

    it('formato desconocido 404; período inválido 400', async () => {
      await api('/exports/dgii/609?format=xlsx&period=2025-03', 'dgii').expect(404);
      await api('/exports/dgii/606?format=xlsx&period=2025-13', 'dgii').expect(400);
    });
  });

  describe('validación y seguridad', () => {
    it('sin token 401', async () => {
      await request(app.getHttpServer()).get('/exports/trial-balance?format=xlsx').expect(401);
    });
    it('formato inválido o faltante: 400', async () => {
      await api('/exports/trial-balance?format=csv', 'view').expect(400);
      await api('/exports/trial-balance', 'view').expect(400);
    });
    it('fechas obligatorias en estado de resultados, flujo y razones; asOf en balance', async () => {
      await api('/exports/income-statement?format=pdf', 'view').expect(400);
      await api('/exports/cash-flow?format=pdf&from=2031-01-01', 'view').expect(400);
      await api('/exports/financial-ratios?format=pdf&to=2031-01-01', 'view').expect(400);
      await api('/exports/balance-sheet?format=pdf', 'view').expect(400);
    });
    it('parámetros desconocidos se rechazan', async () => {
      await api('/exports/trial-balance?format=xlsx&companyId=otra', 'view').expect(400);
    });
    it('rango invertido: 400', async () => {
      await api('/exports/income-statement?format=xlsx&from=2031-12-31&to=2031-01-01', 'view').expect(400);
    });
  });
});
