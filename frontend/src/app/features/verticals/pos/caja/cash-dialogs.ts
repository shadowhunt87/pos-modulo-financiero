import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Decimal from 'decimal.js';
import { UI } from '../../../../shared/ui';
import { PosApi } from '../pos-api';
import { DENOMINATIONS, METHOD_LABEL, type PayMethod, type PosShift } from '../types';

/** Entrada o salida de efectivo de la gaveta, o abrir la gaveta sin venta. */
@Component({
  selector: 'app-pos-cash',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...UI],
  template: `
    <app-modal [open]="open()" title="Efectivo de la gaveta" width="560px" (closed)="closed.emit()">
      <div class="tabs" role="tablist">
        <button type="button" class="tab" [class.active]="mode() === 'OUT'" (click)="mode.set('OUT')">Salida</button>
        <button type="button" class="tab" [class.active]="mode() === 'IN'" (click)="mode.set('IN')">Entrada</button>
        <button type="button" class="tab" [class.active]="mode() === 'DRAWER'" (click)="mode.set('DRAWER')">Abrir gaveta</button>
      </div>
      <form id="cash-form" class="form-grid" (ngSubmit)="submit()">
        @if (mode() !== 'DRAWER') {
          <div class="field"><label for="m-amt">Monto</label><input id="m-amt" name="amt" class="input num" type="number" min="0.01" step="0.01" [(ngModel)]="amount" required /></div>
          <div class="field span-2"><label for="m-acc">{{ mode() === 'OUT' ? 'A dónde va' : 'De dónde viene' }}</label>
            <select id="m-acc" name="acc" class="select" [(ngModel)]="accountId" required><option value="">Elige la cuenta…</option>
              @for (a of accounts(); track a.id) { <option [value]="a.id">{{ a.code }} · {{ a.name }}</option> }</select>
            <span class="hint">{{ mode() === 'OUT' ? 'Por ejemplo, el banco donde se depositó o un gasto menor.' : 'Por ejemplo, el fondo que se trajo del banco.' }}</span></div>
        }
        <div class="field span-all"><label for="m-why">Motivo</label><input id="m-why" name="why" class="input" [(ngModel)]="reason" required
          [placeholder]="mode() === 'OUT' ? 'Depósito al banco, pago al mensajero…' : mode() === 'IN' ? 'Fondo de cambio…' : 'Cambio de billetes a un cliente…'" /></div>
      </form>
      @if (mode() === 'DRAWER') { <p class="hint" style="margin-top:8px">Abrir la gaveta sin venta queda registrado en el turno.</p> }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
        <button type="submit" form="cash-form" class="btn btn-primary" [disabled]="busy() || !reason.trim() || (mode() !== 'DRAWER' && (!accountId || !(+amount! > 0)))">Registrar</button>
      </ng-container>
    </app-modal>
  `,
})
export class PosCashDialog {
  private readonly pos = inject(PosApi);
  readonly open = input(false);
  readonly terminalId = input<string | null>(null);
  readonly busy = input(false);
  readonly submitted = output<{ mode: 'IN' | 'OUT' | 'DRAWER'; amount: number; accountId: string; reason: string }>();
  readonly closed = output<void>();
  protected readonly mode = signal<'IN' | 'OUT' | 'DRAWER'>('OUT');
  protected readonly accounts = signal<{ id: string; code: string; name: string }[]>([]);
  protected amount: number | null = null; protected accountId = ''; protected reason = '';

  constructor() {
    effect(() => {
      const t = this.terminalId();
      if (!this.open() || !t) return;
      untracked(() => { this.amount = null; this.accountId = ''; this.reason = ''; void this.pos.movementAccounts(t).then((a) => this.accounts.set(a)).catch(() => undefined); });
    });
  }
  protected submit(): void { this.submitted.emit({ mode: this.mode(), amount: Number(this.amount ?? 0), accountId: this.accountId, reason: this.reason.trim() }); }
}

