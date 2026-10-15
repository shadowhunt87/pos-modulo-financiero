import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { InventoryAdjustment } from '../../core/models';
import { Notify } from '../../core/notify';
import { UI } from '../../shared/ui';
import { ADJUSTMENT_STATUS, qty } from './labels';

/** Detalle de un ajuste de inventario (P2): sus productos, su asiento y la anulación. */
@Component({
  selector: 'app-adjustment-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI],
  template: `
    <div class="page">
      <app-error-notice [error]="error()" />
      @if (adj(); as a) {
        <div class="page-head">
          <div>
            <h1>Ajuste {{ a.number }} <app-status [value]="a.status" [map]="ADJUSTMENT_STATUS" /></h1>
            <p class="sub">{{ a.date | fdate }} · {{ a.reason }}</p>
          </div>
          <div class="btn-row">
            <a class="btn" routerLink="/inventory/adjustments">Volver</a>
            @if (canEdit && a.status === 'POSTED') { <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="voidIt()">Anular ajuste</button> }
          </div>
        </div>
        @if (a.status === 'VOIDED') { <div class="notice neg" role="status">Anulado: {{ a.voidReason }}. Sus movimientos se revirtieron al mismo valor.</div> }
        <section class="panel" style="margin-bottom:16px">
          <div class="panel-pad form-grid">
            <div class="field"><span class="label">Contrapartida</span><div>{{ a.counterAccount.code }} · {{ a.counterAccount.name }}</div></div>
            <div class="field"><span class="label">Asiento</span><div>{{ a.journalEntry?.number ?? 'Sin asiento (valor cero)' }}</div></div>
          </div>
        </section>
        <section class="panel">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Costo unitario</th><th class="num">Valor</th></tr></thead>
              <tbody>
                @for (l of a.lines ?? []; track l.id) {
                  <tr>
                    <td><a [routerLink]="['/inventory/products', l.product.id]">{{ l.product.code }} · {{ l.product.name }}</a></td>
                    <td class="num" [class.neg]="+l.quantity < 0">{{ qty(l.quantity) }} {{ l.product.unit }}</td>
                    <td class="num">{{ l.unitCost | money }}</td>
                    <td class="num" [class.neg]="+l.totalCost < 0">{{ l.totalCost | money }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      } @else if (!error()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
    </div>
  `,
})
export class AdjustmentDetail {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  readonly id = input.required<string>();

  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly ADJUSTMENT_STATUS = ADJUSTMENT_STATUS;
  protected readonly qty = qty;
  protected readonly adj = signal<InventoryAdjustment | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  constructor() {
    effect(() => { const id = this.id(); untracked(() => void this.load(id)); });
  }

  private async load(id: string): Promise<void> {
    this.error.set('');
    try { this.adj.set(await this.api.getP<InventoryAdjustment>(`/inventory/adjustments/${id}`)); }
    catch (e) { this.error.set(errorMessage(e)); }
  }

  protected async voidIt(): Promise<void> {
    const a = this.adj();
    if (!a) return;
    const reason = await this.confirm.reason({
      title: `Anular el ajuste ${a.number}`,
      message: 'Sus movimientos se revierten al mismo valor y se reversa su asiento. Si ya salió mercancía que entró con este ajuste, no se podrá anular.',
      confirmText: 'Anular', danger: true,
    });
    if (!reason) return;
    this.busy.set(true);
    try {
      this.adj.set(await firstValueFrom(this.api.post<InventoryAdjustment>(`/inventory/adjustments/${a.id}/void`, { reason })));
      this.notify.ok('Ajuste anulado.');
      void this.lookups.ensureProducts(true);
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }
}
