import { MAX_ROWS, buildPlan, deduceParent, neutralize, parseCsv, rowsFromGrid, unneutralize, type ExistingAccount, type RawRow } from './chart-of-accounts.rules.js';

const row = (fila: number, codigo: string, nombre: string, tipoCuenta = 'Detalle', naturaleza = '', extra: Partial<RawRow> = {}): RawRow =>
  ({ fila, codigo, nombre, tipoCuenta, naturaleza, ...extra });
const existing = (a: Partial<ExistingAccount> & { code: string }): [string, ExistingAccount] => [a.code, {
  id: `id-${a.code}`, name: a.code, type: 'ASSET', parentCode: null, description: null, isPostable: true, isContra: false,
  category: null, active: true, hasMovements: false, ...a,
}];

describe('Plan de cuentas: reglas de conversión', () => {
  it('padre: con guion se quita el último segmento; sin guion, el prefijo más largo que exista', () => {
    const known = new Set(['1', '11', '1101', '1101-03']);
    expect(deduceParent('1101-03-01', known)).toBe('1101-03');
    expect(deduceParent('1101-03', known)).toBe('1101');
    expect(deduceParent('1101', known)).toBe('11');
    expect(deduceParent('11', known)).toBe('1');
    expect(deduceParent('1', known)).toBeNull();
    expect(deduceParent('1205', known)).toBe('1'); // no hay "12": salta al siguiente prefijo
    expect(deduceParent('9001', known)).toBeNull();
  });

  it('inyección de fórmulas: comilla delante al exportar y se quita al importar', () => {
    for (const s of ['=1+1', '+A1', '-2', '@SUM(A1)']) {
      expect(neutralize(s)).toBe(`'${s}`);
      expect(unneutralize(neutralize(s))).toBe(s);
    }
    // Tabulador y retorno de carro delante también se neutralizan
    for (const s of ['\t=1+1', '\r=1+1', '\tnombre']) {
      expect(neutralize(s)).toBe(`'${s}`);
      expect(unneutralize(neutralize(s))).toBe(s);
    }
    expect(neutralize('(-) Provisión')).toBe('(-) Provisión');
    expect(neutralize('Caja\tGeneral')).toBe('Caja\tGeneral');
    expect(unneutralize("'texto con comilla")).toBe("'texto con comilla");
  });

  it('CSV: BOM, comillas, saltos de línea dentro de comillas, punto y coma y filas de título', () => {
    const grid = parseCsv('﻿Catálogo de prueba\n\n"Código de Cuenta";"Nombre / Descripción de la Cuenta"\n1;"Activo; ""total""\nsegunda línea"\r\n2;Pasivo\n');
    const rows = rowsFromGrid(grid)!;
    expect(rows).toEqual([
      { fila: 4, codigo: '1', nombre: 'Activo; "total"\nsegunda línea' },
      { fila: 6, codigo: '2', nombre: 'Pasivo' },
    ]);
    expect(rowsFromGrid(parseCsv('a,b\n1,2'))).toBeNull();
  });

  it('tipo por el primer dígito, contra por Reguladora o por naturaleza contraria, grupo 8 omitido', () => {
    const p = buildPlan([
      row(1, '1', 'ACTIVO', 'Control', 'Debito'),
      row(2, '1202', 'Depreciación acumulada', 'Control', 'Crédito'),
      row(3, '1202-01', 'Dep. edificios', 'Reguladora', 'Crédito'),
      row(4, '4', 'INGRESOS', 'Control', 'Crédito'),
      row(5, '4103', 'Devoluciones', '', 'Debito'),
      row(6, '7', 'ISR', 'Control'),
      row(7, '8', 'CUENTAS DE ORDEN', 'Control'),
      row(8, '8101-01', 'Garantías', 'Detalle'),
    ], new Map());
    expect(p.resumen).toEqual({ crear: 6, actualizar: 0, sinCambios: 0, omitidas: 2, errores: 0 });
    expect(p.avisos).toEqual(['Se omiten 2 cuentas de orden; no afectan los estados financieros']);
    const by = new Map(p.toCreate.map((a) => [a.code, a]));
    expect(by.get('1')).toMatchObject({ type: 'ASSET', isPostable: false, isContra: false, parentCode: null });
    expect(by.get('1202')).toMatchObject({ isPostable: false, isContra: true, parentCode: '1' });
    expect(by.get('1202-01')).toMatchObject({ isPostable: true, isContra: true, parentCode: '1202' });
    expect(by.get('4103')).toMatchObject({ type: 'INCOME', isPostable: true, isContra: true, parentCode: '4' });
    expect(by.get('7')!.type).toBe('EXPENSE');
    // padres antes que hijas
    expect(p.toCreate.findIndex((a) => a.code === '1202')).toBeLessThan(p.toCreate.findIndex((a) => a.code === '1202-01'));
  });

  it('errores por fila: padre inexistente, tipos distintos, código inválido, círculo en "Cuenta padre"', () => {
    const p = buildPlan([
      row(1, '1101-01', 'Sin padre'),
      row(2, '2', 'PASIVO', 'Control'),
      row(3, '21', 'Bajo pasivo pero dice activo', 'Detalle', '', { tipoSistema: 'Activo' }),
      row(4, '1 01', 'Espacio en el código'),
      row(5, 'A', 'A', 'Control', '', { tipoSistema: 'Gasto', padre: 'B' }),
      row(6, 'B', 'B', 'Control', '', { tipoSistema: 'Gasto', padre: 'A' }),
      row(7, '9', 'Nueve'),
    ], new Map());
    const msg = (f: number) => p.filas.find((x) => x.fila === f)!.mensajes.join(' ');
    expect(msg(1)).toMatch(/padre 1101 no está/);
    expect(msg(3)).toMatch(/padre 2 es de tipo Pasivo y esta sería Activo/);
    expect(msg(4)).toMatch(/solo admite/);
    expect(msg(5)).toMatch(/círculo/);
    expect(msg(7)).toMatch(/del 1 al 7/);
    expect(p.resumen.errores).toBe(6);
  });

  it('cuentas existentes: solo nombre/descripción; tipo o padre distinto es error (con mensaje de movimientos)', () => {
    const ex = new Map([
      existing({ code: '1', isPostable: false }),
      existing({ code: '1101', name: 'Caja', parentCode: '1', description: 'BG', hasMovements: true }),
      existing({ code: '1102', name: 'Bancos', parentCode: '1' }),
      existing({ code: '2', type: 'LIABILITY', isPostable: false, hasMovements: true }),
    ]);
    const p = buildPlan([
      row(1, '1', 'ACTIVO', 'Control'),
      row(2, '1101', 'Caja General'), // cambia nombre; descripción vacía no borra
      row(3, '1102', 'Bancos', 'Control'), // Control ignorado en una existente
      row(4, '2', 'PASIVO', 'Control', '', { tipoSistema: 'Patrimonio' }),
    ], ex);
    expect(p.filas.map((f) => f.accion)).toEqual(['update', 'update', 'unchanged', 'error']);
    expect(p.toUpdate.find((u) => u.code === '1101')!.after).toEqual({ name: 'Caja General', description: 'BG' });
    expect(p.filas[2].mensajes[0]).toMatch(/solo se actualizan el nombre y la descripción/);
    expect(p.filas[3].mensajes[0]).toMatch(/ya existe como Pasivo y el archivo dice Patrimonio. La cuenta ya tiene movimientos/);
  });

  it('categoría: valida contra el tipo y trae su flujo de efectivo y auxiliar', () => {
    const p = buildPlan([
      row(1, '1101', 'Clientes', 'Detalle', '', { categoria: 'Cuentas por cobrar' }),
      row(2, '1102', 'Caja', 'Detalle', '', { categoria: 'CASH_AND_EQUIVALENTS' }),
      row(3, '1103', 'Mal', 'Detalle', '', { categoria: 'Costo de ventas' }),
    ], new Map());
    expect(p.toCreate.find((a) => a.code === '1101')).toMatchObject({ category: 'ACCOUNTS_RECEIVABLE', cashFlowCategory: 'OPERATING', subledger: 'RECEIVABLE' });
    expect(p.toCreate.find((a) => a.code === '1102')).toMatchObject({ category: 'CASH_AND_EQUIVALENTS', cashFlowCategory: 'CASH_EQUIVALENT', subledger: null });
    expect(p.filas[2].mensajes[0]).toMatch(/no corresponde a una cuenta de tipo Activo/);
  });

  it('CSV de solo saltos de línea o separadores: no acumula filas vacías y se corta al pasar del máximo', () => {
    const t = Date.now();
    expect(parseCsv('Código de Cuenta,Nombre\n' + '\n'.repeat(2 * 1024 * 1024))).toEqual([{ n: 1, cells: ['Código de Cuenta', 'Nombre'] }]);
    expect(parseCsv('Código de Cuenta,Nombre\n1,' + ','.repeat(2 * 1024 * 1024))[1].cells).toHaveLength(30);
    expect(parseCsv('Código de Cuenta,Nombre\n' + '1,a\n'.repeat(100_000))).toHaveLength(MAX_ROWS + 51);
    expect(Date.now() - t).toBeLessThan(1500);
    // Las filas vacías intermedias no cambian la numeración
    expect(parseCsv('a,b\n\n,\n1,2\n')).toEqual([{ n: 1, cells: ['a', 'b'] }, { n: 4, cells: ['1', '2'] }]);
  });

  it('byte nulo en el nombre o la descripción: error en la fila (Postgres no lo admite)', () => {
    const p = buildPlan([row(1, '6101', 'Gasto\u0000raro'), row(2, '6102', 'Bien', 'Detalle', '', { descripcion: 'x\u0000' })], new Map());
    expect(p.filas.map((f) => f.accion)).toEqual(['error', 'error']);
    expect(p.filas[0].mensajes[0]).toMatch(/nombre tiene un carácter invisible/);
    expect(p.filas[1].mensajes[0]).toMatch(/descripción tiene un carácter invisible/);
  });

  it('subcuentas: no bajo una cuenta con movimientos ni bajo una "Detalle" del archivo; aviso si la existente deja de recibir movimientos', () => {
    const ex = new Map([
      existing({ code: '1', isPostable: false }),
      existing({ code: '1101', name: 'Caja', parentCode: '1', hasMovements: true }),
      existing({ code: '1102', name: 'Bancos', parentCode: '1' }), // recibe movimientos, aún no tiene
      existing({ code: '1103', name: 'Otros', parentCode: '1' }),
      existing({ code: '1103-01', parentCode: '1103' }), // ya es de grupo de hecho
    ]);
    const p = buildPlan([
      row(1, '1101-01', 'Caja chica'),
      row(2, '1102-01', 'Banco A'),
      row(3, '1103-02', 'Otro'),
      row(4, '12', 'Detalle con hijas', 'Detalle'),
      row(5, '1201', 'Hija de detalle'),
      row(6, '13', 'Reguladora con hijas', 'Reguladora'),
      row(7, '1301', 'Hija de reguladora'),
      row(8, '14', 'Sin tipo de cuenta', ''),
      row(9, '1401', 'Hija 1'),
      row(10, '1402', 'Hija 2'),
    ], ex);
    const f = (n: number) => p.filas.find((x) => x.fila === n)!;
    expect(f(1)).toMatchObject({ accion: 'error', mensajes: ['La cuenta 1101 Caja ya tiene movimientos: no puede tener subcuentas. Crea la subcuenta debajo de una cuenta de grupo'] });
    expect(f(2)).toMatchObject({ accion: 'create', mensajes: ['La cuenta 1102 Bancos recibe movimientos. Al tener esta subcuenta ya no podrá recibirlos y quedará solo para agrupar'] });
    expect(f(3)).toMatchObject({ accion: 'create', mensajes: [] });
    expect(f(5).accion).toBe('error');
    expect(f(5).mensajes[0]).toMatch(/padre 12 está marcada como "Detalle" en la fila 4: una cuenta de detalle recibe movimientos y no puede tener subcuentas/);
    expect(f(7).mensajes[0]).toMatch(/padre 13 está marcada como "Reguladora"/);
    // "Tipo de Cuenta" vacío con hijas: pasa a Control con un solo aviso
    expect(f(8)).toMatchObject({ accion: 'create', mensajes: ['Tiene subcuentas en el archivo: se crea como cuenta de grupo (Control), que no recibe movimientos'] });
    expect(p.toCreate.find((a) => a.code === '14')!.isPostable).toBe(false);
    expect([f(9).accion, f(10).accion]).toEqual(['create', 'create']);
    expect(p.resumen.errores).toBe(3);
  });
});
