import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { InventoryMovement } from '../../core/models';
import { UI } from '../../shared/ui';
import { MOVEMENT_TYPE, qty } from './labels';

interface KardexResponse {
  product: { id: string; code: string; name: string; unit: string; tracksInventory: boolean; stockQty: string; avgCost: string; stockValue: string };
  data: InventoryMovement[]; total: number; page: number; limit: number;
}

/** Kárdex (P2): cada entrada y salida del producto, en el orden en que se registró, con la existencia y el valor que quedaron. */
@Component({
  selector: 'app-kardex',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>Kárdex @if (res(); as r) { · {{ r.product.code }} {{ r.product.name }} }</h1>
          <p class="sub">Entradas y salidas en el orden en que se registraron. El costo promedio se calcula en ese orden.</p>
        </div>
        <a class="btn" routerLink="/inventory">Volver a existencias</a>
      </div>
      <app-error-notice [error]="error()" />
      @if (res(); as r) {
        <section class="panel" style="margin-bottom:16px">
          <div class="panel-pad" style="display:flex;gap:32px;flex-wrap:wrap">
            <div><div class="dim">Existencia</div><div style="font-size:22px;font-weight:600">{{ qty(r.product.stockQty) }} {{ r.product.unit }}</div></div>
            <div><div class="dim">Costo promedio</div><div style="font-size:22px;font-weight:600">{{ r.product.avgCost | money }}</div></div>
            <div><div class="dim">Valor</div><div style="font-size:22px;font-weight:600">{{ r.product.stockValue | money }}</div></div>
          </div>
        </section>
      }
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Fecha</th><th>Movimiento</th><th>Documento</th><th class="num">Cantidad</th><th class="num">Costo unitario</th><th class="num">Valor</th><th class="num">Queda</th><th class="num">Valor que queda</th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="8"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (m of res()?.data ?? []; track m.id) {
                <tr>
                  <td>{{ m.date | fdate }}</td>
                  <td>{{ m.type | lbl: MOVEMENT_TYPE }}</td>
                  <td>
                    @if (m.invoice) { <a [routerLink]="['/invoices', m.invoice.id]">{{ m.invoice.number }}</a> }
                    @if (m.adjustment) { <a [routerLink]="['/inventory/adjustments', m.adjustment.id]">{{ m.adjustment.number }}</a> }
                    @if (m.journalEntry) { <div class="dim">Asiento {{ m.journalEntry.number }}</div> }
                  </td>
                  <td class="num" [class.neg]="+m.quantity < 0">{{ qty(m.quantity) }}</td>
                  <td class="num">{{ m.unitCost | money }}</td>
                  <td class="num" [class.neg]="+m.totalCost < 0">{{ m.totalCost | money }}</td>
                  <td class="num">{{ qty(m.qtyAfter) }}</td>
                  <td class="num">{{ m.valueAfter | money }}</td>
                </tr>
              } @empty {
                @if (!loading() && !error()) { <tr><td colspan="8"><p class="dim" style="padding:16px">Este producto todavía no tiene movimientos. Regístralo con una compra o con un ajuste de existencia inicial.</p></td></tr> }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="res()?.total ?? 0" (pageChange)="goTo($event)" />
      </section>
    </div>
  `,
})
export class Kardex {
  private readonly api = inject(Api);
  readonly id = input.required<string>();

  protected readonly MOVEMENT_TYPE = MOVEMENT_TYPE;
  protected readonly qty = qty;
  protected readonly limit = 100;
  protected readonly res = signal<KardexResponse | null>(null);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    effect(() => { const id = this.id(); untracked(() => { this.page.set(1); void this.load(id); }); });
  }

  protected goTo(p: number): void { this.page.set(p); void this.load(this.id()); }

  private async load(id: string): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.res.set(await this.api.getP<KardexResponse>(`/inventory/products/${id}/movements`, { page: this.page(), limit: this.limit })); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
}
