import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import ExcelJS from 'exceljs';
import JSZip from 'jszip'; // viene con exceljs
import { readFileSync } from 'node:fs';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Importar/exportar el plan de cuentas y cargar el catálogo estándar de RD.
 * Catálogo RD (204 filas del Excel de Carlos): 6 cuentas de orden (grupo 8) se omiten => 198 cuentas.
 * De ellas 55 agrupadoras (Control) y 143 que reciben movimientos; 15 contra-cuentas
 * (13 por ser Reguladora o tener naturaleza contraria en una cuenta de detalle + 1202 y 4103, agrupadoras de naturaleza contraria).
 */
describe('Plan de cuentas: importar, exportar y catálogo RD (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `coa-${r}-${sfx}@test.local`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const accB: Record<string, string> = {};

  const api = (m: 'get' | 'post', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);
  const binary = (r: request.Test) => r.buffer(true).parse((res, cb) => {
    const c: Buffer[] = []; res.on('data', (d: Buffer) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c)));
  });
  const upload = (url: string, who: string, data: Buffer, filename: string) =>
    api('post', url, who).attach('file', data, { filename });
  const csv = (lines: string[][]) => Buffer.from(lines.map((l) => l.map((c) => `"${c.replace(/"/g, '""')}"`).join(',')).join('\n'), 'utf8');
  const HEAD = ['Código de Cuenta', 'Nombre / Descripción de la Cuenta', 'Nivel', 'Tipo de Cuenta', 'Naturaleza', 'Estado Financiero / Formato DGII'];
  const count = (companyId: string) => prisma.account.count({ where: { companyId } });
  const byCode = async (companyId: string) => {
    const all = await prisma.account.findMany({ where: { companyId } });
    const ids = new Map(all.map((a) => [a.id, a.code]));
    return new Map(all.map((a) => [a.code, { ...a, parentCode: a.parentId ? ids.get(a.parentId) : null }]));
  };

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `COA A ${sfx}`, taxId: `C-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `COA B ${sfx}`, taxId: `C-B-${sfx}` } })).id;
    for (const [r, role, companyId] of [
      ['admin', UserRole.ADMIN, companyA], ['acct', UserRole.ACCOUNTANT, companyA], ['appr', UserRole.APPROVER, companyA],
      ['view', UserRole.VIEWER, companyA], ['adminb', UserRole.ADMIN, companyB],
    ] as const) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    // Empresa B: dos cuentas con un movimiento entre ellas
    accB.caja = (await prisma.account.create({ data: { companyId: companyB, code: '1101', name: 'Caja B', type: 'ASSET' } })).id;
    accB.ventas = (await prisma.account.create({ data: { companyId: companyB, code: '4101', name: 'Ventas B', type: 'INCOME' } })).id;
    await api('post', '/accounting/journal-entries', 'adminb').send({
      date: '2031-01-10', description: 'Venta de contado',
      lines: [{ accountId: accB.caja, debit: 100 }, { accountId: accB.ventas, credit: 100 }],
    }).expect(201);
  }, 60000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    const where = { companyId: { in: ids } };
    await prisma.auditLog.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.account.updateMany({ where, data: { parentId: null } });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  // ------------------------------------------------------------------
  describe('Catálogo estándar de RD', () => {
    it('la vista previa no guarda nada (y la puede ver cualquier rol)', async () => {
      const r = await api('get', '/chart-of-accounts/standard/rd/preview', 'view').expect(200);
      expect(r.body.resumen).toEqual({ crear: 198, actualizar: 0, sinCambios: 0, omitidas: 6, errores: 0 });
      expect(r.body.avisos).toContain('Se omiten 6 cuentas de orden; no afectan los estados financieros');
      expect(r.body.filas).toHaveLength(204);
      expect(r.body.filas.find((f: { codigo: string }) => f.codigo === '1101-03-01')).toEqual({
        fila: 7, codigo: '1101-03-01', nombre: 'Banco de Reservas Cta. Cte. DOP', tipo: 'ASSET', padre: '1101-03', accion: 'create', mensajes: [],
      });
      expect(r.body.filas.find((f: { codigo: string }) => f.codigo === '8101-01')).toMatchObject({ accion: 'skip', tipo: null });
      expect(await count(companyA)).toBe(0);
    });

    it('VIEWER y APPROVER no pueden cargarlo', async () => {
      await api('post', '/chart-of-accounts/standard/rd', 'view').expect(403);
      await api('post', '/chart-of-accounts/standard/rd', 'appr').expect(403);
      expect(await count(companyA)).toBe(0);
    });

    it('cargarlo en una empresa vacía: conteos, jerarquía, contra-cuentas y sin cuentas de orden', async () => {
      const r = await api('post', '/chart-of-accounts/standard/rd', 'acct').expect(201);
      expect(r.body.resumen).toEqual({ crear: 198, actualizar: 0, sinCambios: 0, omitidas: 6, errores: 0 });
      // 52 cuentas traen categoría en el JSON (propuesta); las otras 91 de detalle las clasifica la auto-clasificación
      expect(r.body.clasificadas).toBe(91);

      const acc = await byCode(companyA);
      const all = [...acc.values()];
      expect(all).toHaveLength(198);
      expect(all.filter((a) => a.code.startsWith('8'))).toEqual([]);
      expect(all.filter((a) => !a.isPostable)).toHaveLength(55);
      expect(all.filter((a) => a.isContra)).toHaveLength(15);
      expect(all.filter((a) => !a.parentId).map((a) => a.code).sort()).toEqual(['1', '2', '3', '4', '5', '6', '7']);
      // Tipos por el primer dígito
      const types = Object.fromEntries(['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'].map((t) => [t, all.filter((a) => a.type === t).length]));
      expect(types).toEqual({ ASSET: 61, LIABILITY: 37, EQUITY: 16, INCOME: 19, EXPENSE: 65 });
      // Jerarquía: con guion se quita el último segmento; sin guion, el prefijo más largo
      expect(acc.get('1101-03-01')!.parentCode).toBe('1101-03');
      expect(acc.get('1101-03')!.parentCode).toBe('1101');
      expect(acc.get('1101')!.parentCode).toBe('11');
      expect(acc.get('11')!.parentCode).toBe('1');
      expect(acc.get('7101')!.parentCode).toBe('71');
      // Errata corregida, sangría recortada, descripción = columna DGII, Reguladora = contra y recibe movimientos
      expect(acc.get('1102-07')).toMatchObject({
        name: '(-) Provisión para Cuentas Incobrables', isContra: true, isPostable: true, type: 'ASSET',
        description: 'Balance General (Ley 11-92 Art. 287)',
      });
      expect(acc.get('1101-01')!.name).toBe('Caja General');
      // Naturaleza contraria a la del tipo => contra (agrupadora 1202 y detalle 3301-02)
      expect(acc.get('1202')).toMatchObject({ isContra: true, isPostable: false });
      expect(acc.get('3301-02')).toMatchObject({ isContra: true, isPostable: true, type: 'EQUITY' });
      expect(acc.get('1101-01')).toMatchObject({ isContra: false, isPostable: true });
      // Clasificación automática aplicada sin perder la contra-cuenta
      expect(acc.get('1101-01')!.category).toBe('CASH_AND_EQUIVALENTS');
      expect(acc.get('1202-01')).toMatchObject({ category: 'PROPERTY_PLANT_EQUIPMENT', isContra: true });
      expect(acc.get('4103-01')).toMatchObject({ isContra: true });
      expect(acc.get('1')!.category).toBeNull(); // las agrupadoras no se clasifican
      expect(all.filter((a) => a.isPostable && !a.category).map((a) => a.code)).toEqual([]);
      // Categoría del JSON: con su flujo de efectivo; auxiliar solo en CxC/CxP que no son contra
      expect(acc.get('2102-04')).toMatchObject({ category: 'TAXES_PAYABLE', cashFlowCategory: 'OPERATING', subledger: null });
      expect(acc.get('2201-02')).toMatchObject({ category: 'LONG_TERM_DEBT', cashFlowCategory: 'FINANCING' });
      expect(acc.get('5101-03')).toMatchObject({ category: 'COST_OF_SALES', cashFlowCategory: null });
      expect(acc.get('1102-04')).toMatchObject({ category: 'ACCOUNTS_RECEIVABLE', subledger: 'RECEIVABLE' });
      expect(acc.get('1102-07')).toMatchObject({ category: 'ACCOUNTS_RECEIVABLE', subledger: null, isContra: true });
      // Clasificadas por la auto-clasificación: con flujo y auxiliar
      expect(acc.get('1102-01')).toMatchObject({ category: 'ACCOUNTS_RECEIVABLE', cashFlowCategory: 'OPERATING', subledger: 'RECEIVABLE' });
      // Bitácora en la misma operación
      const audit = await prisma.auditLog.findFirst({ where: { companyId: companyA, entityName: 'Account', entityId: 'import' } });
      expect((audit!.changes as { creadas: string[] }).creadas).toHaveLength(198);
      // La otra empresa no se toca
      expect(await count(companyB)).toBe(2);
    });

    it('volver a cargarlo no duplica ni cambia nada', async () => {
      const r = await api('post', '/chart-of-accounts/standard/rd', 'admin').expect(201);
      expect(r.body.resumen).toEqual({ crear: 0, actualizar: 0, sinCambios: 198, omitidas: 6, errores: 0 });
      expect(await count(companyA)).toBe(198);
    });

    it('el Excel original de Carlos se lee tal cual (filas de título, sangría): solo cambian las 3 erratas corregidas', async () => {
      const file = readFileSync('docs/catalogos/Catalogo_de_Cuentas_Estandar_RD.xlsx');
      const r = await upload('/chart-of-accounts/import/preview', 'acct', file, 'Catalogo_de_Cuentas_Estandar_RD.xlsx').expect(201);
      expect(r.body.resumen).toEqual({ crear: 0, actualizar: 3, sinCambios: 195, omitidas: 6, errores: 0 });
      expect(r.body.filas.filter((f: { accion: string }) => f.accion === 'update').map((f: { codigo: string; fila: number }) => [f.codigo, f.fila]))
        .toEqual([['1102-07', 24], ['4101-01', 122], ['6105-02', 183]]);
    });
  });

  // ------------------------------------------------------------------
  describe('Exportar', () => {
    it('inyección de fórmulas: los textos que empiezan con = + - @ salen con una comilla delante', async () => {
      for (const [code, name] of [['9001', '=HYPERLINK("http://malo","clic")'], ['9002', '+cmd|calc'], ['9003', '-2+3'], ['9004', '@SUMA(A1)']]) {
        await prisma.account.create({ data: { companyId: companyA, code, name, type: 'EXPENSE', description: '=1+1' } });
      }
      const text = (await api('get', '/chart-of-accounts/export?format=csv', 'view').expect(200)).text;
      expect(text).toContain(`"'=HYPERLINK(""http://malo"",""clic"")"`);
      expect(text).toContain(`"'+cmd|calc"`);
      expect(text).toContain(`"'-2+3"`);
      expect(text).toContain(`"'@SUMA(A1)"`);
      expect(text).toContain(`"'=1+1"`);
      expect(text).not.toMatch(/(^|,)"[=+\-@]/m);

      const res = await binary(api('get', '/chart-of-accounts/export?format=xlsx', 'view')).expect(200);
      expect(res.headers['content-type']).toMatch(/spreadsheetml/);
      expect(res.headers['content-disposition']).toMatch(/attachment; filename="plan-de-cuentas_\d{4}-\d{2}-\d{2}\.xlsx"/);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as never);
      const cells: ExcelJS.Cell[] = [];
      wb.worksheets[0].eachRow((r) => r.eachCell((c) => cells.push(c)));
      expect(cells.filter((c) => c.type === ExcelJS.ValueType.Formula)).toEqual([]);
      expect(cells.map((c) => c.text)).toContain(`'=HYPERLINK("http://malo","clic")`);
      expect(cells.filter((c) => /^[=+\-@]/.test(c.text))).toEqual([]);
    });

    it('ida y vuelta: lo exportado (xlsx y csv) se vuelve a importar y da "sin cambios"', async () => {
      const n = await count(companyA);
      const xlsx = (await binary(api('get', '/chart-of-accounts/export?format=xlsx', 'acct')).expect(200)).body as Buffer;
      const r1 = await upload('/chart-of-accounts/import/preview', 'acct', xlsx, 'plan.xlsx').expect(201);
      expect(r1.body.resumen).toEqual({ crear: 0, actualizar: 0, sinCambios: n, omitidas: 0, errores: 0 });
      expect(r1.body.filas.every((f: { mensajes: string[] }) => f.mensajes.length === 0)).toBe(true);
      const csvFile = Buffer.from((await api('get', '/chart-of-accounts/export?format=csv', 'acct').expect(200)).text, 'utf8');
      const r2 = await upload('/chart-of-accounts/import', 'acct', csvFile, 'plan.csv').expect(201);
      expect(r2.body.resumen).toEqual({ crear: 0, actualizar: 0, sinCambios: n, omitidas: 0, errores: 0 });
      expect(r2.body.clasificadas).toBe(0);
    });

    it('la exportación es de la propia empresa (aislamiento)', async () => {
      const text = (await api('get', '/chart-of-accounts/export?format=csv', 'adminb').expect(200)).text;
      const lines = text.trim().split(/\r?\n/);
      expect(lines).toHaveLength(3); // encabezado + 1101 y 4101 de B
      expect(text).toContain('Caja B');
      expect(text).not.toContain('Caja General');
    });

    it('formato inválido: 400 en español; plantilla con hoja de instrucciones', async () => {
      const bad = await api('get', '/chart-of-accounts/export?format=pdf', 'view').expect(400);
      expect(JSON.stringify(bad.body.message)).toMatch(/El formato debe ser Excel \(xlsx\) o CSV/);
      expect(JSON.stringify(bad.body.message)).not.toMatch(/\bformat\b/);
      const res = await binary(api('get', '/chart-of-accounts/template', 'view')).expect(200);
      const wb = new ExcelJS.Workbook();
      await wb.xlsx.load(res.body as never);
      expect(wb.worksheets.map((w) => w.name)).toEqual(['Plan de cuentas', 'Instrucciones']);
      expect(wb.worksheets[0].getRow(1).getCell(1).text).toBe('Código de Cuenta');
      // La plantilla vacía se reconoce, pero no tiene cuentas
      const r = await upload('/chart-of-accounts/import/preview', 'acct', res.body, 'plantilla.xlsx').expect(400);
      expect(r.body.message).toMatch(/no tiene cuentas/);
    });
  });

  // ------------------------------------------------------------------
  describe('Importar un archivo', () => {
    it('todo o nada: con una fila errónea no se guarda ninguna', async () => {
      const n = await count(companyA);
      const file = csv([
        ['Plan de prueba'], [], HEAD,
        ['1101-06', 'Caja de eventos', '4', 'Detalle', 'Debito', 'Balance General'],
        ['1101-01', 'Caja General Principal', '4', 'Detalle', 'Debito', ''],
        ['6105-05', 'Gasto raro', '4', 'Detalle', 'Mitad y mitad', ''],
        ['1101-06', 'Repetida', '4', 'Detalle', 'Debito', ''],
      ]);
      const p = await upload('/chart-of-accounts/import/preview', 'acct', file, 'plan.csv').expect(201);
      expect(p.body.resumen).toEqual({ crear: 1, actualizar: 1, sinCambios: 0, omitidas: 0, errores: 2 });
      expect(p.body.filas.map((f: { fila: number; accion: string }) => [f.fila, f.accion])).toEqual([[4, 'create'], [5, 'update'], [6, 'error'], [7, 'error']]);
      expect(p.body.filas[2].mensajes[0]).toMatch(/Naturaleza/);
      expect(p.body.filas[3].mensajes[0]).toMatch(/repetido.*fila 4/);

      const r = await upload('/chart-of-accounts/import', 'acct', file, 'plan.csv').expect(422);
      expect(r.body.message).toMatch(/2 filas con errores. No se guardó nada/);
      expect(r.body.resumen.errores).toBe(2);
      expect(r.body.filas).toHaveLength(4);
      expect(await count(companyA)).toBe(n);
      expect((await prisma.account.findFirst({ where: { companyId: companyA, code: '1101-01' } }))!.name).toBe('Caja General');
    });

    it('crea las nuevas y actualiza nombre/descripción de las existentes (punto y coma, padre deducido)', async () => {
      const file = Buffer.from([HEAD.join(';'), '1101-06;Caja de eventos;4;Detalle;Debito;Balance General', '1101-01;Caja General Principal;4;Detalle;Debito;'].join('\r\n'));
      const r = await upload('/chart-of-accounts/import', 'admin', file, 'plan.csv').expect(201);
      expect(r.body.resumen).toEqual({ crear: 1, actualizar: 1, sinCambios: 0, omitidas: 0, errores: 0 });
      const acc = await byCode(companyA);
      expect(acc.get('1101-06')).toMatchObject({ parentCode: '1101', type: 'ASSET', isPostable: true, category: 'CASH_AND_EQUIVALENTS' });
      // Descripción vacía en el archivo: no borra la que había
      expect(acc.get('1101-01')).toMatchObject({ name: 'Caja General Principal', description: 'Balance General' });
    });

    it('no cambia el tipo ni el padre de una cuenta con movimientos: error claro y nada se guarda', async () => {
      const file = csv([
        [...HEAD, 'Tipo (sistema)'],
        ['1101', 'Caja B', '1', 'Detalle', 'Credito', '', 'Pasivo'],
        ['4', 'INGRESOS', '1', 'Control', 'Credito', ''],
        ['41', 'INGRESOS OPERACIONALES', '2', 'Control', 'Credito', ''],
      ]);
      const p = await upload('/chart-of-accounts/import/preview', 'adminb', file, 'b.csv').expect(201);
      const [caja, , g41] = p.body.filas;
      expect(caja).toMatchObject({ accion: 'error', tipo: 'LIABILITY' });
      expect(caja.mensajes[0]).toMatch(/ya existe como Activo y el archivo dice Pasivo. La cuenta ya tiene movimientos/);
      expect(g41.accion).toBe('create');
      // 4101 (con movimientos) no está en el archivo: no se toca aunque 41 sea nueva
      await upload('/chart-of-accounts/import', 'adminb', file, 'b.csv').expect(422);
      expect((await prisma.account.findUniqueOrThrow({ where: { id: accB.caja } })).type).toBe('ASSET');
      expect(await count(companyB)).toBe(2);

      // Cambio de padre de una cuenta con movimientos: 1101 quedaría bajo la nueva "11"
      const parentFile = csv([HEAD, ['11', 'ACTIVO CORRIENTE', '2', 'Control', 'Debito', ''], ['1101', 'Caja B', '3', 'Detalle', 'Debito', '']]);
      const p2 = await upload('/chart-of-accounts/import/preview', 'adminb', parentFile, 'b.csv').expect(201);
      expect(p2.body.filas[1].mensajes[0]).toMatch(/ya existe sin cuenta padre y el archivo la pone bajo 11. La cuenta ya tiene movimientos/);
    });

    it('no crea subcuentas bajo una cuenta con movimientos (el motor ya no dejaría registrar en ella)', async () => {
      // Caso de QA: 1101 de B tiene un asiento; importar 1101-01 la dejaría con subcuentas
      const file = csv([HEAD, ['1101-01', 'Caja chica', '4', 'Detalle', 'Debito', '']]);
      const p = await upload('/chart-of-accounts/import/preview', 'adminb', file, 'b.csv').expect(201);
      expect(p.body.filas[0]).toMatchObject({
        codigo: '1101-01', padre: '1101', accion: 'error',
        mensajes: ['La cuenta 1101 Caja B ya tiene movimientos: no puede tener subcuentas. Crea la subcuenta debajo de una cuenta de grupo'],
      });
      const r = await upload('/chart-of-accounts/import', 'adminb', file, 'b.csv').expect(422);
      expect(r.body.filas[0].mensajes[0]).toMatch(/ya tiene movimientos: no puede tener subcuentas/);
      expect(await count(companyB)).toBe(2);
      // 1101 sigue recibiendo movimientos
      await api('post', '/accounting/journal-entries', 'adminb').send({
        date: '2031-01-11', description: 'Otra venta', lines: [{ accountId: accB.caja, debit: 50 }, { accountId: accB.ventas, credit: 50 }],
      }).expect(201);
    });

    it('subcuenta bajo una cuenta "Detalle" del mismo archivo: error en la vista previa y en la importación', async () => {
      const file = csv([HEAD, ['6', 'GASTOS', '1', 'Control', 'Debito', ''], ['61', 'Gastos varios', '2', 'Detalle', 'Debito', ''], ['6101', 'Papelería', '3', 'Detalle', 'Debito', '']]);
      const p = await upload('/chart-of-accounts/import/preview', 'adminb', file, 'b.csv').expect(201);
      expect(p.body.filas[2].mensajes[0]).toMatch(/padre 61 está marcada como "Detalle" en la fila 3: una cuenta de detalle recibe movimientos y no puede tener subcuentas/);
      await upload('/chart-of-accounts/import', 'adminb', file, 'b.csv').expect(422);
      expect(await count(companyB)).toBe(2);
    });

    it('byte nulo en un nombre: el CSV se rechaza como no válido (400) y en Excel es error en la fila; nunca 500', async () => {
      const file = Buffer.from(`${HEAD.slice(0, 2).join(',')}\r\n6101,Gasto\u0000raro\r\n`, 'utf8');
      const c = await upload('/chart-of-accounts/import', 'adminb', file, 'b.csv').expect(400);
      expect(c.body.message).toMatch(/Excel|CSV/);
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Plan');
      ws.addRow(HEAD.slice(0, 2));
      ws.addRow(['6101', 'Gasto raro']);
      // En el xlsx el byte nulo se escribe como _x0000_ (exceljs lo convierte de vuelta a \u0000)
      const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
      zip.file('xl/sharedStrings.xml', (await zip.file('xl/sharedStrings.xml')!.async('string')).replace('Gasto raro', 'Gasto_x0000_raro'));
      const xlsx = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      const p = await upload('/chart-of-accounts/import/preview', 'adminb', xlsx, 'b.xlsx').expect(201);
      expect(p.body.filas[0]).toMatchObject({ accion: 'error', mensajes: ['El nombre tiene un carácter invisible no válido. Vuelve a escribirlo a mano'] });
      await upload('/chart-of-accounts/import', 'adminb', xlsx, 'b.xlsx').expect(422);
      expect(await count(companyB)).toBe(2);
    });

    it('aislamiento: los códigos de otra empresa no cuentan y nada se cruza', async () => {
      // En B, el catálogo RD se crearía casi completo (lo de A no existe para B); 1101 choca con la de B,
      // y las subcuentas de 1101 y 4101 (con movimientos en B) no se pueden crear
      const r = await api('get', '/chart-of-accounts/standard/rd/preview', 'adminb').expect(200);
      expect(r.body.resumen.crear).toBeGreaterThan(180);
      expect(r.body.filas.find((f: { codigo: string }) => f.codigo === '1101').accion).toBe('error');
      expect(r.body.filas.find((f: { codigo: string }) => f.codigo === '4101-01').mensajes[0]).toMatch(/4101 Ventas B ya tiene movimientos/);
      const nA = await count(companyA);
      const file = csv([HEAD, ['5', 'COSTOS', '1', 'Control', 'Debito', '']]);
      await upload('/chart-of-accounts/import', 'adminb', file, 'b.csv').expect(201);
      expect(await count(companyB)).toBe(3);
      expect(await count(companyA)).toBe(nA);
    });

    it('permisos: VIEWER y APPROVER no pueden importar ni previsualizar archivos', async () => {
      const file = csv([HEAD, ['1101-07', 'X', '4', 'Detalle', 'Debito', '']]);
      for (const who of ['view', 'appr']) {
        await upload('/chart-of-accounts/import/preview', who, file, 'p.csv').expect(403);
        await upload('/chart-of-accounts/import', who, file, 'p.csv').expect(403);
      }
      await upload('/chart-of-accounts/import/preview', 'admin', file, 'p.csv').expect(201);
    });
  });

  // ------------------------------------------------------------------
  describe('Seguridad de la subida', () => {
    it('más de 2 MB: 413 con mensaje en español', async () => {
      const big = Buffer.concat([csv([HEAD]), Buffer.alloc(2 * 1024 * 1024, 0x41)]);
      const r = await upload('/chart-of-accounts/import/preview', 'acct', big, 'grande.csv').expect(413);
      expect(r.body.message).toMatch(/más de 2 MB/);
    });

    it('más de 5.000 filas: 400 en español', async () => {
      const rows = Array.from({ length: 5001 }, (_, i) => [`1101-${String(i + 100).padStart(4, '0')}`, `Cuenta ${i}`]);
      const r = await upload('/chart-of-accounts/import/preview', 'acct', csv([HEAD.slice(0, 2), ...rows]), 'muchas.csv').expect(400);
      expect(r.body.message).toMatch(/más de 5\.000 filas/);
    });

    it('archivos que no son Excel ni CSV se rechazan por el contenido, no por el nombre', async () => {
      const pdf = Buffer.from('%PDF-1.4\n%fake\n');
      for (const [data, name] of [[pdf, 'plan.xlsx'], [pdf, 'plan.pdf'], [Buffer.from([0, 1, 2, 3, 0, 0]), 'plan.csv'], [Buffer.from('hola'), 'plan.txt'], [Buffer.from('PK\x03\x04basura'), 'plan.xlsx']] as const) {
        const r = await upload('/chart-of-accounts/import/preview', 'acct', data, name).expect(400);
        expect(r.body.message, name).toMatch(/Excel|dañado/);
      }
      const r = await api('post', '/chart-of-accounts/import/preview', 'acct').expect(400);
      expect(r.body.message).toMatch(/Falta el archivo/);
    });

    it('CSV sin encabezado reconocible: 400 que explica qué falta', async () => {
      const r = await upload('/chart-of-accounts/import/preview', 'acct', Buffer.from('a,b\n1,2\n'), 'x.csv').expect(400);
      expect(r.body.message).toMatch(/No se encontró el encabezado/);
    });

    it('"bomba de celdas combinadas": un xlsx de pocos KB con rangos sobre toda la hoja se lee sin agotar la memoria', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Plan');
      ws.addRow(HEAD);
      ws.addRow(['9101', 'Cuenta de prueba', '1', 'Detalle', 'Debito', '']);
      const zip = await JSZip.loadAsync(await wb.xlsx.writeBuffer());
      const all = 'A1:XFD1048576';
      const sheet = (await zip.file('xl/worksheets/sheet1.xml')!.async('string')).replace('</sheetData>', '</sheetData>'
        + `<conditionalFormatting sqref="${all}"><cfRule type="expression" dxfId="0" priority="1"><formula>TRUE</formula></cfRule></conditionalFormatting>`
        + `<mergeCells count="1"><mergeCell ref="${all}"/></mergeCells>`
        + `<dataValidations count="1"><dataValidation type="list" allowBlank="1" sqref="${all}"><formula1>"a,b"</formula1></dataValidation></dataValidations>`);
      zip.file('xl/worksheets/sheet1.xml', sheet);
      const buf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      expect(buf.length).toBeLessThan(20 * 1024);
      const t = Date.now();
      const r = await upload('/chart-of-accounts/import/preview', 'acct', buf, 'celdas.xlsx').expect(201);
      expect(Date.now() - t).toBeLessThan(5000);
      expect(r.body.filas).toEqual([expect.objectContaining({ codigo: '9101', nombre: 'Cuenta de prueba' })]);

      // Un nombre definido sobre toda la hoja (exceljs también lo expande celda por celda): 400 en español
      const withName = async (ref: string) => {
        const z = await JSZip.loadAsync(buf);
        const book = (await z.file('xl/workbook.xml')!.async('string')).replace('</sheets>', `</sheets><definedNames><definedName name="zona">Plan!${ref}</definedName></definedNames>`);
        z.file('xl/workbook.xml', book);
        return z.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
      };
      const big = await upload('/chart-of-accounts/import/preview', 'acct', await withName('$A$1:$XFD$1048576'), 'nombre.xlsx').expect(400);
      expect(big.body.message).toMatch(/nombre definido que cubre una zona enorme/);
      // Columnas enteras (área de impresión típica de Excel) o un rango normal: se aceptan
      await upload('/chart-of-accounts/import/preview', 'acct', await withName('$A:$J'), 'nombre.xlsx').expect(201);
      await upload('/chart-of-accounts/import/preview', 'acct', await withName('$A$1:$J$5001'), 'nombre.xlsx').expect(201);
      expect(Date.now() - t).toBeLessThan(5000);
    });

    it('CSV de 2 MB de solo saltos de línea: se responde rápido, sin acumular filas vacías', async () => {
      const t = Date.now();
      const nl = Buffer.from(`${HEAD.slice(0, 2).join(',')}\n${'\n'.repeat(2 * 1024 * 1024 - 100)}`);
      const r = await upload('/chart-of-accounts/import/preview', 'acct', nl, 'vacio.csv').expect(400);
      expect(r.body.message).toMatch(/no tiene cuentas/);
      // Muchísimas filas cortas: se corta al pasar del máximo
      const many = Buffer.from(`${HEAD.slice(0, 2).join(',')}\n${'1,a\n'.repeat(400_000)}`);
      const r2 = await upload('/chart-of-accounts/import/preview', 'acct', many, 'muchas.csv').expect(400);
      expect(r2.body.message).toMatch(/más de 5\.000 filas/);
      expect(Date.now() - t).toBeLessThan(3000);
    });

    it('"bomba zip": un xlsx pequeño que se infla a más de 30 MB se rechaza', async () => {
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Plan');
      ws.addRow(HEAD);
      ws.addRow(['1', 'A'.repeat(31 * 1024 * 1024)]);
      const buf = Buffer.from(await wb.xlsx.writeBuffer());
      expect(buf.length).toBeLessThan(2 * 1024 * 1024);
      const r = await upload('/chart-of-accounts/import/preview', 'acct', buf, 'bomba.xlsx').expect(400);
      expect(r.body.message).toMatch(/dañado o es demasiado grande/);
    });
  });

  // ------------------------------------------------------------------
  describe('Rendimiento', () => {
    it('5.000 cuentas renombradas en una importación: menos de 5 s, con bitácora y sin tocar la otra empresa', async () => {
      const parentId = (await prisma.account.create({ data: { companyId: companyA, code: '6900', name: 'Grupo de prueba', type: 'EXPENSE', isPostable: false } })).id;
      const codes = Array.from({ length: 5000 }, (_, i) => `6900-${String(i).padStart(4, '0')}`);
      await prisma.account.createMany({ data: codes.map((code) => ({ companyId: companyA, code, name: `Cuenta ${code}`, type: 'EXPENSE' as const, parentId })) });
      const file = csv([HEAD.slice(0, 2), ...codes.map((c) => [c, `Cuenta nueva ${c}`])]);
      const t = Date.now();
      const r = await upload('/chart-of-accounts/import', 'acct', file, 'renombres.csv').expect(201);
      const ms = Date.now() - t;
      expect(r.body.resumen).toMatchObject({ crear: 0, actualizar: 5000, errores: 0 });
      expect(ms).toBeLessThan(5000);
      const renamed = await prisma.account.count({ where: { companyId: companyA, code: { in: codes }, name: { startsWith: 'Cuenta nueva 6900-' } } });
      expect(renamed).toBe(5000);
      const audit = await prisma.auditLog.findFirst({ where: { companyId: companyA, entityName: 'Account', entityId: 'import' }, orderBy: { createdAt: 'desc' } });
      const changes = audit!.changes as { actualizadas: { code: string; before: { name: string }; after: { name: string } }[] };
      expect(changes.actualizadas).toHaveLength(5000);
      expect(changes.actualizadas[0]).toMatchObject({ code: '6900-0000', before: { name: 'Cuenta 6900-0000' }, after: { name: 'Cuenta nueva 6900-0000' } });
      expect(await count(companyB)).toBe(3);
    }, 60000);
  });
});
