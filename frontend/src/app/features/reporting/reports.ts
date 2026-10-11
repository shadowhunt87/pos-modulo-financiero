import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { subMonths } from 'date-fns';
import { Api, Query } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { clean, dec, isoDate, money, monthRange, pct, sumDec, today, yearEnd, yearStart } from '../../shared/format';
import { ACCOUNT_TYPE, ENTRY_TYPE, SOURCE_DOC, SUBLEDGER_TYPE } from '../../shared/labels';
import { ComboOption, ExportButtons, UI } from '../../shared/ui';
import { buildTree } from './report-tree';
import {
  BalanceSheet, CashFlow, CashSection, GlSummary, IncomeStatement, JournalBook, LedgerDetail, LedgerMovement, Ratio, Ratios, Subledger, TrialBalance,
} from './report-types';

const TABS = [
  { id: 'income', label: 'Estado de resultados' },
  { id: 'balance', label: 'Balance general' },
  { id: 'cash', label: 'Flujo de efectivo' },
  { id: 'trial', label: 'Balanza de comprobación' },
  { id: 'ledger', label: 'Mayor general' },
  { id: 'journal', label: 'Libro diario' },
  { id: 'account', label: 'Detalle por cuenta' },
  { id: 'subledger', label: 'Auxiliar por tercero' },
  { id: 'ratios', label: 'Razones financieras' },
] as const;
type TabId = (typeof TABS)[number]['id'];

const RATIO_GROUPS: { key: string; label: string }[] = [
  { key: 'LIQUIDITY', label: 'Liquidez' }, { key: 'LEVERAGE', label: 'Endeudamiento' },
  { key: 'PROFITABILITY', label: 'Rentabilidad' }, { key: 'ACTIVITY', label: 'Actividad' },
];
const STATEMENT_FIGURES: { key: string; label: string }[] = [
  { key: 'operatingRevenue', label: 'Ingresos operativos' }, { key: 'grossProfit', label: 'Utilidad bruta' },
  { key: 'ebitda', label: 'EBITDA' }, { key: 'ebit', label: 'Utilidad operativa' }, { key: 'netIncome', label: 'Utilidad neta' },
];
const SECTION_LABEL: Record<string, string> = { ASSET: 'Activo', LIABILITY: 'Pasivo', INCOME: 'Ingreso', EXPENSE: 'Gasto' };

