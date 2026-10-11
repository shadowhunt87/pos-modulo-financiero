import { buildPlan, deduceParent, neutralize, parseCsv, rowsFromGrid, unneutralize, type ExistingAccount, type RawRow } from './chart-of-accounts.rules.js';

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
    expect(neutralize('(-) Provisión')).toBe('(-) Provisión');
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
      row(5, 'A', 'A', 'Detalle', '', { tipoSistema: 'Gasto', padre: 'B' }),
      row(6, 'B', 'B', 'Detalle', '', { tipoSistema: 'Gasto', padre: 'A' }),
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
});
