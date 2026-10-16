import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import Decimal from 'decimal.js';
import { UI } from '../../../../shared/ui';
import { r2 } from '../pricing';
import { METHOD_LABEL, type PayMethod } from '../types';

export interface PayLine { method: PayMethod; amount: string; reference?: string }

/** Cobro: efectivo (con billetes rápidos y cambio), tarjeta, transferencia o mixto. */
@Component({
  selector: 'app-pos-pay',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...UI],
  template: `
    <app-modal [open]="open()" title="Cobrar" width="600px" (closed)="closed.emit()">
      <div class="due"><span>Total a cobrar</span><strong><span class="cur">RD$</span>{{ total() | money }}</strong></div>

      <div class="tabs" role="tablist">
        @for (m of methods; track m) { <button type="button" class="tab" role="tab" [class.active]="method() === m" [attr.aria-selected]="method() === m" (click)="method.set(m)">{{ LABEL[m] }}</button> }
      </div>
      <div class="entry">
        <div class="field"><label for="p-amt">{{ method() === 'CASH' ? 'Recibido' : 'Monto' }}</label>
          <input id="p-amt" class="input big num" type="number" min="0" step="0.01" [(ngModel)]="amount" (keydown.enter)="add()" /></div>
        @if (method() !== 'CASH') { <div class="field"><label for="p-ref">Referencia (opcional)</label><input id="p-ref" class="input" [(ngModel)]="reference" placeholder="Autorización, nº de transferencia" /></div> }
        <button type="button" class="btn" (click)="add()" [disabled]="!((amount ?? 0) > 0)">Agregar</button>
      </div>
      @if (method() === 'CASH') {
        <div class="quick">
          <button type="button" class="btn btn-sm" (click)="quick(pending())">Exacto</button>
          @for (b of bills(); track b) { <button type="button" class="btn btn-sm" (click)="quick(b)">{{ b | money }}</button> }
        </div>
      }

      @if (lines().length) {
        <ul class="paid">
          @for (l of lines(); track $index; let i = $index) {
            <li><span>{{ LABEL[l.method] }}@if (l.reference) { <span class="dim"> · {{ l.reference }}</span> }</span><span class="num">{{ l.amount | money }}</span>
              <button type="button" class="btn btn-ghost btn-icon" (click)="remove(i)" [attr.aria-label]="'Quitar pago ' + (i + 1)">✕</button></li>
          }
        </ul>
      }
      <div class="summary">
        @if (pending().gt(0)) { <div class="row"><span>Falta</span><strong class="neg num">{{ pending().toFixed(2) | money }}</strong></div> }
        @if (change().gt(0)) { <div class="row change"><span>Cambio</span><strong class="num"><span class="cur">RD$</span>{{ change().toFixed(2) | money }}</strong></div> }
      </div>
      @if (canCredit() && pending().gt(0)) {
        <label class="check"><input type="checkbox" [(ngModel)]="credit" /> Dejar lo que falta a crédito del cliente</label>
      }
      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="closed.emit()">Volver</button>
        <button type="button" class="btn btn-primary btn-lg" [disabled]="busy() || (pending().gt(0) && !credit)" (click)="confirm()">{{ busy() ? 'Cobrando…' : 'Confirmar cobro' }}</button>
      </ng-container>
    </app-modal>
  `,
  styles: `
    .due { display: flex; justify-content: space-between; align-items: baseline; padding: 14px 16px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 12px; margin-bottom: 16px; }
    .due strong { font-size: 30px; font-variant-numeric: tabular-nums; }
    .entry { display: grid; grid-template-columns: 1fr 1fr auto; gap: 10px; align-items: end; }
    .entry:has(> :nth-child(2):last-child) { grid-template-columns: 1fr auto; }
    .big { height: 46px; font-size: 20px; }
    .quick { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
    .paid { list-style: none; padding: 0; margin: 16px 0 0; border: 1px solid var(--line); border-radius: 10px; }
    .paid li { display: grid; grid-template-columns: 1fr auto 36px; gap: 8px; align-items: center; padding: 8px 6px 8px 14px; }
    .paid li + li { border-top: 1px solid var(--line); }
    .summary { margin: 14px 0; }
    .summary .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 16px; }
    .change strong { font-size: 26px; color: var(--pos); }
    .btn-lg { height: 44px; padding: 0 22px; font-size: 15px; }
  `,
})
export class PosPayDialog {
  readonly open = input(false);
  readonly total = input('0');
  readonly canCredit = input(false);
  readonly busy = input(false);
  readonly error = input('');
  readonly confirmed = output<{ payments: PayLine[]; allowCredit: boolean }>();
  readonly closed = output<void>();

  protected readonly LABEL = METHOD_LABEL;
  protected readonly methods: PayMethod[] = ['CASH', 'CARD', 'TRANSFER'];
  protected readonly method = signal<PayMethod>('CASH');
  protected readonly lines = signal<PayLine[]>([]);
  protected amount: number | null = null;
  protected reference = '';
  protected credit = false;

  private readonly paid = computed(() => this.lines().reduce((a, l) => a.plus(l.amount), new Decimal(0)));
  protected readonly pending = computed(() => Decimal.max(0, r2(new Decimal(this.total()).minus(this.paid()))));
  /** Cambio: lo que sobra, siempre en efectivo */
  protected readonly change = computed(() => Decimal.max(0, r2(this.paid().minus(this.total()))));
  /** Billetes que cubren lo que falta (para tocar rápido) */
  protected readonly bills = computed(() => {
    const p = this.pending().toNumber();
    return [100, 200, 500, 1000, 2000].map((b) => Math.ceil(p / b) * b).filter((v, i, a) => v > p && a.indexOf(v) === i).slice(0, 4);
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      untracked(() => { this.lines.set([]); this.method.set('CASH'); this.credit = false; this.reference = ''; this.amount = Number(this.total()); });
    });
  }

  protected quick(v: Decimal.Value): void { this.amount = Number(v); this.add(); }
  protected add(): void {
    const v = Number(this.amount);
    if (!(v > 0)) return;
    if (this.method() !== 'CASH' && new Decimal(v).gt(this.pending())) { this.amount = this.pending().toNumber(); return; }
    this.lines.update((ls) => [...ls, { method: this.method(), amount: new Decimal(v).toFixed(2), ...(this.reference.trim() ? { reference: this.reference.trim() } : {}) }]);
    this.reference = '';
    this.amount = this.pending().gt(0) ? this.pending().toNumber() : null;
  }
  protected remove(i: number): void { this.lines.update((ls) => ls.filter((_, k) => k !== i)); this.amount = this.pending().toNumber(); }

  protected confirm(): void {
    // Si se escribió un monto y no se agregó, cuenta
    if (!this.lines().length && Number(this.amount) > 0) this.add();
    this.confirmed.emit({ payments: this.lines(), allowCredit: this.credit });
  }
}