function cssVar(name: string, fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

@Component({
  selector: 'app-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet, ExportButtons, ...UI],
  templateUrl: './reports.html',
  styles: `
    .linkbtn { background: none; border: 0; padding: 0; color: var(--primary); cursor: pointer; text-align: left; font: inherit; }
    .linkbtn:hover { text-decoration: underline; }
    .presets { margin: -4px 0 14px; }
    .sec-title td { font-weight: 600; background: var(--surface-2); }
    .total-row td { font-weight: 600; border-top: 1px solid var(--line-strong); }
    .grand td { font-weight: 700; border-top: 2px solid var(--line-strong); background: var(--surface-2); }
    .entry-lines td { border-bottom: 0; padding-top: 3px; padding-bottom: 3px; }
    .ratio-formula { font-size: 12px; }
    .stack > * + * { margin-top: 0; }
  `,
})
export class Reports implements OnInit {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly lookups = inject(Lookups);

  /** Enlaces profundos: /reports?tab=account&accountId=… */
  readonly tabParam = input<string | undefined>(undefined, { alias: 'tab' });
  readonly accountIdParam = input<string | undefined>(undefined, { alias: 'accountId' });
  readonly partnerIdParam = input<string | undefined>(undefined, { alias: 'partnerId' });
  readonly fromParam = input<string | undefined>(undefined, { alias: 'from' });
  readonly toParam = input<string | undefined>(undefined, { alias: 'to' });

  protected readonly TABS = TABS;
  protected readonly ACCOUNT_TYPE = ACCOUNT_TYPE;
  protected readonly ENTRY_TYPE = ENTRY_TYPE;
  protected readonly SUBLEDGER_TYPE = SUBLEDGER_TYPE;
  protected readonly pageSize = 50;

  protected readonly tab = signal<TabId>('income');
  protected readonly loading = signal(false);
  protected readonly error = signal('');
  protected readonly message = signal('');
  protected readonly exportSpec = signal<{ path: string; query: Query; name: string } | null>(null);
  private seq = 0;

  protected readonly income = signal<IncomeStatement | null>(null);
  protected readonly balance = signal<BalanceSheet | null>(null);
  protected readonly cash = signal<CashFlow | null>(null);
  protected readonly trial = signal<TrialBalance | null>(null);
  protected readonly gl = signal<GlSummary | null>(null);
  protected readonly journal = signal<JournalBook | null>(null);
  protected readonly detail = signal<LedgerDetail | null>(null);
  protected readonly subledger = signal<Subledger | null>(null);
  protected readonly ratios = signal<Ratios | null>(null);
  protected readonly jPage = signal(1);
  protected readonly dPage = signal(1);

  protected readonly form = this.fb.nonNullable.group({
    from: [yearStart()], to: [today()], asOf: [today()], periodStart: [''], accountId: [''], partnerId: [''],
  });

  // ---- opciones de selectores ----
  protected readonly accountOptions = computed<ComboOption[]>(() =>
    this.lookups.accounts().map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: ACCOUNT_TYPE[a.type as keyof typeof ACCOUNT_TYPE] ?? a.type })));
  protected readonly subledgerOptions = computed<ComboOption[]>(() => {
    const control = this.lookups.accounts().filter((a) => a.subledger);
    const list = control.length ? control : this.lookups.accounts();
    return list.map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: a.subledger ? (SUBLEDGER_TYPE[a.subledger] ?? a.subledger) : undefined }));
  });
  protected readonly partnerOptions = computed<ComboOption[]>(() =>
    this.lookups.partners().map((p) => ({ value: p.id, label: p.name, hint: p.taxId ?? undefined })));

  // ---- jerarquía por indentación ----
  private readonly accounts = this.lookups.accounts;
  protected readonly incomeTree = computed(() => buildTree(this.income()?.income ?? [], this.accounts(), (l) => [l.amount], 1));
  protected readonly expenseTree = computed(() => buildTree(this.income()?.expenses ?? [], this.accounts(), (l) => [l.amount], 1));
  protected readonly assetTree = computed(() => buildTree(this.balance()?.assets ?? [], this.accounts(), (l) => [l.amount], 1));
  protected readonly liabilityTree = computed(() => buildTree(this.balance()?.liabilities ?? [], this.accounts(), (l) => [l.amount], 1));
  protected readonly equityTree = computed(() => buildTree(this.balance()?.equity ?? [], this.accounts(), (l) => [l.amount], 1));
  protected readonly trialTree = computed(() => buildTree(this.trial()?.lines ?? [], this.accounts(), (l) => [l.debit, l.credit, l.balance], 3));
  protected readonly glTree = computed(() => buildTree(this.gl()?.lines ?? [], this.accounts(), (l) => [l.openingBalance, l.debit, l.credit, l.closingBalance], 4));

  protected readonly balanceDiff = computed(() => {
    const b = this.balance();
    return b ? dec(b.totalAssets).minus(dec(b.totalLiabilities)).minus(dec(b.totalEquity)).toFixed(4) : '0';
  });
  protected readonly cashSections = computed<{ title: string; sec: CashSection }[]>(() => {
    const c = this.cash();
    if (!c) return [];
    const out = [
      { title: 'Actividades de operación', sec: c.operating },
      { title: 'Actividades de inversión', sec: c.investing },
      { title: 'Actividades de financiamiento', sec: c.financing },
    ];
    if (c.unclassified.lines.length) out.push({ title: 'Sin clasificar (revisa la clasificación de cuentas)', sec: c.unclassified });
    return out;
  });
  protected readonly ratioGroups = computed(() => {
    const r = this.ratios();
    if (!r) return [];
    return RATIO_GROUPS.map((g) => ({ ...g, items: r.ratios.filter((x) => x.group === g.key) })).filter((g) => g.items.length);
  });
  protected readonly statementFigures = computed(() => {
    const s = this.ratios()?.statement;
    return s ? STATEMENT_FIGURES.filter((f) => s[f.key] !== undefined).map((f) => ({ label: f.label, value: s[f.key] })) : [];
  });
  protected readonly sectionLabel = SECTION_LABEL;

  protected readonly incomeChart = computed<ChartConfiguration | null>(() => {
    const r = this.income();
    if (!r) return null;
    const good = cssVar('--primary', '#0c6b5e');
    const net = Number(r.netIncome);
    return {
      type: 'bar',
      data: {
        labels: ['Ingresos', 'Gastos', 'Resultado neto'],
        datasets: [{
          data: [Number(r.totalIncome), Number(r.totalExpenses), net],
          backgroundColor: [good, cssVar('--marker', '#e0a526'), net >= 0 ? good : cssVar('--neg', '#c0392b')],
          borderRadius: 3,
        }],
      },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { callback: (v) => Number(v).toLocaleString('es-DO') } } } },
    };
  });

  ngOnInit(): void {
    const t = this.tabParam();
    if (t && TABS.some((x) => x.id === t)) this.tab.set(t as TabId);
    const patch: Record<string, string> = {};
    const from = this.fromParam(), to = this.toParam(), acc = this.accountIdParam(), partner = this.partnerIdParam();
    if (from) patch['from'] = isoDate(from);
    if (to) { patch['to'] = isoDate(to); patch['asOf'] = isoDate(to); }
    if (acc) patch['accountId'] = acc;
    if (partner) patch['partnerId'] = partner;
    this.form.patchValue(patch);
    void Promise.all([this.lookups.ensureAccounts(), this.lookups.ensurePartners()]).catch(() => undefined);
    void this.run();
  }

  protected setTab(t: TabId): void {
    this.tab.set(t);
    this.jPage.set(1); this.dPage.set(1);
    void this.run();
  }

  protected apply(): void {
    this.jPage.set(1); this.dPage.set(1);
    void this.run();
  }

  /** Atajos de fechas. */
  protected preset(kind: 'month' | 'prevMonth' | 'year' | 'prevYear' | 'all' | 'today' | 'prevMonthEnd' | 'prevYearEnd'): void {
    const y = new Date().getFullYear();
    switch (kind) {
      case 'month': this.form.patchValue(monthRange()); break;
      case 'prevMonth': this.form.patchValue(monthRange(subMonths(new Date(), 1))); break;
      case 'year': this.form.patchValue({ from: yearStart(), to: today() }); break;
      case 'prevYear': this.form.patchValue({ from: yearStart(y - 1), to: yearEnd(y - 1) }); break;
      case 'all': this.form.patchValue({ from: '', to: '' }); break;
      case 'today': this.form.patchValue({ asOf: today(), periodStart: '' }); break;
      case 'prevMonthEnd': this.form.patchValue({ asOf: monthRange(subMonths(new Date(), 1)).to, periodStart: '' }); break;
      case 'prevYearEnd': this.form.patchValue({ asOf: yearEnd(y - 1), periodStart: '' }); break;
    }
    this.apply();
  }

  /** Salta al detalle de una cuenta (drill-down desde cualquier reporte). */
  protected openAccount(accountId: string, partnerId = ''): void {
    this.form.patchValue({ accountId, partnerId });
    this.tab.set('account');
    this.apply();
  }

  protected goJournal(p: number): void { this.jPage.set(p); void this.run(); }
  protected goDetail(p: number): void { this.dPage.set(p); void this.run(); }

  protected async run(): Promise<void> {
    const t = this.tab();
    const v = this.form.getRawValue();
    this.error.set(''); this.message.set('');
    const needsRange = t === 'income' || t === 'cash' || t === 'ratios';
    if (needsRange && (!v.from || !v.to)) { this.message.set('Indica la fecha inicial y la final para ver este reporte.'); return; }
    if (t === 'balance' && !v.asOf) { this.message.set('Indica la fecha de corte del balance.'); return; }
    if ((t === 'account' || t === 'subledger') && !v.accountId) { this.message.set('Elige una cuenta para ver este reporte.'); return; }
    if (t !== 'balance' && v.from && v.to && v.from > v.to) { this.error.set('La fecha inicial no puede ser posterior a la final. Corrige el rango y vuelve a intentar.'); return; }

    const id = ++this.seq;
    this.loading.set(true);
    this.exportSpec.set(null);
    const range = clean({ from: v.from, to: v.to }) as Query;
    try {
      switch (t) {
        case 'income': {
          this.income.set(await this.api.getP<IncomeStatement>('/reports/income-statement', range));
          if (id === this.seq) this.exportSpec.set({ path: '/exports/income-statement', query: range, name: 'estado-de-resultados' });
          break;
        }
        case 'balance': {
          const q = clean({ asOf: v.asOf, periodStart: v.periodStart }) as Query;
          this.balance.set(await this.api.getP<BalanceSheet>('/reports/balance-sheet', q));
          if (id === this.seq) this.exportSpec.set({ path: '/exports/balance-sheet', query: q, name: 'balance-general' });
          break;
        }
        case 'cash': {
          this.cash.set(await this.api.getP<CashFlow>('/reports/cash-flow', range));
          if (id === this.seq) this.exportSpec.set({ path: '/exports/cash-flow', query: range, name: 'flujo-de-efectivo' });
          break;
        }
        case 'trial': {
          this.trial.set(await this.api.getP<TrialBalance>('/accounting/trial-balance', range));
          if (id === this.seq) this.exportSpec.set({ path: '/exports/trial-balance', query: range, name: 'balanza-de-comprobacion' });
          break;
        }
        case 'ledger': {
          this.gl.set(await this.api.getP<GlSummary>('/reports/general-ledger', range));
          if (id === this.seq) this.exportSpec.set({ path: '/exports/general-ledger', query: range, name: 'mayor-general' });
          break;
        }
        case 'journal': {
          this.journal.set(await this.api.getP<JournalBook>('/reports/journal-book', { ...range, page: this.jPage(), limit: this.pageSize }));
          break;
        }
        case 'account': {
          this.detail.set(await this.api.getP<LedgerDetail>(`/reports/ledger/${v.accountId}/detail`, { ...range, partnerId: v.partnerId, page: this.dPage(), limit: this.pageSize }));
          break;
        }
        case 'subledger': {
          this.subledger.set(await this.api.getP<Subledger>('/reports/subledger', { ...range, accountId: v.accountId }));
          break;
        }
        case 'ratios': {
          this.ratios.set(await this.api.getP<Ratios>('/reports/financial-ratios', range));
          if (id === this.seq) this.exportSpec.set({ path: '/exports/financial-ratios', query: range, name: 'razones-financieras' });
          break;
        }
      }
    } catch (e) {
      if (id === this.seq) this.error.set(errorMessage(e));
    }
    if (id === this.seq) this.loading.set(false);
  }

  // ---- ayudas de presentación ----
  protected ratioText(r: Ratio): string {
    if (r.value === null) return '—';
    switch (r.unit) {
      case 'percent': return pct(r.value, 2);
      case 'days': return `${dec(r.value).toFixed(1)} días`;
      case 'amount': return money(r.value);
      default: return `${dec(r.value).toFixed(2)}x`;
    }
  }
  protected sourceText(m: LedgerMovement): string {
    const s = m.source;
    if (!s) return '';
    if (s.type === 'INVOICE') return `Factura ${s.number ?? ''}`.trim();
    if (s.type === 'PAYMENT') return `${s.kind === 'MADE' ? 'Pago' : 'Cobro'} ${s.number ?? ''}`.trim();
    return SOURCE_DOC[s.type] ?? s.type;
  }
  protected nz(v: string | null | undefined): boolean { return !dec(v).isZero(); }
  protected addDec(a: string, b: string): string { return sumDec([a, b]).toFixed(4); }
  protected subDec(a: string, b: string): string { return dec(a).minus(dec(b)).toFixed(4); }
}
