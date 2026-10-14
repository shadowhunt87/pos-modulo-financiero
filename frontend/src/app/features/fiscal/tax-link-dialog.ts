import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Notify } from '../../core/notify';
import { ErrorNotice } from '../../shared/ui/error-notice';
import { UI } from '../../shared/ui';
import { BASE_LABEL, PARAM_STATUS_LOOK } from '../../shared/labels';
import type { TaxLinkSuggestion } from './fiscal-types';

/**
 * Enlazar un impuesto con un valor oficial (PLAN-v0.3 §5.3-5.4). Muestra la sugerencia, pero la persona confirma (P4).
 * Enlazado, la tasa cambia sola cuando cambia la ley; sin enlazar, «no se actualiza solo».
 */
@Component({
  selector: 'app-tax-link-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ErrorNotice, ...UI],
  template: `
    <app-modal [open]="open()" [title]="'Valor oficial de «' + (s()?.name ?? '') + '»'" width="620px" (closed)="closed.emit()">
      @if (s(); as x) {
        <p class="dim">Al enlazarlo, la tasa (y la base de la retención) sale del valor oficial vigente en la fecha de cada factura: cuando la DGII la cambie, se actualiza sola.</p>
        @if (x.status === 'AMBIGUO') { <div class="notice warn" role="status">Hay varios valores con la misma tasa. Elige el que corresponde a este impuesto.</div> }
        @if (x.status === 'SIN_COINCIDENCIA') { <div class="notice info" role="status">Ningún valor oficial tiene la tasa de este impuesto. Revisa con tu contadora antes de enlazarlo.</div> }
        @if (x.options.length) {
          <fieldset class="opts">
            <legend class="sr-only">Valores oficiales</legend>
            @for (o of x.options; track o.key) {
              <label class="opt">
                <input type="radio" name="tl-key" [value]="o.key" [checked]="choice() === o.key" (change)="choice.set(o.key)" />
                <span><strong>{{ o.label }}</strong> · {{ o.value }} %@if (o.base) { sobre {{ BASE_LABEL[o.base] }} }
                  <span class="badge" [class]="PARAM_STATUS_LOOK[o.status].tone">{{ PARAM_STATUS_LOOK[o.status].icon }}&nbsp;{{ PARAM_STATUS_LOOK[o.status].text }}</span>
                  @if (o.key === x.suggestedKey) { <span class="badge info">Sugerido</span> }</span>
              </label>
            }
          </fieldset>
        } @else {
          <p>No hay valores oficiales para este tipo de impuesto.</p>
        }
        <app-error-notice [error]="error()" />
      }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
        @if (s()?.linkedKey) { <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="unlink()">Desenlazar</button> }
        <button type="button" class="btn btn-primary" [disabled]="busy() || !choice()" (click)="link()">{{ busy() ? 'Guardando…' : 'Enlazar' }}</button>
      </ng-container>
    </app-modal>
  `,
  styles: `
    .opts { border: 0; padding: 0; margin: 12px 0; display: flex; flex-direction: column; gap: 8px; }
    .opt { display: flex; gap: 8px; align-items: flex-start; cursor: pointer; }
    .opt span { overflow-wrap: anywhere; }
  `,
})
export class TaxLinkDialog {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  readonly open = input(false);
  readonly s = input<TaxLinkSuggestion | null>(null);
  readonly closed = output<void>();
  readonly changed = output<void>();

  protected readonly BASE_LABEL = BASE_LABEL;
  protected readonly PARAM_STATUS_LOOK = PARAM_STATUS_LOOK;
  protected readonly choice = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<unknown>(null);

  constructor() {
    effect(() => { const x = this.s(); this.choice.set(x?.linkedKey ?? x?.suggestedKey ?? ''); this.error.set(null); });
  }

  protected async link(): Promise<void> {
    const x = this.s();
    if (!x || !this.choice()) return;
    this.busy.set(true); this.error.set(null);
    try {
      await firstValueFrom(this.api.put(`/fiscal/tax-links/${x.taxRateId}`, { parameterKey: this.choice() }));
      this.notify.ok(`«${x.name}» quedó enlazado al valor oficial.`);
      this.changed.emit();
    } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }

  protected async unlink(): Promise<void> {
    const x = this.s();
    if (!x) return;
    this.busy.set(true); this.error.set(null);
    try {
      await firstValueFrom(this.api.delete(`/fiscal/tax-links/${x.taxRateId}`));
      this.notify.ok(`«${x.name}» ya no está enlazado: su tasa no se actualizará sola.`);
      this.changed.emit();
    } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }
}
