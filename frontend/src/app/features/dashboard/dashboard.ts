import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { addMonths, endOfMonth, format, startOfMonth } from 'date-fns';
import { es } from 'date-fns/locale';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { dec, sumDec, today, yearStart } from '../../shared/format';
import { INVOICE_STATUS, INVOICE_TYPE } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { KpiStrip } from './kpi-strip';
import { FiscalAlerts } from './fiscal-alerts';
import { SetupChecklist } from './setup-checklist';

interface Income { totalIncome: string; totalExpenses: string; netIncome: string }
interface Aging { current: string; d1_30: string; d31_60: string; d61_90: string; over90: string; total: string }
interface Inv { id: string; number: string | null; type: string; status: string; issueDate: string; total: string; balance: string; partner?: { name: string } | null }

@Component({
  selector: 'app-dashboard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, KpiStrip, FiscalAlerts, SetupChecklist, ...UI],
  templateUrl: './dashboard.html',
  styles: `
    .dash-grid { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 16px; align-items: start; }
    .dash-grid:has(> app-setup-checklist:empty) { grid-template-columns: minmax(0, 1fr); }
    @media (max-width: 1100px) { .dash-grid { grid-template-columns: minmax(0, 1fr); } }
    .attention { overflow: hidden; }
    .attention > :last-child, .attention ::ng-deep app-fiscal-alerts > .row:last-child { border-bottom: 0; }
    .row { display: flex; gap: 12px; align-items: center; padding: 12px 22px; border-bottom: 1px solid var(--line); font-size: 13.5px; color: var(--text); text-decoration: none; }
    a.row:hover { background: var(--surface-2); text-decoration: none; }
    .row .ic { flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; }
    .row.warn .ic { background: var(--warn-soft); color: var(--warn); } .row.info .ic { background: var(--info-soft); color: var(--info); } .row.pos .ic { background: var(--pos-soft); color: var(--pos); }
    .row .txt { flex: 1; } .row .go { color: var(--primary); font-weight: 500; font-size: 13px; }
    .bucket { display: grid; grid-template-columns: 120px 1fr 110px; gap: 10px; align-items: center; padding: 6px 0; }
    .bar { height: 10px; background: var(--surface-2); border-radius: 5px; overflow: hidden; }
    .bar > i { display: block; height: 100%; background: var(--primary); border-radius: 5px; }
    .bar.late > i { background: var(--neg); }
  `,
})
export class Dashboard {
  private readonly api = inject(Api);
  protected readonly auth = inject(Auth);
  protected readonly lookups = inject(Lookups);
  protected readonly INVOICE_STATUS = INVOICE_STATUS;
  protected readonly INVOICE_TYPE = INVOICE_TYPE;

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly year = new Date().getFullYear();
  protected readonly ytd = signal<Income | null>(null);
  protected readonly receivable = signal<Aging | null>(null);
  protected readonly payable = signal<Aging | null>(null);
  protected readonly recent = signal<Inv[]>([]);
  protected readonly overdueCount = signal(0);
  protected readonly pendingEntries = signal(0);
  protected readonly series = signal<{ label: string; income: number; expenses: number }[]>([]);

  protected readonly banks = computed(() => sumDec(this.lookups.bankAccounts().map((b) => b.glBalance)).toString());
  protected readonly canApprove = computed(() => this.auth.has('ADMIN', 'APPROVER'));
  protected readonly buckets = computed(() => {
    const a = this.receivable();
    if (!a) return [];
    const total = dec(a.total);
    const rows: { label: string; value: string; late: boolean }[] = [
      { label: 'Al día', value: a.current, late: false }, { label: '1–30 días', value: a.d1_30, late: true },
      { label: '31–60 días', value: a.d31_60, late: true }, { label: '61–90 días', value: a.d61_90, late: true }, { label: 'Más de 90', value: a.over90, late: true },
    ];
    return rows.map((r) => ({ ...r, width: total.isZero() ? 0 : Math.max(0, Math.min(100, dec(r.value).div(total).times(100).toNumber())) }));
  });

  protected readonly chart = computed<ChartConfiguration>(() => {
    const s = this.series();
    return {
      type: 'bar',
      data: {
        labels: s.map((x) => x.label),
        datasets: [
          { label: 'Ingresos', data: s.map((x) => x.income), backgroundColor: '#0c6b5e', borderRadius: 3 },
          { label: 'Gastos', data: s.map((x) => x.expenses), backgroundColor: '#e0a526', borderRadius: 3 },
        ],
      },
      options: { plugins: { legend: { position: 'bottom' } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => Number(v).toLocaleString('es-DO') } } } },
    };
  });

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    try {
      const now = new Date();
      const months = Array.from({ length: 6 }, (_, i) => addMonths(startOfMonth(now), i - 5));
      const [ytd, ar, ap, recent, overdue, pending, ...monthly] = await Promise.all([
        this.api.getP<Income>('/reports/income-statement', { from: yearStart(), to: today() }),
        this.api.getP<{ totals: Aging }>('/receivables-payables/aging', { scope: 'RECEIVABLE' }),
        this.api.getP<{ totals: Aging }>('/receivables-payables/aging', { scope: 'PAYABLE' }),
        this.api.getP<Page<Inv>>('/invoices', { limit: 8 }),
        this.api.getP<Page<Inv>>('/invoices', { overdue: true, limit: 1 }),
        this.canApprove() ? this.api.getP<Page<unknown>>('/accounting/journal-entries', { status: 'DRAFT', limit: 1 }) : Promise.resolve(null),
        ...months.map((m) => this.api.getP<Income>('/reports/income-statement', { from: format(m, 'yyyy-MM-dd'), to: format(endOfMonth(m), 'yyyy-MM-dd') })),
      ]);
      this.ytd.set(ytd);
      this.receivable.set(ar.totals);
      this.payable.set(ap.totals);
      this.recent.set(recent.data);
      this.overdueCount.set(overdue.total);
      this.pendingEntries.set(pending?.total ?? 0);
      this.series.set(months.map((m, i) => ({
        label: format(m, 'MMM', { locale: es }), income: Number(monthly[i].totalIncome), expenses: Number(monthly[i].totalExpenses),
      })));
    } catch (e) {
      this.error.set(errorMessage(e));
    }
    this.loading.set(false);
  }
}
