import { fileProblem, ImportRow, resultText, sortRows, summaryOf } from './import-accounts-logic';

const row = (fila: number, accion: ImportRow['accion']): ImportRow => ({ fila, codigo: String(fila), nombre: 'x', tipo: 'ASSET', padre: null, accion, mensajes: [] });

describe('import-accounts-logic', () => {
  it('valida el archivo', () => {
    expect(fileProblem({ name: 'a.xlsx', size: 10 })).toBe('');
    expect(fileProblem({ name: 'a.CSV', size: 10 })).toBe('');
    expect(fileProblem({ name: 'a.pdf', size: 10 })).toContain('Excel');
    expect(fileProblem({ name: 'a.xlsx', size: 3 * 1024 * 1024 })).toContain('2 MB');
  });
  it('pone los errores primero y filtra', () => {
    const rows = [row(1, 'create'), row(2, 'unchanged'), row(3, 'error'), row(4, 'update')];
    expect(sortRows(rows, '').map((r) => r.fila)).toEqual([3, 1, 4, 2]);
    expect(sortRows(rows, 'update').map((r) => r.fila)).toEqual([4]);
  });
  it('acepta el resumen suelto o envuelto', () => {
    const s = { crear: 1, actualizar: 0, sinCambios: 0, omitidas: 0, errores: 0 };
    expect(summaryOf(s)).toBe(s);
    expect(summaryOf({ resumen: s })).toBe(s);
  });
  it('redacta el resultado', () => {
    expect(resultText({ crear: 190, actualizar: 1, sinCambios: 0, omitidas: 3, errores: 0 })).toBe('Listo: 190 cuentas creadas y 1 actualizada.');
    expect(resultText({ crear: 0, actualizar: 0, sinCambios: 5, omitidas: 0, errores: 0 })).toContain('al día');
  });
});
