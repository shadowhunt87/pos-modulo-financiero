import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Api } from '../../../../core/api';
import { errorMessage } from '../../../../core/errors';
import { monthRange } from '../../../../shared/format';
import { UI } from '../../../../shared/ui';

interface Group { key: string; name?: string; count: number; total: string; tax: string; discounts: string }
interface Report { totals: { count: number; total: string; returns: string }; byDay: Group[]; byTerminal: Group[]; byCashier: Group[]; topProducts: { productId: string; description: string; quantity: string; amount: string }[] }

/** Ventas del POS por día, caja y cajero, y los productos más vendidos. */
@Component({
  selector: 'app-pos-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Ventas del POS</h1><p class="sub">Lo vendido en caja en el período. Las facturas y su contabilidad están en «Facturas» y en los reportes del sistema.</p></div></div>
      <div class="toolbar">
        <div class="field"><label for="r-from">Desde</label><app-date-input id="r-from" name="from" [(ngModel)]="from" /></div>
        <div class="field"><label for="r-to">Hasta</label><app-date-input id="r-to" name="to" [(ngModel)]="to" /></div>
        <button type="button" class="btn btn-primary" style="align-self:end" (click)="load()">Ver</button>
      </div>
      <app-error-notice [error]="error()" />
      @if (data(); as d) {
        <div class="figures" style="margin-bottom:16px">
          <div class="figure"><div class="f-label">Ventas</div><div class="f-value">{{ d.totals.count }}</div></div>
          <div class="figure"><div class="f-label">Total vendido</div><div class="f-value"><span class="cur">RD$</span>{{ d.totals.total | money }}</div></div>
          <div class="figure"><div class="f-label">Devoluciones</div><div class="f-value"><span class="cur">RD$</span>{{ d.totals.returns | money }}</div></div>
        </div>
        <div class="cols-2">
          <section class="panel"><div class="panel-head"><h2>Por día</h2></div>
            <div class="table-wrap"><table class="table"><thead><tr><th>Día</th><th class="num">Ventas</th><th class="num">Total</th></tr></thead>
              <tbody>@for (g of d.byDay; track g.key) { <tr><td>{{ g.key | fdate }}</td><td class="num">{{ g.count }}</td><td class="num">{{ g.total | money }}</td></tr> }
                @empty { <tr><td colspan="3" class="table-empty">Sin ventas.</td></tr> }</tbody></table></div></section>
          <section class="panel"><div class="panel-head"><h2>Productos más vendidos</h2></div>
            <div class="table-wrap"><table class="table"><thead><tr><th>Producto</th><th class="num">Cantidad</th><th class="num">Vendido (sin ITBIS)</th></tr></thead>
              <tbody>@for (p of d.topProducts; track p.productId) { <tr><td>{{ p.description }}</td><td class="num">{{ +p.quantity }}</td><td class="num">{{ p.amount | money }}</td></tr> }
                @empty { <tr><td colspan="3" class="table-empty">Sin ventas.</td></tr> }</tbody></table></div></section>
          <section class="panel"><div class="panel-head"><h2>Por caja</h2></div>
            <div class="table-wrap"><table class="table"><tbody>@for (g of d.byTerminal; track g.key) { <tr><td>{{ g.name }}</td><td class="num">{{ g.count }}</td><td class="num">{{ g.total | money }}</td></tr> }</tbody></table></div></section>
          <section class="panel"><div class="panel-head"><h2>Por cajero</h2></div>
            <div class="table-wrap"><table class="table"><tbody>@for (g of d.byCashier; track g.key) { <tr><td>{{ g.name }}</td><td class="num">{{ g.count }}</td><td class="num">{{ g.total | money }}</td></tr> }</tbody></table></div></section>
        </div>
      }
    </div>
  `,
})
export class PosReportsPage {
  private readonly api = inject(Api);
  protected from = monthRange().from;
  protected to = monthRange().to;
  protected readonly data = signal<Report | null>(null);
  protected readonly error = signal('');
  constructor() { void this.load(); }
  protected async load(): Promise<void> {
    this.error.set('');
    try { this.data.set(await this.api.getP<Report>('/pos/reports/sales', { from: this.from, to: this.to })); } catch (e) { this.error.set(errorMessage(e)); }
  }
}
