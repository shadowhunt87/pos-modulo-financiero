import { AccountCategory as C, AccountType as T, CashFlowCategory as F, SubledgerType } from '../generated/prisma/enums.js';
import { CATEGORIES_BY_TYPE } from '../masters/account-classification/account-classification.service.js';

/**
 * Reglas para convertir un plan de cuentas en Excel/CSV (formato del "Catálogo de Cuentas Estándar RD")
 * a cuentas del sistema. Todo aquí es puro (sin base de datos) para poder probarlo aparte.
 *
 * REGLAS DE CONVERSIÓN
 * 1. Tipo: si viene la columna "Tipo (sistema)" (la pone nuestra exportación), manda ella. Si no, se deduce
 *    del primer dígito del código: 1=Activo, 2=Pasivo, 3=Patrimonio, 4=Ingreso, 5 (costos), 6 (gastos) y
 *    7 (ISR y cierre) = Gasto.
 * 2. Grupo 8 = cuentas de orden. El sistema no tiene ese tipo y no afectan los estados financieros:
 *    se OMITEN con aviso (no se inventa un tipo nuevo).
 * 3. Padre: si viene la columna "Cuenta padre", manda ella. Si no, se deduce del código:
 *    - con guion se quita el último segmento ("1101-03-01" -> "1101-03" -> "1101");
 *    - sin guion y con más de un carácter, el padre es el prefijo más largo que exista en el archivo o en
 *      el plan de la empresa ("1101" -> "11" -> "1"); si no hay ninguno, es cuenta raíz.
 * 4. "Tipo de Cuenta": Control = agrupadora (isPostable=false); Detalle = recibe movimientos;
 *    Reguladora = recibe movimientos y es contra-cuenta (isContra=true). Vacío = Detalle.
 * 5. Además, si la "Naturaleza" es contraria a la normal del tipo (Activo y Gasto son de débito;
 *    Pasivo, Patrimonio e Ingreso de crédito), la cuenta es contra-cuenta (isContra=true).
 * 6. "Estado Financiero / Formato DGII" va a la descripción de la cuenta.
 * 7. Los nombres traen sangría con espacios: se recortan.
 * 8. Si viene "Categoría", se guarda con su flujo de efectivo y su auxiliar (CxC/CxP), igual que lo haría la
 *    auto-clasificación. Las cuentas que quedan sin categoría las clasifica después la auto-clasificación.
 * 9. Una cuenta con subcuentas no recibe movimientos (el motor de asientos lo rechaza). Por eso, una cuenta
 *    nueva no puede quedar debajo de: una cuenta que ya tiene movimientos (error); una cuenta del archivo
 *    marcada "Detalle" o "Reguladora" (error); una cuenta existente que recibe movimientos pero aún no los
 *    tiene (se permite con aviso: deja de recibirlos). Una cuenta del archivo con "Tipo de Cuenta" vacío
 *    que resulta tener subcuentas se crea como Control (con aviso).
 */

export const MAX_ROWS = 5000;
/** Columnas que se leen de cada fila (el formato usa 10; el resto se ignora). */
export const MAX_COLS = 30;

/** Encabezados, en el orden en que se exportan (los 6 primeros son los del archivo de Carlos). */
export const COLUMNS = {
  codigo: 'Código de Cuenta',
  nombre: 'Nombre / Descripción de la Cuenta',
  nivel: 'Nivel',
  tipoCuenta: 'Tipo de Cuenta',
  naturaleza: 'Naturaleza',
  descripcion: 'Estado Financiero / Formato DGII',
  tipoSistema: 'Tipo (sistema)',
  categoria: 'Categoría',
  activa: 'Activa',
  padre: 'Cuenta padre',
} as const;
export type ColumnKey = keyof typeof COLUMNS;

/** Una fila tal como viene del archivo (textos sin interpretar). `fila` = número de fila en el archivo. */
export type RawRow = { fila: number } & Partial<Record<ColumnKey, string>>;

