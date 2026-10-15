import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../core/api';
import { today } from '../../shared/format';
import { BASE_LABEL, PARAM_STATUS_LOOK } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { ErrorNotice } from '../../shared/ui/error-notice';
import { ExportButtons } from '../../shared/ui/export-buttons';
import { FieldHelp } from '../../shared/ui/field-help';
import { type FiscalParameter, type ParameterVersion, showValue } from './fiscal-types';

/**
 * Valores fiscales (PLAN-v0.3 §5, R9): tasas, umbrales y fechas de la DGII con su vigencia, fuente y estado.
 * Solo lectura: los valores se cambian con el cargador (una revisión nueva), nunca desde la pantalla.
 */
@Component({
  selector: 'app-fiscal-parameters',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ErrorNotice, ExportButtons, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Valores fiscales</h1><p class="sub">Tasas, montos y fechas de la DGII que usa el sistema, con desde cuándo rigen y de dónde salen.</p></div>
        <app-export-buttons path="/fiscal/parameters/export" [query]="{ date }" name="valores-fiscales" />
      </div>

      <div class="notice info" role="status">
        Nada de esto se escribe a mano: cada cambio de la ley se carga como un valor nuevo con su fecha, y lo anterior queda guardado.
        <strong>Por validar</strong> quiere decir que tu contadora todavía no lo confirmó con su nombre.
      </div>

      <form class="toolbar" (ngSubmit)="load()" novalidate>
        <div class="field"><label for="fp-date">Vigentes al <app-field-help text="Cambia la fecha para ver qué valor regía ese día (por ejemplo, antes de un cambio de ley)." /></label>
          <app-date-input id="fp-date" name="date" [(ngModel)]="date" /></div>
        <div class="field wide"><label for="fp-q">Buscar</label><input id="fp-q" name="q" class="input" placeholder="ITBIS, retención, 607…" (input)="q.set($any($event.target).value)" /></div>
        <button type="submit" class="btn btn-primary" [disabled]="loading()">{{ loading() ? 'Cargando…' : 'Ver' }}</button>
      </form>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Valor</th><th class="num">Vigente</th><th>Desde</th><th>Estado</th><th>Fuente</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="6"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (p of shown(); track p.key) {
                <tr>
                  <td><strong>{{ p.label }}</strong><div class="dim mono">{{ p.key }}</div>
                    @if (p.base) { <div class="dim">Se calcula sobre {{ BASE_LABEL[p.base] }}</div> }</td>
                  <td class="num">{{ show(p) }}@if (!p.inForce) { <div class="hint">Todavía no rige</div> }</td>
                  <td class="nowrap">{{ p.validFrom | fdate }}@if (p.nextChange) { <div class="hint">Cambia el {{ p.nextChange | fdate }}</div> }</td>
                  <td><span class="badge" [class]="LOOK[p.status].tone">{{ LOOK[p.status].icon }}&nbsp;{{ LOOK[p.status].text }}</span></td>
                  <td class="dim src">{{ p.source }}@if (p.notes) { <div class="hint">{{ p.notes }}</div> }</td>
                  <td><button type="button" class="btn btn-ghost btn-sm" (click)="openHistory(p)">Historial</button></td>
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr><td colspan="6" class="table-empty">
                    @if (q()) { Ningún valor coincide con «{{ q() }}». } @else { Todavía no se cargó el catálogo fiscal. Pide a quien administra el sistema que lo cargue (ver Manual › Valores fiscales). }
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="!!history()" [title]="'Historial: ' + (historyLabel() || '')" width="720px" (closed)="history.set(null)">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Desde</th><th class="num">Valor</th><th>Revisión</th><th>Estado</th><th>Fuente</th></tr></thead>
          <tbody>
            @for (v of history() ?? []; track v.id) {
              <tr [class.dim]="v.replaced">
                <td class="nowrap">{{ v.validFrom | fdate }}</td>
                <td class="num">{{ show(v) }}</td>
                <td>{{ v.revision }}@if (v.replaced) { <span class="badge">Reemplazada</span> }</td>
                <td><span class="badge" [class]="LOOK[v.status].tone">{{ LOOK[v.status].icon }}&nbsp;{{ LOOK[v.status].text }}</span>
                  @for (val of v.validations; track val.validatedBy) { <div class="hint">Validó {{ val.validatedBy }} el {{ val.validatedAt | fdate }}</div> }</td>
                <td class="dim src">{{ v.source }}</td>
              </tr>
            }
          </tbody>
        </table>
      </div>
      <ng-container modal-actions><button type="button" class="btn" (click)="history.set(null)">Cerrar</button></ng-container>
    </app-modal>
  `,
  styles: `.src { max-width: 340px; overflow-wrap: anywhere; }`,
})
export class FiscalParameters {
  private readonly api = inject(Api);
  protected readonly LOOK = PARAM_STATUS_LOOK;
  protected readonly BASE_LABEL = BASE_LABEL;
  protected readonly show = showValue;

  protected date = today();
  protected readonly q = signal('');
  protected readonly rows = signal<FiscalParameter[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  protected readonly shown = computed(() => {
    const q = this.q().trim().toLowerCase();
    return q ? this.rows().filter((p) => `${p.key} ${p.label} ${p.source}`.toLowerCase().includes(q)) : this.rows();
  });
  protected readonly history = signal<ParameterVersion[] | null>(null);
  protected readonly historyLabel = signal('');

  constructor() { void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.rows.set(await this.api.getP<FiscalParameter[]>('/fiscal/parameters', { date: this.date })); }
    catch (e) { this.error.set(e); }
    this.loading.set(false);
  }

  protected async openHistory(p: FiscalParameter): Promise<void> {
    this.historyLabel.set(p.label);
    try { this.history.set(await this.api.getP<ParameterVersion[]>(`/fiscal/parameters/${p.key}`)); }
    catch (e) { this.error.set(e); }
  }
}
