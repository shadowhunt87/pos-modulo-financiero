import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import type { FiscalAlert } from '../fiscal/fiscal-types';

const ICON: Record<FiscalAlert['level'], string> = { info: 'i', warn: '!', neg: '✕' };

/**
 * Avisos fiscales permanentes del Panel (PLAN-v0.3 §5.3, §6, §8): ficha incompleta, impuestos sin enlazar,
 * plazos de la DGII y comprobantes por agotarse o vencer. Carga aparte: si falla, el Panel sigue igual.
 */
@Component({
  selector: 'app-fiscal-alerts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @for (g of groups(); track g.key) {
      @if (g.items.length > 1) {
        <div class="row" [class]="g.level" role="status">
          <span class="ic" aria-hidden="true">{{ ICON[g.level] }}</span>
          <div class="body">
            <div class="line">
              <span><strong>{{ g.title }}</strong>{{ ' ' }}<span class="dim">{{ g.detail }}</span></span>
              <span class="acts">
                <button type="button" class="linkbtn" [attr.aria-expanded]="open() === g.key" (click)="open.set(open() === g.key ? null : g.key)">{{ open() === g.key ? 'Ocultar' : 'Ver cuáles' }}</button>
                <a [routerLink]="g.link">{{ g.linkText }} →</a>
              </span>
            </div>
            @if (open() === g.key) { <ul class="list">@for (a of g.items; track a.code) { <li>{{ a.text }}</li> }</ul> }
          </div>
        </div>
      } @else {
        @for (a of g.items; track a.code + a.text) {
          <div class="row" [class]="a.level" role="status">
            <span class="ic" aria-hidden="true">{{ ICON[a.level] }}</span>
            <div class="body"><div class="line"><span>{{ a.text }}</span>@if (a.link) { <span class="acts"><a [routerLink]="a.link">{{ a.linkText || 'Ver' }} →</a></span> }</div></div>
          </div>
        }
      }
    }
  `,
  styles: `
    :host { display: contents; }
    .row { display: flex; gap: 12px; align-items: flex-start; padding: 12px 22px; border-bottom: 1px solid var(--line); font-size: 13.5px; }
    .ic { flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 700; margin-top: 1px; }
    .neg .ic { background: var(--neg-soft); color: var(--neg); } .warn .ic { background: var(--warn-soft); color: var(--warn); } .info .ic { background: var(--info-soft); color: var(--info); }
    .body { flex: 1; min-width: 0; }
    .line { display: flex; justify-content: space-between; align-items: baseline; gap: 6px 16px; flex-wrap: wrap; }
    .acts { display: inline-flex; gap: 14px; align-items: baseline; white-space: nowrap; font-size: 13px; }
    .acts a, .acts .linkbtn { font-weight: 500; }
    .list { margin: 8px 0 2px; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; font-size: 13px; color: var(--text-dim); }
  `,
})
export class FiscalAlerts {
  private readonly api = inject(Api);
  protected readonly ICON = ICON;
  protected readonly alerts = signal<FiscalAlert[]>([]);
  /** Cuántos avisos hay (el Panel muestra «Todo al día» si no hay ninguno). */
  readonly count = computed(() => this.alerts().length);

  /** Bloque de la DGII: varios vencidos (o por vencer) se juntan en un solo aviso para no llenar el Panel. */
  protected readonly open = signal<string | null>(null);
  protected readonly groups = computed(() => {
    const all = this.alerts();
    const over = all.filter((a) => a.code.startsWith('OVERDUE_'));
    const due = all.filter((a) => a.code.startsWith('DUE_'));
    const rest = all.filter((a) => !a.code.startsWith('OVERDUE_') && !a.code.startsWith('DUE_'));
    const out: { key: string; level: FiscalAlert['level']; title: string; detail: string; link: string; linkText: string; items: FiscalAlert[] }[] = [];
    if (over.length) out.push({ key: 'over', level: 'neg', items: over, link: '/fiscal-calendar', linkText: 'Ver calendario',
      title: `${over.length} declaraciones vencidas sin marcar.`, detail: 'Si ya las presentaste, márcalas en el calendario fiscal.' });
    if (due.length) out.push({ key: 'due', level: 'warn', items: due, link: '/fiscal-calendar', linkText: 'Ver calendario',
      title: `${due.length} declaraciones vencen esta semana.`, detail: 'Prepáralas desde el calendario fiscal.' });
    for (const a of rest) out.push({ key: a.code, level: a.level, title: '', detail: '', link: a.link ?? '', linkText: a.linkText ?? '', items: [a] });
    return out;
  });

  constructor() {
    void this.api.getP<FiscalAlert[]>('/fiscal/alerts').then((a) => this.alerts.set(a)).catch(() => undefined);
  }
}
