#!/usr/bin/env node
// Genera src/chart-of-accounts/templates/catalogo-estandar-rd.json DESDE el Excel que envió Carlos.
// Reproducible: mismo Excel => mismo JSON (sin fechas ni nada variable).
//
// Uso (desde la carpeta del proyecto):
//   node scripts/generar-catalogo-rd.mjs
//   node scripts/generar-catalogo-rd.mjs otro.xlsx salida.json
//
// Qué hace:
// - Busca la fila de encabezados (la que contiene "Código") y lee las cuentas de debajo.
// - Recorta la sangría de los nombres.
// - Corrige las erratas listadas en CORRECCIONES (por código, para que sea explícito y revisable).
// - Agrega la "categoria" de CATEGORIAS (propuesta para que la validen las contadoras).
// - Copia todo lo demás tal cual, incluidas las cuentas de orden (grupo 8): las omite el importador, con aviso.
import ExcelJS from 'exceljs';
import { writeFileSync } from 'node:fs';

const input = process.argv[2] ?? 'docs/catalogos/Catalogo_de_Cuentas_Estandar_RD.xlsx';
const output = process.argv[3] ?? 'src/chart-of-accounts/templates/catalogo-estandar-rd.json';

// Erratas del original. Solo ortografía: no cambian el sentido de la cuenta.
const CORRECCIONES = {
  '1102-07': ['(-) Provisión para Cuentas Cuentas Incobrables', '(-) Provisión para Cuentas Incobrables'],
  '4101-01': ['Ventas Locales Grabadas con ITBIS (18% / 16%)', 'Ventas Locales Gravadas con ITBIS (18% / 16%)'],
  '6105-02': ['Gastos de Repareción y Mantenimiento Vehículos', 'Gastos de Reparación y Mantenimiento Vehículos'],
};

// Categoría para estados financieros y razones, SOLO donde la auto-clasificación por palabras del nombre
// (POST /account-classification/auto) se equivoca o no encuentra nada. El resto lo clasifica ella al importar.
// Es una PROPUESTA que deben validar las contadoras (D14). Para quitarla, vaciar este objeto y volver a correr.
const CATEGORIAS = {
  // Activo
  '1101-05': 'CASH_AND_EQUIVALENTS', // inversiones temporales: el catálogo las pone dentro de Efectivo y Equivalentes
  '1102-04': 'ACCOUNTS_RECEIVABLE',
  '1102-07': 'ACCOUNTS_RECEIVABLE', // provisión (contra): resta de las cuentas por cobrar
  '1104-05': 'PREPAID_AND_OTHER_CURRENT_ASSETS', '1104-06': 'PREPAID_AND_OTHER_CURRENT_ASSETS',
  '1201-02': 'PROPERTY_PLANT_EQUIPMENT', '1201-08': 'PROPERTY_PLANT_EQUIPMENT',
  '1203-04': 'INTANGIBLE_ASSETS', // amortización acumulada de intangibles (la auto la ponía en propiedad, planta y equipo)
  '1204-01': 'OTHER_NON_CURRENT_ASSETS', '1204-02': 'OTHER_NON_CURRENT_ASSETS',
  '1205-01': 'OTHER_NON_CURRENT_ASSETS', '1205-02': 'OTHER_NON_CURRENT_ASSETS',
  // Pasivo
  '2101-04': 'ACCOUNTS_PAYABLE',
  '2102-01': 'TAXES_PAYABLE', '2102-03': 'TAXES_PAYABLE', '2102-05': 'TAXES_PAYABLE', '2102-06': 'TAXES_PAYABLE',
  '2102-07': 'TAXES_PAYABLE', '2102-08': 'TAXES_PAYABLE',
  '2102-04': 'TAXES_PAYABLE', // la auto la tomaba por "proveedores" como cuenta por pagar con auxiliar de proveedores
  '2103-02': 'TAXES_PAYABLE',
  '2103-03': 'OTHER_CURRENT_LIABILITIES', '2103-04': 'OTHER_CURRENT_LIABILITIES',
  '2104-01': 'OTHER_CURRENT_LIABILITIES', '2104-02': 'OTHER_CURRENT_LIABILITIES', '2104-03': 'OTHER_CURRENT_LIABILITIES', '2104-04': 'OTHER_CURRENT_LIABILITIES',
  '2105-01': 'SHORT_TERM_DEBT', // porción corriente de la deuda a largo plazo (la auto la ponía en largo plazo)
  '2105-03': 'OTHER_CURRENT_LIABILITIES',
  '2201-02': 'LONG_TERM_DEBT', '2201-03': 'LONG_TERM_DEBT', // (LP): la auto los ponía en corto plazo por "préstamos"
  '2201-04': 'OTHER_NON_CURRENT_LIABILITIES',
  // Patrimonio
  '3201-01': 'OTHER_EQUITY', '3201-02': 'OTHER_EQUITY',
  '3301-02': 'RETAINED_EARNINGS',
  '3302-01': 'CURRENT_YEAR_RESULT',
  // Ingresos no operacionales (la auto los ponía como operativos por la palabra "ingresos")
  '4201-01': 'OTHER_REVENUE', '4201-02': 'OTHER_REVENUE', '4201-03': 'OTHER_REVENUE', '4201-04': 'OTHER_REVENUE', '4201-05': 'OTHER_REVENUE',
  // Costos (grupo 5): la auto los ponía como gasto operativo y eso cambia la utilidad bruta
  '5101-03': 'COST_OF_SALES', '5101-04': 'COST_OF_SALES', '5101-05': 'COST_OF_SALES',
  '5102-01': 'COST_OF_SALES', '5102-02': 'COST_OF_SALES', '5102-03': 'COST_OF_SALES',
  // Gastos financieros y otros
  '6301-01': 'FINANCE_COST', '6301-03': 'FINANCE_COST', '6301-04': 'FINANCE_COST',
  '6301-05': 'OTHER_EXPENSE',
  // ISR
  '7102': 'INCOME_TAX',
};