export const TYPE_LABEL: Record<T, string> = { ASSET: 'Activo', LIABILITY: 'Pasivo', EQUITY: 'Patrimonio', INCOME: 'Ingreso', EXPENSE: 'Gasto' };

// Mismos textos que frontend/src/app/shared/labels.ts (ACCOUNT_CATEGORY)
export const CATEGORY_LABEL: Record<C, string> = {
  CASH_AND_EQUIVALENTS: 'Efectivo y equivalentes', ACCOUNTS_RECEIVABLE: 'Cuentas por cobrar', INVENTORY: 'Inventarios',
  PREPAID_AND_OTHER_CURRENT_ASSETS: 'Pagos anticipados y otros activos corrientes', PROPERTY_PLANT_EQUIPMENT: 'Propiedad, planta y equipo',
  INTANGIBLE_ASSETS: 'Activos intangibles', OTHER_NON_CURRENT_ASSETS: 'Otros activos no corrientes', ACCOUNTS_PAYABLE: 'Cuentas por pagar',
  SHORT_TERM_DEBT: 'Deuda a corto plazo', TAXES_PAYABLE: 'Impuestos por pagar', OTHER_CURRENT_LIABILITIES: 'Otros pasivos corrientes',
  LONG_TERM_DEBT: 'Deuda a largo plazo', OTHER_NON_CURRENT_LIABILITIES: 'Otros pasivos no corrientes', SHARE_CAPITAL: 'Capital social',
  RETAINED_EARNINGS: 'Utilidades retenidas', CURRENT_YEAR_RESULT: 'Resultado del ejercicio', OTHER_EQUITY: 'Otro patrimonio',
  OPERATING_REVENUE: 'Ingresos operativos', OTHER_REVENUE: 'Otros ingresos', COST_OF_SALES: 'Costo de ventas', OPERATING_EXPENSE: 'Gastos operativos',
  DEPRECIATION_AMORTIZATION: 'Depreciación y amortización', FINANCE_COST: 'Costos financieros', OTHER_EXPENSE: 'Otros gastos', INCOME_TAX: 'Impuesto sobre la renta',
};

/**
 * Flujo de efectivo de cada categoría (NIC 7). Copia de CASH_FLOW_OF de account-classification.service.ts,
 * que no se exporta (archivo del socio): si cambia allá, cambiar aquí.
 */
const CASH_FLOW_BY_CATEGORY: Partial<Record<C, F>> = {
  [C.CASH_AND_EQUIVALENTS]: F.CASH_EQUIVALENT,
  [C.ACCOUNTS_RECEIVABLE]: F.OPERATING, [C.INVENTORY]: F.OPERATING, [C.PREPAID_AND_OTHER_CURRENT_ASSETS]: F.OPERATING,
  [C.ACCOUNTS_PAYABLE]: F.OPERATING, [C.TAXES_PAYABLE]: F.OPERATING, [C.OTHER_CURRENT_LIABILITIES]: F.OPERATING,
  [C.PROPERTY_PLANT_EQUIPMENT]: F.INVESTING, [C.INTANGIBLE_ASSETS]: F.INVESTING, [C.OTHER_NON_CURRENT_ASSETS]: F.INVESTING,
  [C.SHORT_TERM_DEBT]: F.FINANCING, [C.LONG_TERM_DEBT]: F.FINANCING, [C.OTHER_NON_CURRENT_LIABILITIES]: F.FINANCING,
  [C.SHARE_CAPITAL]: F.FINANCING, [C.RETAINED_EARNINGS]: F.FINANCING, [C.OTHER_EQUITY]: F.FINANCING,
};

/** Sin acentos, minúsculas y espacios simples: para comparar encabezados y valores escritos a mano. */
export const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();

/**
 * Inyección de fórmulas (CSV/Excel): un texto que empieza con = + - @ (o con tabulador o retorno de carro,
 * que algunas hojas de cálculo saltan antes de leer la fórmula) podría ejecutarse como fórmula al abrir el
 * archivo. Se exporta con una comilla delante; al importar se quita esa comilla.
 */
