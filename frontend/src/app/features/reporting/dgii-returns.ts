import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { UI } from '../../shared/ui';
import { FieldHelp } from '../../shared/ui/field-help';

interface Check {
  key: string; title: string; ok: boolean; detail: string; route: string; expected?: string; ledger?: string; difference?: string;
  entries?: { id: string; number: string | null; date: string; description: string; amount: string }[]; items?: string[];
}
interface Review {
  period: string; warnings: string[]; ready: boolean; assumptions: string[]; checks: Check[];
  formats: Record<string, { count: number; errors: number; warnings: number; canExport: boolean; notRequired?: boolean }>;
}

const prevMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };

/** Revisión del mes antes de declarar (PLAN-v0.3 §9.3, N4): formatos, cuadres contra el mayor y huecos de NCF. */
@Component({
  selector: 'app-dgii-returns',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Revisión del mes</h1><p class="sub">Antes de presentar a la DGII: ¿los formatos están bien y cuadran con tu contabilidad?</p></div>
        <a class="btn" routerLink="/dgii">Ir a 606 · 607 · 608</a>
      </div>
      <form class="toolbar" (ngSubmit)="load()" novalidate>
        <div class="field"><label for="rv-p">Mes</label><input id="rv-p" name="p" class="input" type="month" [value]="period()" (input)="period.set($any($event.target).value)" /></div>
        <button type="submit" class="btn btn-primary" [disabled]="loading()">{{ loading() ? 'Revisando…' : 'Revisar' }}</button>
      </form>
      <app-error-notice [error]="error()" />
      @if (loading()) { <div class="loading"><span class="spinner"></span> Revisando…</div> }
      @else if (r(); as v) {
        <div class="notice" [class.pos]="v.ready" [class.warn]="!v.ready" role="status">
          {{ v.ready ? '✓ Listo para declarar: todo cuadra y los formatos no tienen errores.' : '! Hay puntos por revisar antes de declarar.' }}
        </div>
        @for (w of v.warnings; track $index) { <div class="notice warn" role="status">{{ w }}</div> }

        <section class="figures section">
          @for (f of ['606', '607', '608']; track f) {
            <div class="figure">
              <div class="f-label">Formato {{ f }}</div>
              <div class="f-value">{{ v.formats[f].count }}</div>
              <div class="f-note">
                @if (v.formats[f].notRequired) { No tienes que enviarlo este mes · }
                @if (v.formats[f].errors) { <span class="neg">✕ {{ v.formats[f].errors }} errores</span> } @else { <span class="pos">✓ sin errores</span> }
                @if (v.formats[f].warnings) { · {{ v.formats[f].warnings }} avisos }
              </div>
            </div>
          }
        </section>

        <section class="panel section">
          <ul class="checks">
            @for (c of v.checks; track c.key) {
              <li>
                <span class="badge" [class.pos]="c.ok" [class.warn]="!c.ok">{{ c.ok ? '✓ Cuadra' : '! Revisar' }}</span>
                <div>
                  <strong>{{ c.title }}</strong>
                  @if (c.expected !== undefined) {
                    <div class="hint">Según documentos {{ c.expected | money }} · en el mayor {{ c.ledger | money }} · diferencia {{ c.difference | money }}</div>
                  }
                  <div>{{ c.detail }}</div>
                  @if (c.entries?.length) {
                    <ul class="ent">@for (e of c.entries; track e.id) { <li><a [routerLink]="['/entries', e.id]">{{ e.number ?? 'Asiento' }}</a> · {{ e.date | fdate }} · {{ e.description }} · {{ e.amount | money }}</li> }</ul>
                  }
                  @if (c.items?.length && !c.ok) { <div class="hint mono">{{ c.items!.slice(0, 10).join(', ') }}</div> }
                </div>
                @if (!c.ok) { <a class="btn btn-sm" [routerLink]="c.route">Corregir</a> }
              </li>
            }
          </ul>
        </section>
        @for (a of v.assumptions; track $index) { <p class="hint">{{ a }}</p> }
      }
    </div>
  `,
  styles: `.checks { list-style: none; margin: 0; padding: 0; } .checks > li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--line); align-items: start; } .ent { margin: 6px 0 0; padding-left: 18px; } @media (max-width: 480px) { .checks > li { grid-template-columns: 1fr; } }`,
})
export class DgiiReturns {
  private readonly api = inject(Api);
  protected readonly period = signal(prevMonth());
  protected readonly r = signal<Review | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<unknown>(null);

  constructor() { void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.r.set(await this.api.getP<Review>('/dgii-returns/review', { period: this.period() })); } catch (e) { this.error.set(e); }
    this.loading.set(false);
  }
}