const norm = (s) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
const KEYS = [
  ['codigo', (h) => h.startsWith('codigo')],
  ['nombre', (h) => h.startsWith('nombre')],
  ['nivel', (h) => h.startsWith('nivel')],
  ['tipoCuenta', (h) => h.startsWith('tipo de cuenta')],
  ['naturaleza', (h) => h.startsWith('naturaleza')],
  ['descripcion', (h) => h.startsWith('estado financiero')],
];

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(input);
const ws = wb.worksheets[0];
const rows = [];
ws.eachRow((row, n) => rows.push({ n, cells: Array.from({ length: row.cellCount }, (_, i) => row.getCell(i + 1).text ?? '') }));

const h = rows.findIndex((r) => r.cells.some((c) => norm(c).startsWith('codigo')));
if (h < 0) throw new Error('No se encontró la fila de encabezados ("Código...")');
const col = Object.fromEntries(KEYS.map(([k, test]) => [k, rows[h].cells.findIndex((c) => test(norm(c)))]));
for (const [k, i] of Object.entries(col)) if (i < 0) throw new Error(`Falta la columna ${k}`);

const pendientes = new Set(Object.keys(CORRECCIONES));
const cuentas = [];
for (const r of rows.slice(h + 1)) {
  const get = (k) => (r.cells[col[k]] ?? '').trim();
  if (!get('codigo') && !get('nombre')) continue;
  const c = {
    codigo: get('codigo'), nombre: get('nombre'), nivel: get('nivel'),
    tipoCuenta: get('tipoCuenta'), naturaleza: get('naturaleza'), descripcion: get('descripcion'),
  };
  const fix = CORRECCIONES[c.codigo];
  if (fix) {
    if (c.nombre !== fix[0]) throw new Error(`${c.codigo}: se esperaba "${fix[0]}" y dice "${c.nombre}"`);
    c.nombre = fix[1];
    pendientes.delete(c.codigo);
  }
  if (CATEGORIAS[c.codigo]) {
    if (c.tipoCuenta === 'Control') throw new Error(`${c.codigo}: las agrupadoras no llevan categoría`);
    c.categoria = CATEGORIAS[c.codigo];
  }
  cuentas.push(c);
}
const sinUsar = Object.keys(CATEGORIAS).filter((k) => !cuentas.some((c) => c.codigo === k));
if (sinUsar.length) throw new Error(`Categorías para códigos que no existen: ${sinUsar.join(', ')}`);
if (pendientes.size) throw new Error(`Correcciones sin aplicar: ${[...pendientes].join(', ')}`);

const out = {
  origen: 'docs/catalogos/Catalogo_de_Cuentas_Estandar_RD.xlsx (generado con scripts/generar-catalogo-rd.mjs; no editar a mano)',
  titulo: rows.slice(0, h).map((r) => r.cells.join(' ').trim()).filter(Boolean),
  categoriasPropuestas: Object.keys(CATEGORIAS).length,
  correcciones: Object.entries(CORRECCIONES).map(([codigo, [antes, despues]]) => ({ codigo, antes, despues })),
  cuentas,
};
writeFileSync(output, JSON.stringify(out, null, 2) + '\n');
console.log(`${cuentas.length} cuentas escritas en ${output}`);
