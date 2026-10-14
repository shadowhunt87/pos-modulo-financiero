import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
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
        @for (a of alerts(); track a.code + a.text) {
          <div class="notice" [class]="a.level" role="status">
            <span aria-hidden="true"><b>{{ ICON[a.level] }}</b>&nbsp;</span>{{ a.text }}
            @if (a.link) { <a [routerLink]="a.link">{{ a.linkText || 'Ver' }} →</a> }
          </div>
        }
      </div>
    }
  `,
  styles: `.alerts { display: flex; flex-direction: column; gap: 8px; margin-bottom: 16px; } .notice a { margin-left: 6px; font-weight: 600; }`,
})
export class FiscalAlerts {
  private readonly api = inject(Api);
  protected readonly ICON = ICON;
  protected readonly alerts = signal<FiscalAlert[]>([]);

  constructor() {
    void this.api.getP<FiscalAlert[]>('/fiscal/alerts').then((a) => this.alerts.set(a)).catch(() => undefined);
  }
}
