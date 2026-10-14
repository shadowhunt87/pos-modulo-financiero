/**
 * Vencimientos del calendario fiscal (PLAN-v0.3 §8.2), como función pura (prueba de unidad sin base de datos).
 * Cada vencimiento que cae en sábado, domingo o feriado CARGADO pasa al siguiente día laborable.
 */
export interface ObligationRule {
  code: string; name: string; frequency: 'MONTHLY' | 'ANNUAL'; rule: 'DAY_OF_NEXT_MONTH' | 'DAYS_AFTER_FY_END' | 'FIXED_DATE';
  ruleValue: number; appliesWhen: Record<string, unknown> | null; validFrom: Date;
}
export interface Occurrence { code: string; name: string; period: string; dueDate: Date; originalDate: Date }

const iso = (d: Date) => d.toISOString().slice(0, 10);
const utc = (y: number, m: number, day: number) => new Date(Date.UTC(y, m, day));

/** Último día del mes (sin pasarse: un día 31 en febrero queda en el 28 o 29). */
function clampDay(y: number, m: number, day: number) {
  return utc(y, m, Math.min(day, new Date(Date.UTC(y, m + 1, 0)).getUTCDate()));
}

export function nextWorkingDay(d: Date, holidays: Set<string>): Date {
  const x = new Date(d.getTime());
  while (x.getUTCDay() === 0 || x.getUTCDay() === 6 || holidays.has(iso(x))) x.setUTCDate(x.getUTCDate() + 1);
  return x;
}

export function applies(o: Pick<ObligationRule, 'appliesWhen'>, profile: Record<string, unknown>): boolean {
  if (!o.appliesWhen) return true;
  return Object.entries(o.appliesWhen).every(([k, v]) => profile[k] === undefined || profile[k] === null || profile[k] === v);
}

/**
 * Vencimientos entre `from` y `to` (incluidos), por la fecha de vencimiento ya corrida.
 * `fyStartMonth` 1-12; el cierre es el último día del mes anterior al inicio.
 */
export function occurrences(rules: ObligationRule[], from: Date, to: Date, fyStartMonth: number, holidays: Set<string>, profile: Record<string, unknown> = {}): Occurrence[] {
  const out: Occurrence[] = [];
  const startY = from.getUTCFullYear() - 1, endY = to.getUTCFullYear() + 1;
  for (const r of rules.filter((x) => applies(x, profile))) {
    const push = (period: string, original: Date) => {
      if (original < r.validFrom) return;
      const due = nextWorkingDay(original, holidays);
      if (due >= from && due <= to) out.push({ code: r.code, name: r.name, period, dueDate: due, originalDate: original });
    };
    if (r.rule === 'DAY_OF_NEXT_MONTH') {
      for (let y = startY; y <= endY; y++) for (let m = 0; m < 12; m++) {
        push(`${y}-${String(m + 1).padStart(2, '0')}`, clampDay(m === 11 ? y + 1 : y, (m + 1) % 12, r.ruleValue));
      }
    } else if (r.rule === 'DAYS_AFTER_FY_END') {
      for (let y = startY; y <= endY; y++) {
        // Cierre: último día del mes anterior al de inicio (inicio enero → 31-dic del mismo año)
        const endMonth = (fyStartMonth + 10) % 12; // 0-11
        const fyEnd = utc(y, endMonth + 1, 0);
        push(String(y), new Date(fyEnd.getTime() + r.ruleValue * 86_400_000));
      }
    } else {
      const mm = Math.floor(r.ruleValue / 100) - 1, dd = r.ruleValue % 100;
      for (let y = startY; y <= endY; y++) push(String(y - 1), utc(y, mm, dd));
    }
  }
  return out.sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime() || a.code.localeCompare(b.code));
}
