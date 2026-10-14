import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ChartConfiguration } from 'chart.js';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { today, yearStart } from '../../shared/format';
import { RATIO_GROUP } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { ErrorNotice } from '../../shared/ui/error-notice';
import { ExportButtons } from '../../shared/ui/export-buttons';
import { FieldHelp } from '../../shared/ui/field-help';
import { AnalysisLight } from './analysis-light';
import { fmtDiff, fmtLimit, fmtValue } from './analysis-format';
import type { Compare, Health, HealthItem, Threshold, Trend } from './analysis-types';

type Tab = 'health' | 'trend' | 'compare' | 'limits';
interface LimitRow extends Threshold { label: string; unit: HealthItem['unit']; green: string; red: string; on: boolean; dirty: boolean }

const GROUPS: HealthItem['group'][] = ['LIQUIDITY', 'LEVERAGE', 'PROFITABILITY', 'ACTIVITY'];
const TREND_DEFAULT = ['currentRatio', 'debtToAssets', 'netMargin', 'daysSalesOutstanding'];
const COLORS = ['#1f6f8b', '#c0392b', '#2e8b57', '#b7791f'];

/**
 * Semáforo financiero (PLAN-v0.2 §6): salud en verde/amarillo/rojo con una frase para el dueño,
 * tendencia, comparación de períodos y límites (contadora). GET /financial-analysis/*.
 */
@Component({
  selector: 'app-analysis',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, AnalysisLight, ErrorNotice, ExportButtons, FieldHelp, ...UI],
  templateUrl: './analysis.html',
  styles: `
    .grid { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
    .card { padding: 14px 16px; display: flex; flex-direction: column; gap: 6px; min-width: 0; }
    .card .top { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
    .card h3 { margin: 0; font-size: .95rem; }
    .card .val { font-size: 1.4rem; font-weight: 600; font-variant-numeric: tabular-nums; }
    .card .msg { margin: 0; overflow-wrap: anywhere; }
    .group-title { margin: 20px 0 10px; font-size: 1rem; }
    .summary { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 12px; }
    .filters { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-end; margin-bottom: 16px; }
    .keys { display: flex; flex-wrap: wrap; gap: 6px 14px; }
    .num-input { max-width: 120px; }
  `,
})
export class Analysis {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  protected readonly RATIO_GROUP = RATIO_GROUP;
  protected readonly GROUPS = GROUPS;
  protected readonly fmtValue = fmtValue;
  protected readonly fmtLimit = fmtLimit;
  protected readonly fmtDiff = fmtDiff;

  protected readonly tab = signal<Tab>('health');
  protected readonly tabs = computed<{ id: Tab; label: string }[]>(() => [
    { id: 'health', label: 'Semáforo' }, { id: 'trend', label: 'Tendencia' }, { id: 'compare', label: 'Comparar' },
    ...(this.canEdit ? [{ id: 'limits' as Tab, label: 'Límites' }] : []),
  ]);

  // Período (semáforo y comparar): del 1 de enero a hoy
  protected from = yearStart();
  protected to = today();
  protected compareFrom = '';
  protected compareTo = '';

  protected readonly health = signal<Health | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly byGroup = computed(() => {
    const items = this.health()?.items ?? [];
    return GROUPS.map((g) => ({ group: g, items: items.filter((i) => i.group === g) })).filter((x) => x.items.length);
  });

  // ---------- Semáforo ----------
  constructor() { void this.loadHealth(); }

