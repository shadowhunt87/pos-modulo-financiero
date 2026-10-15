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
    @if (alerts().length) {
      <div class="alerts" role="region" aria-label="Avisos fiscales">
        @for (g of groups(); track g.key) {
          @if (g.items.length > 1) {
            <div class="notice" [class]="g.level" role="status">
              <span class="ic" aria-hidden="true">{{ ICON[g.level] }}</span>
              <div class="body">
                <div class="row">
                  <span><strong>{{ g.title }}</strong> {{ g.detail }}</span>
                  <span class="acts">
                    <button type="button" class="linkish" [attr.aria-expanded]="open() === g.key" (click)="open.set(open() === g.key ? null : g.key)">{{ open() === g.key ? 'Ocultar' : 'Ver cuáles' }}</button>
                    <a [routerLink]="g.link">{{ g.linkText }} →</a>
                  </span>
                </div>
                @if (open() === g.key) { <ul class="list">@for (a of g.items; track a.code) { <li>{{ a.text }}</li> }</ul> }
              </div>
            </div>
          } @else {
            @for (a of g.items; track a.code + a.text) {
              <div class="notice" [class]="a.level" role="status">
                <span class="ic" aria-hidden="true">{{ ICON[a.level] }}</span>
                <div class="body"><div class="row"><span>{{ a.text }}</span>@if (a.link) { <a [routerLink]="a.link">{{ a.linkText || 'Ver' }} →</a> }</div></div>
              </div>
            }
          }
        }
      </div>
    }
  `,
  styles: `
    .alerts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 18px; }
    .notice { align-items: flex-start; }
    .ic { flex: none; width: 20px; height: 20px; border-radius: 50%; display: grid; place-items: center; font-size: 11px; font-weight: 800; border: 1.5px solid currentColor; margin-top: 1px; }
    .body { flex: 1; min-width: 0; }
    .row { display: flex; justify-content: space-between; align-items: baseline; gap: 6px 16px; flex-wrap: wrap; }
    .acts { display: inline-flex; gap: 14px; align-items: baseline; }
    .notice a, .linkish { font-weight: 600; white-space: nowrap; }
    .linkish { background: none; border: 0; padding: 0; cursor: pointer; color: inherit; text-decoration: underline; text-underline-offset: 3px; }
    .list { margin: 8px 0 2px; padding-left: 18px; display: flex; flex-direction: column; gap: 3px; font-size: 13px; }
  `,
})
export class FiscalAlerts {
  private readonly api = inject(Api);
  protected readonly ICON = ICON;
  protected readonly alerts = signal<FiscalAlert[]>([]);

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