export const neutralize = (s: string) => (/^[=+\-@\t\r]/.test(s) ? `'${s}` : s);
export const unneutralize = (s: string) => (/^'[=+\-@\t\r]/.test(s) ? s.slice(1) : s);

/** Columna a la que corresponde un encabezado (tolerante a acentos, mayúsculas y variantes). */
export function headerKey(raw: string): ColumnKey | undefined {
  const h = norm(raw);
  if (!h) return undefined;
  if (h.includes('padre')) return 'padre';
  if (h.startsWith('codigo')) return 'codigo';
  if (h.startsWith('nombre')) return 'nombre';
  if (h.startsWith('nivel')) return 'nivel';
  if (h.includes('sistema')) return 'tipoSistema';
  if (h.startsWith('tipo de cuenta') || h === 'tipo') return 'tipoCuenta';
  if (h.startsWith('naturaleza')) return 'naturaleza';
  if (h.startsWith('estado financiero') || h === 'descripcion') return 'descripcion';
  if (h.startsWith('categoria')) return 'categoria';
  if (h.startsWith('activa')) return 'activa';
  return undefined;
}

/**
 * Convierte una cuadrícula (filas con su número) en filas de cuentas. El encabezado es la primera fila
 * que tiene una celda que empieza con "Código" (así se toleran las filas de título de arriba).
 * Devuelve null si no hay encabezado.
 */
export function rowsFromGrid(grid: { n: number; cells: string[] }[]): RawRow[] | null {
  const headerIdx = grid.findIndex((r) => r.cells.some((c) => norm(c).startsWith('codigo')));
  if (headerIdx < 0) return null;
  const map: (ColumnKey | undefined)[] = grid[headerIdx].cells.map(headerKey);
  if (!map.includes('nombre')) return null;
  const rows: RawRow[] = [];
  for (const r of grid.slice(headerIdx + 1)) {
    if (r.cells.every((c) => !c.trim())) continue; // filas vacías: no cuentan
    const row: RawRow = { fila: r.n };
    map.forEach((k, i) => {
      if (k && row[k] === undefined) row[k] = unneutralize((r.cells[i] ?? '').trim());
    });
    rows.push(row);
  }
  return rows;
}

/**
 * CSV con comillas (RFC 4180). Detecta el separador (coma o punto y coma, como lo guarda Excel en español).
 * Las filas vacías no se guardan, cada fila se corta en MAX_COLS celdas y la lectura se detiene al pasar de
 * MAX_ROWS + 50 filas (quien llama rechaza el archivo): un CSV de solo saltos de línea o separadores no
 * debe consumir memoria ni tiempo.
 */
export function parseCsv(text: string): { n: number; cells: string[] }[] {
  const src = text.replace(/^﻿/, '');
  // El separador se mira en la línea del encabezado ("Código..."), no en las de título
  const lines = src.slice(0, 20_000).split(/\r?\n/);
  const headLine = lines.find((l) => norm(l).replace(/^"/, '').startsWith('codigo')) ?? lines[0];
  const sep = (headLine.match(/;/g)?.length ?? 0) > (headLine.match(/,/g)?.length ?? 0) ? ';' : ',';
  const out: { n: number; cells: string[] }[] = [];
  let cells: string[] = [];
  let cur = '';
  let quoted = false;
  let line = 1;
  let start = 1;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"' && src[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') quoted = false;
      else { if (ch === '\n') line++; cur += ch; }
    } else if (ch === '"' && cur === '') quoted = true;
    else if (ch === sep) { if (cells.length < MAX_COLS) cells.push(cur); cur = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      if (cells.length < MAX_COLS) cells.push(cur);
      if (cells.some((c) => c.trim())) out.push({ n: start, cells });
      if (out.length > MAX_ROWS + 50) return out;
      cells = []; cur = ''; line++; start = line;
    } else cur += ch;
  }
  if (cells.length < MAX_COLS) cells.push(cur);
  if (cells.some((c) => c.trim())) out.push({ n: start, cells });
  return out;
}

// ---------------------------------------------------------------------------------------------
// Interpretación de cada columna

const TYPE_BY_DIGIT: Record<string, T> = { '1': T.ASSET, '2': T.LIABILITY, '3': T.EQUITY, '4': T.INCOME, '5': T.EXPENSE, '6': T.EXPENSE, '7': T.EXPENSE };
const ORDER_DIGIT = '8';

export const normalNature = (t: T): 'D' | 'C' => (t === T.ASSET || t === T.EXPENSE ? 'D' : 'C');

function parseSystemType(s: string): T | undefined {
  const v = norm(s);
  if ((Object.values(T) as string[]).includes(s.trim().toUpperCase())) return s.trim().toUpperCase() as T;
  if (/^activos?$/.test(v)) return T.ASSET;
  if (/^pasivos?$/.test(v)) return T.LIABILITY;
  if (/^(patrimonio|capital|capital y patrimonio)$/.test(v)) return T.EQUITY;
  if (/^ingresos?$/.test(v)) return T.INCOME;
  if (/^(gastos?|costos?)$/.test(v)) return T.EXPENSE;
  return undefined;
}

function parseCategory(s: string): C | undefined {
  const up = s.trim().toUpperCase();
  if ((Object.values(C) as string[]).includes(up)) return up as C;
  const v = norm(s);
  return (Object.keys(CATEGORY_LABEL) as C[]).find((k) => norm(CATEGORY_LABEL[k]) === v);
}

function parseKind(s: string): 'control' | 'detalle' | 'reguladora' | undefined {
  const v = norm(s);
  if (!v || v === 'detalle') return 'detalle';
  if (v === 'control') return 'control';
  if (v === 'reguladora') return 'reguladora';
  return undefined;
}

function parseNature(s: string): 'D' | 'C' | null | undefined {
  const v = norm(s);
  if (!v) return null;
  if (/^(debito|deudora|d)$/.test(v)) return 'D';
  if (/^(credito|acreedora|c)$/.test(v)) return 'C';
  return undefined;
}

function parseActive(s: string): boolean | undefined {
  const v = norm(s);
  if (!v || /^(si|s|true|1|activa)$/.test(v)) return true;
  if (/^(no|n|false|0|inactiva)$/.test(v)) return false;
  return undefined;
}

// ---------------------------------------------------------------------------------------------
// Plan de importación

/** Lo que el sistema ya tiene en la empresa, por código. */
export interface ExistingAccount {
  id: string;
  code: string;
  name: string;
  type: T;
  parentCode: string | null;
  description: string | null;
  isPostable: boolean;
  isContra: boolean;
  category: C | null;
  active: boolean;
  hasMovements: boolean;
}

export type Accion = 'create' | 'update' | 'unchanged' | 'skip' | 'error';

export interface PlanRow {
  fila: number;
  codigo: string;
  nombre: string;
  tipo: T | null;
  padre: string | null;
  accion: Accion;
  mensajes: string[];
}

export interface NewAccount {
  code: string;
  name: string;
  type: T;
  parentCode: string | null;
  isPostable: boolean;
  isContra: boolean;
  category: C | null;
  cashFlowCategory: F | null;
  subledger: SubledgerType | null;
  description: string | null;
  active: boolean;
}

export interface ImportPlan {
  resumen: { crear: number; actualizar: number; sinCambios: number; omitidas: number; errores: number };
  filas: PlanRow[];
  avisos: string[];
  /** Ordenadas de modo que cada padre va antes que sus hijas. */
  toCreate: NewAccount[];
  toUpdate: { id: string; code: string; before: { name: string; description: string | null }; after: { name: string; description: string | null } }[];
}

const CODE_RE = /^[0-9A-Za-z.-]{1,20}$/; // la misma regla que CreateAccountDto

/** Padre deducido del código (regla 3). `known` = códigos del archivo y de la empresa. */
export function deduceParent(code: string, known: Set<string>): string | null {
  const dash = code.lastIndexOf('-');
  if (dash > 0) return code.slice(0, dash);
  for (let len = code.length - 1; len >= 1; len--) {
    const p = code.slice(0, len);
    if (known.has(p)) return p;
  }
  return null;
}

/** Compara el archivo contra lo que ya existe y decide qué pasaría con cada fila. No guarda nada. */
export function buildPlan(raw: RawRow[], existing: Map<string, ExistingAccount>): ImportPlan {
  interface Work extends PlanRow { acc?: NewAccount; kindVacio?: boolean }
  const works: Work[] = [];
  const firstRow = new Map<string, number>();

  // 1) Cada fila por separado
  for (const r of raw) {
    const codigo = (r.codigo ?? '').trim();
    const nombre = (r.nombre ?? '').trim();
    const w: Work = { fila: r.fila, codigo, nombre, tipo: null, padre: null, accion: 'error', mensajes: [] };
    works.push(w);
    const err = (m: string) => w.mensajes.push(m);

    if (!codigo) { err('Falta el código de la cuenta'); continue; }
    if (!CODE_RE.test(codigo)) { err('El código solo admite letras, números, punto y guion (máximo 20 caracteres)'); continue; }
    if (firstRow.has(codigo)) { err(`El código ${codigo} está repetido en el archivo (también en la fila ${firstRow.get(codigo)})`); continue; }
    firstRow.set(codigo, r.fila);

    // Tipo (regla 1) y cuentas de orden (regla 2)
    let tipo: T | undefined;
    if (r.tipoSistema?.trim()) {
      tipo = parseSystemType(r.tipoSistema);
      if (!tipo) { err(`"Tipo (sistema)" no reconocido: "${r.tipoSistema}". Usa Activo, Pasivo, Patrimonio, Ingreso o Gasto`); continue; }
    } else if (codigo[0] === ORDER_DIGIT) {
      w.accion = 'skip';
      w.mensajes.push('Cuenta de orden: se omite porque no afecta los estados financieros');
      continue;
    } else {
      tipo = TYPE_BY_DIGIT[codigo[0]];
      if (!tipo) { err('No se puede saber el tipo: el código debe empezar con un dígito del 1 al 7, o llena la columna "Tipo (sistema)"'); continue; }
    }
    w.tipo = tipo;

    if (!nombre) err('Falta el nombre de la cuenta');
    else if (nombre.length > 200) err('El nombre no puede pasar de 200 caracteres');
    else if (nombre.includes('\u0000')) err('El nombre tiene un carácter invisible no válido. Vuelve a escribirlo a mano');
    const descripcion = (r.descripcion ?? '').trim();
    if (descripcion.length > 500) err('La descripción no puede pasar de 500 caracteres');
    else if (descripcion.includes('\u0000')) err('La descripción tiene un carácter invisible no válido. Vuelve a escribirla a mano');

    const kind = parseKind(r.tipoCuenta ?? '');
    if (!kind) err(`"Tipo de Cuenta" no reconocido: "${r.tipoCuenta}". Usa Control, Detalle o Reguladora`);
    const nature = parseNature(r.naturaleza ?? '');
    if (nature === undefined) err(`"Naturaleza" no reconocida: "${r.naturaleza}". Usa Débito o Crédito`);
    let category: C | null = null;
    if (r.categoria?.trim()) {
      const c = parseCategory(r.categoria);
      if (!c) err(`"Categoría" no reconocida: "${r.categoria}"`);
      else if (!CATEGORIES_BY_TYPE[tipo].includes(c)) err(`La categoría "${CATEGORY_LABEL[c]}" no corresponde a una cuenta de tipo ${TYPE_LABEL[tipo]}`);
      else category = c;
    }
    const active = parseActive(r.activa ?? '');
    if (active === undefined) err(`"Activa" no reconocido: "${r.activa}". Usa Sí o No`);
    if (w.mensajes.length) continue;

    // Regla 4 y 5: agrupadora / contra-cuenta
    const isContra = kind === 'reguladora' || (nature !== null && nature !== normalNature(tipo));
    w.acc = {
      code: codigo, name: nombre, type: tipo, parentCode: null, isPostable: kind !== 'control', isContra,
      category, description: descripcion || null, active: active!,
      cashFlowCategory: category ? (CASH_FLOW_BY_CATEGORY[category] ?? null) : null,
      // Auxiliar de clientes/proveedores como la auto-clasificación (no en una contra-cuenta como la provisión)
      subledger: isContra ? null : category === C.ACCOUNTS_RECEIVABLE ? SubledgerType.RECEIVABLE : category === C.ACCOUNTS_PAYABLE ? SubledgerType.PAYABLE : null,
    };
    w.kindVacio = !(r.tipoCuenta ?? '').trim();
    w.accion = 'create';
  }

  // 2) Padre (regla 3): necesita conocer todos los códigos del archivo y de la empresa
  const known = new Set<string>([...firstRow.keys(), ...existing.keys()]);
  const inFile = new Map(works.filter((w) => w.codigo && firstRow.get(w.codigo) === w.fila).map((w) => [w.codigo, w]));
  const rawByFila = new Map(raw.map((r) => [r.fila, r]));
  const withChildren = new Set([...existing.values()].map((a) => a.parentCode).filter((c): c is string => !!c));
  const asGroup = new Set<string>(); // cuentas del archivo sin "Tipo de Cuenta" que pasan a Control
  for (const w of works) {
    if (!w.acc) continue;
    const explicit = rawByFila.get(w.fila)?.padre?.trim();
    const padre = explicit || deduceParent(w.codigo, known);
    w.padre = padre;
    w.acc.parentCode = padre;
    if (!padre) continue;
    const err = (m: string) => { w.mensajes.push(m); w.accion = 'error'; };
    if (padre === w.codigo) { err('Una cuenta no puede ser su propia cuenta padre'); continue; }
    const pFile = inFile.get(padre);
    const pDb = existing.get(padre);
    if (pFile?.accion === 'skip') { err(`Su cuenta padre ${padre} es una cuenta de orden, que se omite`); continue; }
    const pType = pFile?.tipo ?? pDb?.type;
    if (!pFile && !pDb) { err(`La cuenta padre ${padre} no está en el archivo ni en tu plan de cuentas`); continue; }
    if (pType && pType !== w.tipo) {
      err(`La cuenta padre ${padre} es de tipo ${TYPE_LABEL[pType]} y esta sería ${TYPE_LABEL[w.tipo!]}: deben ser del mismo tipo`);
      continue;
    }
    // Regla 9 (solo para cuentas nuevas: las que ya existen conservan su padre o dan error en el paso 3)
    if (existing.has(w.codigo)) continue;
    if (pDb) {
      if (pDb.hasMovements) {
        err(`La cuenta ${padre} ${pDb.name} ya tiene movimientos: no puede tener subcuentas. Crea la subcuenta debajo de una cuenta de grupo`);
      } else if (pDb.isPostable && !withChildren.has(padre)) {
        w.mensajes.push(`La cuenta ${padre} ${pDb.name} recibe movimientos. Al tener esta subcuenta ya no podrá recibirlos y quedará solo para agrupar`);
      }
    } else if (pFile?.acc?.isPostable) {
      if (pFile.kindVacio) {
        pFile.acc.isPostable = false;
        if (!asGroup.has(padre)) pFile.mensajes.push('Tiene subcuentas en el archivo: se crea como cuenta de grupo (Control), que no recibe movimientos');
        asGroup.add(padre);
      } else {
        const kind = rawByFila.get(pFile.fila)?.tipoCuenta?.trim();
        err(`La cuenta padre ${padre} está marcada como "${kind}" en la fila ${pFile.fila}: una cuenta de detalle recibe movimientos y no puede tener subcuentas. Cámbiala a "Control" o pon esta cuenta debajo de otra`);
      }
    }
  }

  // 3) Cuentas que ya existen: solo se actualizan nombre y descripción
  const toUpdate: ImportPlan['toUpdate'] = [];
  for (const w of works) {
    if (!w.acc || w.accion === 'error') continue;
    const ex = existing.get(w.codigo);
    if (!ex) continue;
    const a = w.acc;
    const why = ex.hasMovements ? ' La cuenta ya tiene movimientos y eso no se puede cambiar.' : ' La importación no cambia el tipo ni la cuenta padre de cuentas que ya existen: corrige el archivo o cámbialo desde Plan de cuentas.';
    if (ex.type !== a.type) {
      w.accion = 'error';
      w.mensajes.push(`La cuenta ${w.codigo} ya existe como ${TYPE_LABEL[ex.type]} y el archivo dice ${TYPE_LABEL[a.type]}.${why}`);
      continue;
    }
    if (ex.parentCode !== a.parentCode) {
      w.accion = 'error';
      w.mensajes.push(`La cuenta ${w.codigo} ya existe ${ex.parentCode ? `bajo ${ex.parentCode}` : 'sin cuenta padre'} y el archivo la pone ${a.parentCode ? `bajo ${a.parentCode}` : 'sin cuenta padre'}.${why}`);
      continue;
    }
    const ignored: string[] = [];
    if (ex.isPostable !== a.isPostable || ex.isContra !== a.isContra) ignored.push('tipo de cuenta o naturaleza');
    if (a.category && a.category !== ex.category) ignored.push('categoría');
    if (ex.active !== a.active) ignored.push('activa');
    if (ignored.length) w.mensajes.push(`En cuentas que ya existen solo se actualizan el nombre y la descripción; no se cambió: ${ignored.join(', ')}`);

    // Descripción vacía en el archivo = no se toca (no se borra lo que ya había)
    const after = { name: a.name, description: a.description ?? ex.description };
    if (after.name !== ex.name || after.description !== ex.description) {
      w.accion = 'update';
      toUpdate.push({ id: ex.id, code: ex.code, before: { name: ex.name, description: ex.description }, after });
    } else w.accion = 'unchanged';
  }

  // 4) Ciclos en la columna "Cuenta padre" (A bajo B y B bajo A) entre cuentas nuevas
  const newByCode = new Map(works.filter((w) => w.accion === 'create').map((w) => [w.codigo, w]));
  const depth = new Map<string, number>();
  for (const w of newByCode.values()) {
    const seen = new Set<string>();
    let cur: Work | undefined = w;
    let d = 0;
    while (cur?.acc?.parentCode && newByCode.has(cur.acc.parentCode)) {
      if (seen.has(cur.codigo)) break;
      seen.add(cur.codigo);
      cur = newByCode.get(cur.acc.parentCode);
      d++;
    }
    if (cur && seen.has(cur.codigo)) {
      w.accion = 'error';
      w.mensajes.push('La columna "Cuenta padre" forma un círculo (una cuenta termina siendo padre de sí misma)');
    }
    depth.set(w.codigo, d);
  }

  const filas: PlanRow[] = works.map(({ acc: _a, kindVacio: _k, ...p }) => p);
  const count = (a: Accion) => filas.filter((f) => f.accion === a).length;
  const resumen = { crear: count('create'), actualizar: count('update'), sinCambios: count('unchanged'), omitidas: count('skip'), errores: count('error') };
  const avisos: string[] = [];
  if (resumen.omitidas) avisos.push(`Se omiten ${resumen.omitidas} cuentas de orden; no afectan los estados financieros`);
  if (resumen.errores) avisos.push(`Hay ${resumen.errores} ${resumen.errores === 1 ? 'fila' : 'filas'} con errores. Mientras haya errores no se guarda nada: corrígelas y vuelve a subir el archivo`);

  const toCreate = works
    .filter((w) => w.accion === 'create')
    .sort((a, b) => depth.get(a.codigo)! - depth.get(b.codigo)!)
    .map((w) => w.acc!);
  return { resumen, filas, avisos, toCreate, toUpdate };
}