/** Cierre ciego: se cuenta por billetes y monedas; el sistema dice cuánto debería haber hasta después de contar. */
@Component({
  selector: 'app-pos-close',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...UI],
  template: `
    <app-modal [open]="!!shift()" [title]="'Cerrar turno ' + (shift()?.number ?? '')" width="640px" (closed)="closed.emit()">
      @if (shift(); as s) {
        @if (!result()) {
          <p class="dim">Cuenta el efectivo de la gaveta por denominación. No mostramos lo esperado hasta que confirmes el conteo.</p>
          <div class="denoms">
            @for (d of denoms; track d) {
              <label class="den"><span>{{ d | money }}</span><input class="input num" type="number" min="0" step="1" [ngModel]="counts()[d] ?? null" (ngModelChange)="setCount(d, $event)" [attr.aria-label]="'Cantidad de ' + d" /></label>
            }
            <label class="den"><span>Otros (centavos)</span><input class="input num" type="number" min="0" step="0.01" [ngModel]="extra" (ngModelChange)="extra = $event; extraSig.set(+$event || 0)" aria-label="Otros montos" /></label>
          </div>
          <div class="counted"><span>Contado</span><strong><span class="cur">RD$</span>{{ counted().toFixed(2) | money }}</strong></div>
          <div class="field"><label for="cl-notes">Nota (opcional)</label><input id="cl-notes" class="input" [(ngModel)]="notes" /></div>
        } @else {
          <div class="z">
            <div class="row"><span>Debería haber</span><strong class="num">{{ result()!.expectedCash | money }}</strong></div>
            <div class="row"><span>Contado</span><strong class="num">{{ result()!.countedCash | money }}</strong></div>
            <div class="row big" [class.neg]="+result()!.difference! < 0" [class.pos]="+result()!.difference! > 0">
              <span>{{ +result()!.difference! === 0 ? 'Cuadra' : +result()!.difference! > 0 ? 'Sobrante' : 'Faltante' }}</span><strong class="num">{{ result()!.difference | money }}</strong></div>
            <hr />
            <div class="row"><span>Ventas ({{ result()!.totals.salesCount }})</span><strong class="num">{{ result()!.totals.grossSales | money }}</strong></div>
            @for (m of methods; track m) { <div class="row dim"><span>{{ LABEL[m] }}</span><span class="num">{{ result()!.totals.salesByMethod[m] | money }}</span></div> }
            <div class="row dim"><span>Devoluciones ({{ result()!.totals.returnsCount }})</span><span class="num">−{{ sumRefunds() | money }}</span></div>
            <div class="row dim"><span>Entradas / salidas</span><span class="num">{{ result()!.totals.cashIn | money }} / −{{ result()!.totals.cashOut | money }}</span></div>
          </div>
        }
        @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      }
      <ng-container modal-actions>
        @if (!result()) {
          <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="confirm()">{{ busy() ? 'Cerrando…' : 'Cerrar turno' }}</button>
        } @else { <button type="button" class="btn btn-primary" (click)="done.emit()">Listo</button> }
      </ng-container>
    </app-modal>
  `,
  styles: `
    .denoms { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 10px; margin: 14px 0; }
    .den { display: flex; flex-direction: column; gap: 4px; font-size: 13px; color: var(--text-dim); }
    .counted, .z .row { display: flex; justify-content: space-between; align-items: baseline; padding: 6px 0; }
    .counted { font-size: 16px; border-top: 1px solid var(--line); padding-top: 12px; margin-bottom: 12px; }
    .counted strong { font-size: 24px; }
    .z .big { font-size: 18px; }
    hr { border: 0; border-top: 1px solid var(--line); margin: 10px 0; }
  `,
})
export class PosCloseDialog {
  readonly shift = input<PosShift | null>(null);
  readonly busy = input(false);
  readonly error = input('');
  readonly result = input<PosShift | null>(null);
  readonly confirmed = output<{ countedCash: number; countDetail: Record<string, number>; notes?: string }>();
  readonly closed = output<void>();
  readonly done = output<void>();
  protected readonly denoms = DENOMINATIONS;
  protected readonly methods: PayMethod[] = ['CASH', 'CARD', 'TRANSFER'];
  protected readonly LABEL = METHOD_LABEL;
  protected readonly counts = signal<Record<number, number>>({});
  protected extra: number | null = null;
  protected notes = '';
  protected readonly counted = computed(() => {
    const c = this.counts();
    return this.denoms.reduce((a, d) => a.plus(new Decimal(d).times(c[d] ?? 0)), new Decimal(0)).plus(this.extraSig());
  });
  protected readonly extraSig = signal(0);
  protected readonly sumRefunds = computed(() => {
    const r = this.result()?.totals.refundsByMethod;
    return r ? Object.values(r).reduce((a, v) => a + Number(v), 0) : 0;
  });

  constructor() {
    effect(() => { if (this.shift()) untracked(() => { this.counts.set({}); this.extra = null; this.extraSig.set(0); this.notes = ''; }); });
  }
  protected setCount(d: number, v: number | null): void { this.counts.update((c) => ({ ...c, [d]: Math.max(0, Math.floor(Number(v) || 0)) })); this.extraSig.set(Number(this.extra) || 0); }
  protected confirm(): void {
    this.extraSig.set(Number(this.extra) || 0);
    const detail: Record<string, number> = {};
    for (const [k, v] of Object.entries(this.counts())) if (v) detail[k] = v;
    if (Number(this.extra) > 0) detail['otros'] = Number(this.extra);
    this.confirmed.emit({ countedCash: this.counted().toDecimalPlaces(2).toNumber(), countDetail: detail, ...(this.notes.trim() ? { notes: this.notes.trim() } : {}) });
  }
}
