import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Decimal from 'decimal.js';
import { errorMessage } from '../../../../core/errors';
import { UI } from '../../../../shared/ui';
import { PosApi } from '../pos-api';
import { METHOD_LABEL, VOID_CODES, type PayMethod, type PosSale } from '../types';

export interface VoidRequest { sale: PosSale; reason: string; reasonCode: string }
export interface ReturnRequest { sale: PosSale; lines: { saleLineId: string; quantity: number }[]; refundMethod: PayMethod; reason: string }

/** Ventas del turno (o buscar un ticket viejo para devolver): ver e imprimir el ticket, anular o devolver. */
@Component({
  selector: 'app-pos-sales',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...UI],
  template: `
    <app-modal [open]="open()" [title]="selected() ? 'Ticket ' + selected()!.number : 'Ventas'" width="760px" (closed)="closed.emit()">
      @if (!selected()) {
        <div class="toolbar">
          <div class="field wide"><label for="s-q">Buscar ticket o NCF (también de otros turnos)</label>
            <input id="s-q" class="input" [(ngModel)]="q" (keydown.enter)="load()" placeholder="TK-000012 o B0200000045" /></div>
          <button type="button" class="btn" style="align-self:end" (click)="load()">Buscar</button>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Ticket</th><th>Hora</th><th>NCF</th><th class="num">Total</th><th>Estado</th></tr></thead>
          <tbody>
            @for (s of rows(); track s.id) {
              <tr class="clickable" (click)="pick(s.id)"><td class="mono">{{ s.number }}</td><td>{{ s.createdAt | fdatetime }}</td><td class="mono">{{ s.ncf }}</td>
                <td class="num">{{ s.total | money }}</td><td><app-status [value]="s.status === 'VOIDED' ? 'VOIDED' : 'POSTED'" [map]="STATUS" /></td></tr>
            } @empty { <tr><td colspan="5" class="table-empty">{{ loading() ? 'Cargando…' : 'No hay ventas.' }}</td></tr> }
          </tbody>
        </table></div>
      } @else {
        @let s = selected()!;
        <div class="head"><div><strong>{{ s.partner?.name }}</strong><div class="dim">NCF {{ s.ncf }} · Factura {{ s.invoiceNumber }} · {{ s.createdAt | fdatetime }}</div></div>
          <strong class="tot"><span class="cur">RD$</span>{{ s.total | money }}</strong></div>
        @if (s.status === 'VOIDED') { <div class="notice neg">Anulada: {{ s.voidReason }}</div> }
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Producto</th><th class="num">Cant.</th><th class="num">Devueltas</th>@if (mode() === 'return') { <th class="num">Devolver</th> }<th class="num">Importe</th></tr></thead>
          <tbody>
            @for (l of s.lines; track l.id) {
              <tr><td>{{ l.description }}</td><td class="num">{{ +l.quantity }}</td><td class="num">{{ +l.returnedQty || '' }}</td>
                @if (mode() === 'return') { <td class="num"><input class="input num qty" type="number" min="0" [max]="+l.quantity - +l.returnedQty" step="1" [(ngModel)]="ret[l.id]" [attr.aria-label]="'Devolver de ' + l.description" /></td> }
                <td class="num">{{ net(l) | money }}</td></tr>
            }
          </tbody>
        </table></div>
        @if (s.returns.length) { <p class="dim" style="margin-top:8px">Devoluciones: @for (r of s.returns; track r.id) { {{ r.number }} ({{ r.total | money }}, {{ LABEL[r.method] }}) } </p> }

        @if (mode() === 'void') {
          <div class="form-grid" style="margin-top:14px">
            <div class="field span-2"><label for="v-code">Motivo DGII</label>
              <select id="v-code" class="select" [(ngModel)]="code">@for (c of codes; track c[0]) { <option [value]="c[0]">{{ c[0] }} · {{ c[1] }}</option> }</select></div>
            <div class="field span-all"><label for="v-why">Explica qué pasó</label><input id="v-why" class="input" [(ngModel)]="reason" /></div>
          </div>
        }
        @if (mode() === 'return') {
          <div class="form-grid" style="margin-top:14px">
            <div class="field"><label for="r-m">Devolver el dinero en</label>
              <select id="r-m" class="select" [(ngModel)]="refund">@for (m of methods; track m) { <option [value]="m">{{ LABEL[m] }}</option> }</select></div>
            <div class="field span-2"><label for="r-why">Motivo</label><input id="r-why" class="input" [(ngModel)]="reason" placeholder="No le sirvió, vino dañado…" /></div>
          </div>
        }
        @if (error()) { <div class="notice neg" role="alert" style="margin-top:12px">{{ error() }}</div> }
      }
      <ng-container modal-actions>
        @if (selected(); as s) {
          <button type="button" class="btn" (click)="mode() === 'view' ? selected.set(null) : mode.set('view')">Volver</button>
          @if (mode() === 'view') {
            <button type="button" class="btn" (click)="printIt.emit(s.id)">Imprimir ticket</button>
            @if (s.status === 'COMPLETED') {
              @if (s.shiftId === shiftId()) { <button type="button" class="btn btn-danger" (click)="startVoid()">Anular</button> }
              <button type="button" class="btn btn-primary" (click)="startReturn()">Devolución</button>
            }
          } @else if (mode() === 'void') {
            <button type="button" class="btn btn-danger" [disabled]="busy() || !reason.trim()" (click)="voidIt.emit({ sale: s, reason: reason.trim(), reasonCode: code })">Anular venta</button>
          } @else {
            <button type="button" class="btn btn-primary" [disabled]="busy() || !reason.trim() || !hasReturn()" (click)="emitReturn(s)">Devolver {{ returnTotal(s) | money }}</button>
          }
        } @else { <button type="button" class="btn" (click)="closed.emit()">Cerrar</button> }
      </ng-container>
    </app-modal>
  `,
  styles: `
    .head { display: flex; justify-content: space-between; align-items: flex-start; gap: 12px; margin-bottom: 12px; }
    .tot { font-size: 24px; font-variant-numeric: tabular-nums; }
    .qty { width: 90px; height: 32px; }
  `,
})
export class PosSalesDialog {
  private readonly pos = inject(PosApi);
  readonly open = input(false);
  readonly shiftId = input<string | null>(null);
  readonly busy = input(false);
  readonly error = input('');
  /** Al cambiar (tras anular o devolver), recarga la venta abierta */
  readonly refreshKey = input(0);
  readonly printIt = output<string>();
  readonly voidIt = output<VoidRequest>();
  readonly returnIt = output<ReturnRequest>();
  readonly closed = output<void>();