  protected async loadHealth(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.health.set(await this.api.getP<Health>('/financial-analysis/health', { from: this.from, to: this.to })); }
    catch (e) { this.error.set(e); }
    this.loading.set(false);
  }

  // ---------- Tendencia ----------
  protected trendFrom = `${this.to.slice(0, 4)}-01`;
  protected trendTo = this.to.slice(0, 7);
  protected granularity: 'MONTH' | 'QUARTER' | 'YEAR' = 'MONTH';
  protected readonly trendKeys = signal<string[]>(TREND_DEFAULT);
  protected readonly trend = signal<Trend | null>(null);
  protected readonly trendError = signal<unknown>(null);
  protected readonly trendLoading = signal(false);
  protected readonly trendOptions = computed(() => (this.health()?.items ?? []).map((i) => ({ key: i.key, label: i.label.replace(' (anualizado)', '') })));
  protected readonly trendChart = computed<ChartConfiguration | null>(() => {
    const t = this.trend();
    if (!t?.points.length) return null;
    return {
      type: 'line',
      data: {
        labels: t.points.map((p) => p.period),
        // Para dibujar se convierte a número: son razones, no dinero
        datasets: t.keys.map((k, i) => ({
          label: t.labels[k] ?? k, borderColor: COLORS[i % COLORS.length], backgroundColor: COLORS[i % COLORS.length], tension: 0.2,
          data: t.points.map((p) => (p.values[k]?.evaluatedValue === null ? null : Number(p.values[k]?.evaluatedValue))),
          spanGaps: true,
        })),
      },
      options: { plugins: { legend: { position: 'bottom' } } },
    };
  });

  protected toggleKey(key: string, on: boolean): void {
    this.trendKeys.update((ks) => (on ? (ks.length >= 4 ? ks : [...ks, key]) : ks.filter((k) => k !== key)));
  }

  protected async loadTrend(): Promise<void> {
    if (!this.trendKeys().length) { this.trendError.set('Elige al menos un indicador.'); return; }
    this.trendLoading.set(true); this.trendError.set(null);
    try {
      this.trend.set(await this.api.getP<Trend>('/financial-analysis/trend', {
        from: this.trendFrom, to: this.trendTo, granularity: this.granularity, keys: this.trendKeys().join(','),
      }));
    } catch (e) { this.trendError.set(e); }
    this.trendLoading.set(false);
  }

  // ---------- Comparar ----------
  protected readonly compare = signal<Compare | null>(null);
  protected readonly compareError = signal<unknown>(null);
  protected readonly compareLoading = signal(false);
  protected compareQuery() {
    return { from: this.from, to: this.to, ...(this.compareFrom && this.compareTo ? { compareFrom: this.compareFrom, compareTo: this.compareTo } : {}) };
  }

  protected async loadCompare(): Promise<void> {
    if (!!this.compareFrom !== !!this.compareTo) { this.compareError.set('Indica las dos fechas del período anterior, o deja las dos vacías.'); return; }
    this.compareLoading.set(true); this.compareError.set(null);
    try { this.compare.set(await this.api.getP<Compare>('/financial-analysis/compare', this.compareQuery())); }
    catch (e) { this.compareError.set(e); }
    this.compareLoading.set(false);
  }

  // ---------- Límites ----------
  protected readonly limits = signal<LimitRow[]>([]);
  protected readonly limitsError = signal<unknown>(null);
  protected readonly saving = signal(false);
  protected readonly dirtyCount = computed(() => this.limits().filter((l) => l.dirty).length);

  protected async loadLimits(): Promise<void> {
    this.limitsError.set(null);
    try {
      if (!this.health()) await this.loadHealth();
      const rows = await this.api.getP<Threshold[]>('/financial-analysis/thresholds');
      const meta = new Map((this.health()?.items ?? []).map((i) => [i.key, i]));
      this.limits.set(rows.map((t) => ({
        ...t, label: meta.get(t.ratioKey)?.label.replace(' (anualizado)', '') ?? t.ratioKey, unit: meta.get(t.ratioKey)?.unit ?? 'ratio',
        green: t.greenAt ?? '', red: t.redAt ?? '', on: t.enabled, dirty: false,
      })));
    } catch (e) { this.limitsError.set(e); }
  }

  protected edit(i: number, patch: Partial<LimitRow>): void {
    this.limits.update((ls) => ls.map((l, n) => (n === i ? { ...l, ...patch, dirty: true } : l)));
  }

  protected async saveLimits(): Promise<void> {
    const changed = this.limits().filter((l) => l.dirty);
    const missing = changed.filter((l) => l.green === '' || l.red === '');
    if (missing.length) { this.limitsError.set(`Completa el verde y el rojo de: ${missing.map((l) => l.label).join(', ')}`); return; }
    this.saving.set(true); this.limitsError.set(null);
    try {
      await firstValueFrom(this.api.put('/financial-analysis/thresholds', {
        thresholds: changed.map((l) => ({ ratioKey: l.ratioKey, greenAt: Number(l.green), redAt: Number(l.red), enabled: l.on })),
      }));
      this.notify.ok('Límites guardados.');
      await Promise.all([this.loadLimits(), this.loadHealth()]);
    } catch (e) { this.limitsError.set(e); }
    this.saving.set(false);
  }

  protected async restore(l: LimitRow): Promise<void> {
    try {
      await firstValueFrom(this.api.delete(`/financial-analysis/thresholds/${l.ratioKey}`));
      this.notify.ok(`«${l.label}» volvió al valor recomendado.`);
      await Promise.all([this.loadLimits(), this.loadHealth()]);
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

  protected selectTab(t: Tab): void {
    this.tab.set(t);
    if (t === 'limits' && !this.limits().length) void this.loadLimits();
    if (t === 'trend' && !this.trend()) void this.loadTrend();
    if (t === 'compare' && !this.compare()) void this.loadCompare();
  }
}
