import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import Decimal from 'decimal.js';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { dec, pct, sumDec } from '../../shared/format';
import { ACCOUNT_TYPE, BUDGET_STATUS } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { BudgetFull, VaTotal, VsActual } from './report-types';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));

interface EditRow { accountId: string; code: string; name: string; type: string; cells: string[] }

/** 12500.0000 -> "12500"; 12500.5000 -> "12500.5" */
function trimmed(v: string): string { return dec(v).toFixed(4).replace(/\.?0+$/, '') || '0'; }
function cssVar(name: string, fallback: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

@Component({
  selector: 'app-budget-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  templateUrl: './budget-detail.html',
  styles: `
    .grid td, .grid th { padding: 4px 4px; }
    .grid th:first-child, .grid td:first-child { padding-left: 12px; min-width: 220px; position: sticky; left: 0; background: var(--surface); z-index: 1; }
    .grid .cell { width: 96px; min-width: 96px; height: 30px; padding: 0 6px; }
    .grid .total { min-width: 110px; font-weight: 600; }
    .sec-title td { font-weight: 600; background: var(--surface-2); }
    .total-row td { font-weight: 600; border-top: 1px solid var(--line-strong); }
    .grand td { font-weight: 700; border-top: 2px solid var(--line-strong); background: var(--surface-2); }
    .add-box { min-width: 280px; max-width: 420px; flex: 1; }
    .linkbtn { background: none; border: 0; padding: 0; color: var(--primary); cursor: pointer; text-align: left; font: inherit; }
    .linkbtn:hover { text-decoration: underline; }
    .month-row td { background: var(--surface-2); font-size: 13px; }
  `,
})
export class BudgetDetail implements OnInit {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);

  readonly id = input.required<string>();

  protected readonly MONTHS = MONTHS;
  protected readonly MONTHS_SHORT = MONTHS_SHORT;
  protected readonly BUDGET_STATUS = BUDGET_STATUS;
  protected readonly ACCOUNT_TYPE = ACCOUNT_TYPE;
  protected readonly monthIdx = Array.from({ length: 12 }, (_, i) => i);
  protected readonly canEdit = this.auth.has('ADMIN', 'ACCOUNTANT');
  protected readonly canApprove = this.auth.has('ADMIN', 'APPROVER');
  protected readonly isAdmin = this.auth.has('ADMIN');

  protected readonly budget = signal<BudgetFull | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly tab = signal<'lines' | 'vs'>('lines');
  protected readonly busy = signal(false);

  // ---- editor de líneas ----
  protected readonly rows = signal<EditRow[]>([]);
  protected readonly dirty = signal(false);
  protected readonly saving = signal(false);
  protected readonly saveError = signal('');
  protected readonly addCtl = this.fb.nonNullable.control('');
  protected readonly editable = computed(() => this.canEdit && this.budget()?.status === 'DRAFT');

  protected readonly incomeRows = computed(() => this.rows().filter((r) => r.type === 'INCOME'));
  protected readonly expenseRows = computed(() => this.rows().filter((r) => r.type === 'EXPENSE'));
  protected readonly addOptions = computed<ComboOption[]>(() => {
    const used = new Set(this.rows().map((r) => r.accountId));
    return this.lookups.accounts()
      .filter((a) => a.active && a.isPostable && (a.type === 'INCOME' || a.type === 'EXPENSE') && !used.has(a.id))
      .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: ACCOUNT_TYPE[a.type as keyof typeof ACCOUNT_TYPE] }));
  });
  /** Totales por mes: ingresos, gastos y resultado, más el total anual. */
  protected readonly colTotals = computed(() => {
    const col = (rows: EditRow[]) => this.monthIdx.map((i) => sumDec(rows.map((r) => r.cells[i])));
    const inc = col(this.incomeRows());
    const exp = col(this.expenseRows());
    const net = inc.map((v, i) => v.minus(exp[i]));
    const tot = (xs: Decimal[]) => xs.reduce((s, v) => s.plus(v), new Decimal(0));
    return {
      income: inc.map((d) => d.toFixed(4)), expense: exp.map((d) => d.toFixed(4)), net: net.map((d) => d.toFixed(4)),
      incomeTotal: tot(inc).toFixed(4), expenseTotal: tot(exp).toFixed(4), netTotal: tot(net).toFixed(4),
    };
  });

  // ---- datos del encabezado (editar nombre y notas) ----
  protected readonly metaOpen = signal(false);
  protected readonly metaError = signal('');
  protected readonly metaForm = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]], notes: [''],
  });

  // ---- presupuesto vs real ----
  protected readonly fromMonth = signal(1);
  protected readonly toMonth = signal(12);
  protected readonly vs = signal<VsActual | null>(null);
  protected readonly vsLoading = signal(false);
  protected readonly vsError = signal('');
  protected readonly expanded = signal<ReadonlySet<string>>(new Set());
  protected readonly vsIncome = computed(() => (this.vs()?.rows ?? []).filter((r) => r.type === 'INCOME'));
  protected readonly vsExpense = computed(() => (this.vs()?.rows ?? []).filter((r) => r.type === 'EXPENSE'));
  protected readonly vsChart = computed<ChartConfiguration | null>(() => {
    const v = this.vs();
    if (!v) return null;
    const months = Array.from({ length: v.toMonth - v.fromMonth + 1 }, (_, i) => v.fromMonth + i);
    const net = (key: 'planned' | 'actual') => months.map((m) => Number(
      v.rows.reduce((s, r) => {
        const x = r.months.find((c) => c.month === m);
        if (!x) return s;
        return r.type === 'INCOME' ? s.plus(dec(x[key])) : s.minus(dec(x[key]));
      }, new Decimal(0)),
    ));
    return {
      type: 'bar',
      data: {
        labels: months.map((m) => MONTHS_SHORT[m - 1]),
        datasets: [
          { label: 'Presupuesto', data: net('planned'), backgroundColor: cssVar('--marker', '#e0a526'), borderRadius: 3 },
          { label: 'Real', data: net('actual'), backgroundColor: cssVar('--primary', '#0c6b5e'), borderRadius: 3 },
        ],
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { ticks: { callback: (x) => Number(x).toLocaleString('es-DO') } } } },
    };
  });

  constructor() {
    this.addCtl.valueChanges.pipe(takeUntilDestroyed()).subscribe((v) => {
      if (!v) return;
      this.addRow(v);
      this.addCtl.setValue('', { emitEvent: false });
    });
  }

  ngOnInit(): void {
    void this.lookups.ensureAccounts().catch(() => undefined);
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const b = await this.api.getP<BudgetFull>(`/budgets/${this.id()}`);
      this.applyBudget(b);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  private applyBudget(b: BudgetFull): void {
    this.budget.set(b);
    const map = new Map<string, EditRow>();
    for (const l of b.lines) {
      let r = map.get(l.accountId);
      if (!r) {
        r = { accountId: l.accountId, code: l.account.code, name: l.account.name, type: l.account.type, cells: Array.from({ length: 12 }, () => '') };
        map.set(l.accountId, r);
      }
      r.cells[l.month - 1] = trimmed(l.plannedAmount);
    }
    this.rows.set([...map.values()].sort((a, b2) => a.code.localeCompare(b2.code, 'es', { numeric: true })));
    this.dirty.set(false);
  }

  protected setTab(t: 'lines' | 'vs'): void {
    this.tab.set(t);
    if (t === 'vs' && !this.vs()) void this.loadVs();
  }

  // ---- edición de la grilla ----
  private addRow(accountId: string): void {
    const a = this.lookups.accounts().find((x) => x.id === accountId);
    if (!a || this.rows().some((r) => r.accountId === accountId)) return;
    const row: EditRow = { accountId, code: a.code, name: a.name, type: a.type, cells: Array.from({ length: 12 }, () => '') };
    this.rows.update((rs) => [...rs, row].sort((x, y) => x.code.localeCompare(y.code, 'es', { numeric: true })));
    this.dirty.set(true);
  }
  protected setCell(accountId: string, idx: number, value: string): void {
    this.rows.update((rs) => rs.map((r) => (r.accountId === accountId ? { ...r, cells: r.cells.map((c, i) => (i === idx ? value : c)) } : r)));
    this.dirty.set(true);
  }
  protected removeRow(accountId: string): void {
    this.rows.update((rs) => rs.filter((r) => r.accountId !== accountId));
    this.dirty.set(true);
  }
  /** Copia el primer importe escrito a los 12 meses de esa cuenta. */
  protected fillYear(accountId: string): void {
    this.rows.update((rs) => rs.map((r) => {
      if (r.accountId !== accountId) return r;
      const first = r.cells.find((c) => c !== '');
      return first === undefined ? r : { ...r, cells: r.cells.map(() => first) };
    }));
    this.dirty.set(true);
  }
  protected rowTotal(r: EditRow): string { return sumDec(r.cells).toFixed(4); }

  protected async saveLines(): Promise<void> {
    if (this.saving()) return;
    this.saveError.set('');
    const lines: { accountId: string; month: number; plannedAmount: number }[] = [];
    for (const r of this.rows()) {
      for (let i = 0; i < 12; i++) {
        const raw = r.cells[i].trim();
        if (raw === '') continue;
        const n = Number(raw);
        if (!Number.isFinite(n) || n < 0) { this.saveError.set(`El importe de ${r.code} en ${MONTHS[i].toLowerCase()} no es válido. Usa un número igual o mayor que cero.`); return; }
        if (!dec(raw).eq(dec(raw).toDecimalPlaces(4))) { this.saveError.set(`El importe de ${r.code} en ${MONTHS[i].toLowerCase()} admite máximo 4 decimales.`); return; }
        lines.push({ accountId: r.accountId, month: i + 1, plannedAmount: n });
      }
    }
    if (lines.length === 0) { this.saveError.set('Escribe al menos un importe antes de guardar.'); return; }
    if (lines.length > 1200) { this.saveError.set('Un presupuesto admite hasta 1,200 líneas (cuenta por mes). Reduce las cuentas o los meses.'); return; }
    this.saving.set(true);
    try {
      const b = await firstValueFrom(this.api.put<BudgetFull>(`/budgets/${this.id()}/lines`, { lines, replace: true }));
      this.applyBudget(b);
      this.vs.set(null);
      this.notify.ok('Líneas guardadas.');
    } catch (e) { this.saveError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  // ---- encabezado ----
  protected openMeta(): void {
    const b = this.budget();
    if (!b) return;
    this.metaError.set('');
    this.metaForm.reset({ name: b.name, notes: b.notes ?? '' });
    this.metaOpen.set(true);
  }
  protected async saveMeta(): Promise<void> {
    this.metaForm.markAllAsTouched();
    if (this.metaForm.invalid || this.busy()) return;
    this.busy.set(true); this.metaError.set('');
    const v = this.metaForm.getRawValue();
    try {
      await firstValueFrom(this.api.patch(`/budgets/${this.id()}`, { name: v.name.trim(), notes: v.notes.trim() }));
      this.notify.ok('Presupuesto actualizado.');
      this.metaOpen.set(false);
      const b = await this.api.getP<BudgetFull>(`/budgets/${this.id()}`);
      this.budget.set(b);
    } catch (e) { this.metaError.set(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async transition(action: 'approve' | 'reopen' | 'archive'): Promise<void> {
    const b = this.budget();
    if (!b || this.busy()) return;
    if (action === 'approve' && this.dirty()) { this.notify.error('Tienes cambios sin guardar. Guarda las líneas antes de aprobar.'); return; }
    const texts = {
      approve: { title: 'Aprobar presupuesto', message: 'Al aprobarlo, las líneas quedan bloqueadas. Un administrador puede reabrirlo si hay que corregir algo.', confirmText: 'Aprobar', danger: false, done: 'Presupuesto aprobado.' },
      reopen: { title: 'Reabrir presupuesto', message: 'Volverá a borrador y podrás editar las líneas de nuevo.', confirmText: 'Reabrir', danger: false, done: 'Presupuesto reabierto.' },
      archive: { title: 'Archivar presupuesto', message: 'Queda como histórico y ya no se puede reabrir desde aquí.', confirmText: 'Archivar', danger: true, done: 'Presupuesto archivado.' },
    }[action];
    if (!(await this.confirm.ask(texts))) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.post(`/budgets/${this.id()}/${action}`));
      this.notify.ok(texts.done);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async remove(): Promise<void> {
    const b = this.budget();
    if (!b) return;
    if (!(await this.confirm.ask({ title: 'Eliminar presupuesto', message: `Se eliminará «${b.name}» con todas sus líneas. Esta acción no se puede deshacer.`, confirmText: 'Eliminar', danger: true }))) return;
    try {
      await firstValueFrom(this.api.delete(`/budgets/${this.id()}`));
      this.notify.ok('Presupuesto eliminado.');
      await this.router.navigate(['/budgets']);
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

  // ---- presupuesto vs real ----
  protected setRange(which: 'from' | 'to', v: string): void {
    const n = Number(v);
    if (which === 'from') { this.fromMonth.set(n); if (n > this.toMonth()) this.toMonth.set(n); }
    else { this.toMonth.set(n); if (n < this.fromMonth()) this.fromMonth.set(n); }
    void this.loadVs();
  }
  protected async loadVs(): Promise<void> {
    this.vsLoading.set(true); this.vsError.set('');
    try { this.vs.set(await this.api.getP<VsActual>(`/budgets/${this.id()}/vs-actual`, { fromMonth: this.fromMonth(), toMonth: this.toMonth() })); }
    catch (e) { this.vsError.set(errorMessage(e)); }
    this.vsLoading.set(false);
  }
  protected toggle(accountId: string): void {
    this.expanded.update((s) => { const n = new Set(s); if (n.has(accountId)) n.delete(accountId); else n.add(accountId); return n; });
  }
  protected pctText(v: string | null): string { return v === null ? '—' : pct(v, 1); }
  /** ¿La variación es favorable? Ingreso: real ≥ presupuesto; gasto: real ≤ presupuesto. */
  protected fav(kind: 'INCOME' | 'EXPENSE' | 'NET', t: VaTotal): boolean {
    const v = dec(t.variance);
    return kind === 'EXPENSE' ? v.lte(0) : v.gte(0);
  }
  protected totalPct(t: VaTotal): string {
    return dec(t.planned).isZero() ? '—' : pct(dec(t.variance).div(dec(t.planned)).times(100).toFixed(4), 1);
  }
}
