import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { ErrorNotice } from '../../shared/ui/error-notice';
import { AnalysisLight } from '../reporting/analysis-light';
import { fmtValue } from '../reporting/analysis-format';
import type { Kpis } from '../reporting/analysis-types';

/**
 * Franja del Panel con los 6 indicadores para el dueño (PLAN-v0.2 §6.3). GET /financial-analysis/kpis.
 * Carga aparte para no retrasar las cifras del Panel, con su propio error.
 */
@Component({
  selector: 'app-kpi-strip',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ErrorNotice, AnalysisLight],
  template: `
    <section class="panel section" aria-labelledby="kpi-title">
      <div class="panel-head"><h2 id="kpi-title">Salud de la empresa</h2><a routerLink="/analysis">Ver semáforo</a></div>
      <div class="panel-pad">
        <app-error-notice [error]="error()" />
        @if (loading()) { <div class="loading"><span class="spinner"></span> Calculando indicadores…</div> }
        @else if (data(); as d) {
          <div class="kpis">
            @for (k of d.items; track k.key) {
              <div class="kpi">
                <div class="k-top"><span class="k-title">{{ k.title }}</span><app-analysis-light [color]="k.color" /></div>
                <div class="k-val">{{ fmt(k.current, k.unit) }}</div>
                <div class="k-note" [title]="k.technical">{{ k.message }}</div>
                @if (k.improved !== null) {
                  <div class="k-note" [class.pos]="k.improved" [class.neg]="!k.improved">{{ k.improved ? '▲ Mejor' : '▼ Peor' }} que el período anterior ({{ fmt(k.previous, k.unit) }})</div>
                }
              </div>
            } @empty {
              <p class="hint">Aún no hay movimientos para calcular los indicadores.</p>
            }
          </div>
        }
      </div>
    </section>
  `,
  styles: `
    .kpis { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .kpi { display: flex; flex-direction: column; gap: 4px; min-width: 0; }
    .k-top { display: flex; justify-content: space-between; gap: 6px; align-items: flex-start; }
    .k-title { font-size: 13px; color: var(--text-dim); }
    .k-val { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .k-note { font-size: 12px; color: var(--text-faint); overflow-wrap: anywhere; }
  `,
})
export class KpiStrip {
  private readonly api = inject(Api);
  protected readonly data = signal<Kpis | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  protected readonly fmt = fmtValue;

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    try { this.data.set(await this.api.getP<Kpis>('/financial-analysis/kpis')); }
    catch (e) { this.error.set(e); }
    this.loading.set(false);
  }
}
