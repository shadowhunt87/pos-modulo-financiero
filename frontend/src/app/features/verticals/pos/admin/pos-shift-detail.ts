import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../../../core/api';
import { errorMessage } from '../../../../core/errors';
import { UI } from '../../../../shared/ui';
import { METHOD_LABEL, type PayMethod, type PosSale, type PosShift } from '../types';

/** Turno de caja: reporte X (abierto) o Z (cerrado), movimientos de efectivo y sus ventas. */
@Component({
  selector: 'app-pos-shift-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI],
  template: `
    <div class="page">
      <app-error-notice [error]="error()" />
      @if (shift(); as s) {
        <div class="page-head">
          <div><h1>Turno {{ s.number }} <app-status [value]="s.status === 'OPEN' ? 'OPEN' : 'CLOSED_OK'" [map]="STATUS" /></h1>
            <p class="sub">{{ s.terminal.name }} · abrió {{ s.openedBy }} el {{ s.openedAt | fdatetime }}@if (s.closedAt) { · cerró {{ s.closedBy }} el {{ s.closedAt | fdatetime }} }</p></div>
          <a class="btn" routerLink="/pos/turnos">Volver</a>
        </div>
        <div class="figures" style="margin-bottom:16px">
          <div class="figure"><div class="f-label">Ventas ({{ s.totals.salesCount }})</div><div class="f-value"><span class="cur">RD$</span>{{ s.totals.grossSales | money }}</div><div class="f-note">ITBIS {{ s.totals.taxes | money }}</div></div>
          <div class="figure"><div class="f-label">Fondo inicial</div><div class="f-value"><span class="cur">RD$</span>{{ s.openingCash | money }}</div></div>
          <div class="figure"><div class="f-label">Efectivo esperado</div><div class="f-value"><span class="cur">RD$</span>{{ (s.expectedCash ?? s.totals.expectedCash) | money }}</div></div>
          @if (s.countedCash !== null) {
            <div class="figure"><div class="f-label">Contado</div><div class="f-value"><span class="cur">RD$</span>{{ s.countedCash | money }}</div>
              <div class="f-note" [class.neg]="+(s.difference ?? 0) < 0" [class.pos]="+(s.difference ?? 0) > 0">{{ +(s.difference ?? 0) === 0 ? 'Cuadra' : (+(s.difference ?? 0) > 0 ? 'Sobrante ' : 'Faltante ') + (s.difference | money) }}</div></div>
          }
        </div>
        <div class="cols-2">
          <section class="panel">
            <div class="panel-head"><h2>Por forma de pago</h2></div>
            <div class="panel-pad"><dl class="kv">
              @for (m of methods; track m) { <dt>{{ LABEL[m] }}</dt><dd class="num">{{ s.totals.salesByMethod[m] | money }}@if (+s.totals.refundsByMethod[m] > 0) { <span class="dim"> (devuelto {{ s.totals.refundsByMethod[m] | money }})</span> }</dd> }
              <dt>A crédito</dt><dd class="num">{{ s.totals.creditSales | money }}</dd>
              <dt>Descuentos y promociones</dt><dd class="num">{{ s.totals.discounts | money }}</dd>
              <dt>Anuladas</dt><dd>{{ s.totals.voidedCount }}</dd>
              <dt>Aperturas de gaveta sin venta</dt><dd>{{ s.totals.drawerOpens }}</dd>
            </dl></div>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Entradas y salidas de efectivo</h2></div>
            <div class="table-wrap"><table class="table">
              <tbody>
                @for (m of s.movements; track m.id) { <tr><td>{{ m.createdAt | fdatetime }}</td><td>{{ m.type === 'IN' ? 'Entrada' : 'Salida' }} · {{ m.reason }}</td><td class="num" [class.neg]="m.type === 'OUT'">{{ m.type === 'OUT' ? '−' : '' }}{{ m.amount | money }}</td></tr> }
                @empty { <tr><td class="table-empty">Sin movimientos.</td></tr> }
              </tbody>
            </table></div>
          </section>
        </div>
        <section class="panel section">
          <div class="panel-head"><h2>Ventas del turno</h2></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Ticket</th><th>Hora</th><th>Cliente</th><th>NCF</th><th>Factura</th><th class="num">Total</th><th>Estado</th></tr></thead>
            <tbody>
              @for (v of sales(); track v.id) {
                <tr><td class="mono">{{ v.number }}</td><td>{{ v.createdAt | fdatetime }}</td><td>{{ v.partner?.name }}</td><td class="mono">{{ v.ncf }}</td>
                  <td><a [routerLink]="['/invoices', v.invoiceId]">{{ v.invoiceNumber }}</a></td><td class="num">{{ v.total | money }}</td>
                  <td><app-status [value]="v.status === 'VOIDED' ? 'VOIDED' : 'POSTED'" [map]="SALE" /></td></tr>
              } @empty { <tr><td colspan="7" class="table-empty">Sin ventas.</td></tr> }
            </tbody>
          </table></div>
        </section>
      } @else if (!error()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
    </div>
  `,
})
export class PosShiftDetail {
  private readonly api = inject(Api);
  readonly id = input.required<string>();
  protected readonly STATUS: Record<string, string> = { OPEN: 'Abierto', CLOSED_OK: 'Cerrado' };
  protected readonly SALE: Record<string, string> = { POSTED: 'Cobrada', VOIDED: 'Anulada' };
  protected readonly LABEL = METHOD_LABEL;
  protected readonly methods: PayMethod[] = ['CASH', 'CARD', 'TRANSFER'];
  protected readonly shift = signal<PosShift | null>(null);
  protected readonly sales = signal<PosSale[]>([]);
  protected readonly error = signal('');
  constructor() { effect(() => { const id = this.id(); untracked(() => void this.load(id)); }); }
  private async load(id: string): Promise<void> {
    try {
      const [s, v] = await Promise.all([this.api.getP<PosShift>(`/pos/shifts/${id}`), this.api.getP<{ data: PosSale[] }>('/pos/sales', { shiftId: id, limit: 100 })]);
      this.shift.set(s); this.sales.set(v.data);
    } catch (e) { this.error.set(errorMessage(e)); }
  }
}
