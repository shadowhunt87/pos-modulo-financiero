import { readFileSync } from 'node:fs';
import { Prisma } from '../generated/prisma/client.js';
import { EXPORT_REGISTRY, type ExportEntry } from './export-registry.js';
import { registryProblems } from './export-coverage.js';
import { csvCell, zipSafeName } from './csv.js';

const schema = readFileSync('prisma/schema.prisma', 'utf8');
const models = Object.values(Prisma.ModelName) as string[];
const columnsOf = (m: string) => {
  const e = (Prisma as unknown as Record<string, Record<string, string> | undefined>)[`${m}ScalarFieldEnum`];
  return e ? Object.values(e) : undefined;
};

describe('cobertura del registro de la exportación (ANEXO-S0 §4.4)', () => {
  it('pasa hoy: cada modelo registrado, sin secretos ni archivos sin declarar', () => {
    expect(registryProblems(EXPORT_REGISTRY, models, columnsOf, schema)).toEqual([]);
  });

  it('falla con un modelo faltante', () => {
    const r = EXPORT_REGISTRY.filter((e) => e.model !== 'Invoice');
    expect(registryProblems(r, models, columnsOf, schema)).toEqual(expect.arrayContaining([expect.stringMatching(/^Invoice: falta/)]));
  });

  it('falla con una columna fooToken sin declarar y con un xmlFileUrl sin files', () => {
    const cols = (m: string) => (m === 'Partner' ? [...columnsOf(m)!, 'fooToken', 'xmlFileUrl'] : columnsOf(m));
    const p = registryProblems(EXPORT_REGISTRY, models, cols, schema);
    expect(p).toEqual(expect.arrayContaining([expect.stringMatching(/Partner\.fooToken: parece un secreto/), expect.stringMatching(/Partner\.xmlFileUrl: parece un archivo/)]));
  });

  it('falla con un Json sin jsonColumns y con un CHILD de relación inexistente', () => {
    const r: ExportEntry[] = EXPORT_REGISTRY.map((e) =>
      e.model === 'AuditLog' ? { ...e, jsonColumns: [] } : e.model === 'BudgetLine' ? { ...e, where: (c: string) => ({ presupuesto: { companyId: c } }) } : e);
    const p = registryProblems(r, models, columnsOf, schema);
    expect(p).toEqual(expect.arrayContaining([expect.stringMatching(/AuditLog\.changes: es Json/), expect.stringMatching(/BudgetLine: la relación «presupuesto»/)]));
  });

  it('falla si un SECRET tiene salida o no tiene motivo', () => {
    const r = EXPORT_REGISTRY.map((e) => (e.model === 'UserTwoFactor' ? { ...e, reason: undefined, jsonColumns: ['x'] } : e));
    expect(registryProblems(r, models, columnsOf, schema).filter((x) => x.startsWith('UserTwoFactor'))).toHaveLength(2);
  });
});

describe('formato CSV', () => {
  it('Decimal exacto, fechas ISO, nulo y vacío distintos, fórmulas neutralizadas, negativos intactos', () => {
    expect(csvCell(new Prisma.Decimal('12345678901234.5678'))).toBe('12345678901234.5678');
    expect(csvCell(new Prisma.Decimal('0.000001'))).toBe('0.000001');
    expect(csvCell(new Date('2030-01-02T03:04:05.000Z'))).toBe('2030-01-02T03:04:05.000Z');
    expect([csvCell(null), csvCell('')]).toEqual(['', '""']);
    expect(csvCell('=1+1')).toBe("'=1+1");
    expect(csvCell(new Prisma.Decimal('-50.25'))).toBe('-50.25');
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell({ a: 1 }, true)).toBe('"{""a"":1}"');
  });

  it('nombres seguros dentro del ZIP', () => {
    expect(zipSafeName('factura‮txt.exe')).toBe('facturatxt.exe');
    expect(zipSafeName('CON.txt')).toBe('_CON.txt');
    expect(zipSafeName('nota. ')).toBe('nota');
  });
});