  protected readonly LABEL = METHOD_LABEL;
  protected readonly STATUS: Record<string, string> = { POSTED: 'Cobrada', VOIDED: 'Anulada' };
  protected readonly codes = VOID_CODES;
  protected readonly methods: PayMethod[] = ['CASH', 'CARD', 'TRANSFER'];
  protected readonly rows = signal<PosSale[]>([]);
  protected readonly loading = signal(false);
  protected readonly selected = signal<PosSale | null>(null);
  protected readonly mode = signal<'view' | 'void' | 'return'>('view');
  protected q = ''; protected reason = ''; protected code = '04'; protected refund: PayMethod = 'CASH';
  protected ret: Record<string, number | null> = {};

  constructor() {
    effect(() => { if (this.open()) untracked(() => { this.selected.set(null); this.q = ''; void this.load(); }); });
    effect(() => { this.refreshKey(); const s = untracked(() => this.selected()); if (s) untracked(() => void this.pick(s.id)); });
  }

  protected async load(): Promise<void> {
    this.loading.set(true);
    try {
      const r = await this.pos.sales(this.q.trim() ? { q: this.q.trim(), limit: 30 } : { shiftId: this.shiftId() ?? '', limit: 50 });
      this.rows.set(r.data);
    } catch (e) { this.rows.set([]); void errorMessage(e); }
    this.loading.set(false);
  }
  protected async pick(id: string): Promise<void> {
    this.selected.set(await this.pos.sale(id));
    this.mode.set('view'); this.reason = ''; this.ret = {};
  }
  protected startVoid(): void { this.mode.set('void'); this.reason = ''; this.code = '04'; }
  protected startReturn(): void { this.mode.set('return'); this.reason = ''; this.ret = {}; this.refund = this.selected()?.payments[0]?.method ?? 'CASH'; }
  protected net(l: { quantity: string; unitPrice: string; discount: string; promoDiscount: string }) {
    return new Decimal(l.quantity).times(l.unitPrice).minus(l.discount).minus(l.promoDiscount).toFixed(2);
  }
  protected hasReturn(): boolean { return Object.values(this.ret).some((v) => Number(v) > 0); }
  /** Estimado (con ITBIS) de lo que se devolverá; el monto exacto lo da la nota de crédito */
  protected returnTotal(s: PosSale): string {
    let t = new Decimal(0);
    for (const l of s.lines) {
      const q = Number(this.ret[l.id] ?? 0);
      if (!(q > 0)) continue;
      const unitNet = new Decimal(this.net(l)).div(l.quantity);
      t = t.plus(unitNet.times(q));
    }
    const ratio = new Decimal(s.subtotal).gt(0) ? new Decimal(s.total).div(s.subtotal) : new Decimal(1);
    return t.times(ratio).toFixed(2);
  }
  protected emitReturn(s: PosSale): void {
    const lines = s.lines.filter((l) => Number(this.ret[l.id] ?? 0) > 0).map((l) => ({ saleLineId: l.id, quantity: Number(this.ret[l.id]) }));
    this.returnIt.emit({ sale: s, lines, refundMethod: this.refund, reason: this.reason.trim() });
  }
}
