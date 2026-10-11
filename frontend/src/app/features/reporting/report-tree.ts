import Decimal from 'decimal.js';
import { Account } from '../../core/models';
import { dec, Num } from '../../shared/format';

/** Fila de un reporte con jerarquía: las cuentas padre aparecen como subtotal sobre sus hijas. */
export interface TreeRow<T> {
  key: string;
  depth: number;
  code: string;
  name: string;
  /** true si tiene cuentas hijas (se muestra como subtotal). */
  group: boolean;
  line: T | null;
  /** Una cifra por columna (con subtotal incluido si es grupo), ya en texto con 4 decimales. */
  sums: string[];
}

interface Base { accountId: string; code: string; name: string }
interface Node<T> { id: string; code: string; name: string; parentId: string | null; line: T | null; children: Node<T>[] }

/**
 * Ordena las líneas de un reporte por la jerarquía del plan de cuentas (parentId) y agrega las
 * cuentas padre que no tienen movimiento como filas de subtotal. Sin catálogo cargado queda plano por código.
 */
export function buildTree<T extends Base>(lines: T[], accounts: Account[], values: (l: T) => Num[], cols: number): TreeRow<T>[] {
  const accById = new Map(accounts.map((a) => [a.id, a]));
  const nodes = new Map<string, Node<T>>();
  for (const l of lines) {
    nodes.set(l.accountId, { id: l.accountId, code: l.code, name: l.name, parentId: accById.get(l.accountId)?.parentId ?? null, line: l, children: [] });
  }
  for (const l of lines) {
    let pid = nodes.get(l.accountId)?.parentId ?? null;
    const seen = new Set<string>([l.accountId]);
    while (pid && !seen.has(pid)) {
      seen.add(pid);
      let n = nodes.get(pid);
      if (!n) {
        const a = accById.get(pid);
        if (!a) break;
        n = { id: a.id, code: a.code, name: a.name, parentId: a.parentId, line: null, children: [] };
        nodes.set(pid, n);
      }
      pid = n.parentId;
    }
  }
  const roots: Node<T>[] = [];
  for (const n of nodes.values()) {
    const parent = n.parentId ? nodes.get(n.parentId) : undefined;
    if (parent && parent !== n) parent.children.push(n); else roots.push(n);
  }
  const byCode = (a: Node<T>, b: Node<T>) => a.code.localeCompare(b.code, 'es', { numeric: true });
  const out: TreeRow<T>[] = [];
  const walk = (n: Node<T>, depth: number): Decimal[] => {
    const slot = out.length;
    out.push({ key: n.id, depth, code: n.code, name: n.name, group: n.children.length > 0, line: n.line, sums: [] });
    const total = Array.from({ length: cols }, (_, i) => (n.line ? dec(values(n.line)[i]) : new Decimal(0)));
    for (const c of n.children.sort(byCode)) {
      const s = walk(c, depth + 1);
      for (let i = 0; i < cols; i++) total[i] = total[i].plus(s[i]);
    }
    out[slot].sums = total.map((d) => d.toFixed(4));
    return total;
  };
  for (const r of roots.sort(byCode)) walk(r, 0);
  return out;
}
