import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subject, debounceTime, switchMap, from, catchError, of } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { errorMessage } from '../../../../core/errors';
import { UI } from '../../../../shared/ui';
import { PosApi } from '../pos-api';
import type { PosCustomer } from '../types';

/** Elegir el cliente de la venta (o crearlo rápido). Son clientes del sistema contable. */
@Component({
  selector: 'app-pos-customer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...UI],
  template: `
    <app-modal [open]="open()" title="Cliente de la venta" width="560px" (closed)="closed.emit()">
      @if (!creating()) {
        <div class="field"><label for="c-q">Buscar por nombre, RNC o cédula</label>
          <input id="c-q" class="input" autocomplete="off" [ngModel]="q" (ngModelChange)="q = $event; search$.next($event)" /></div>
        <ul class="list">
          @if (defaultName()) { <li><button type="button" (click)="pickDefault.emit()"><strong>{{ defaultName() }}</strong><span class="dim">Sin datos fiscales</span></button></li> }
          @for (c of results(); track c.id) {
            <li><button type="button" (click)="picked.emit(c)"><strong>{{ c.name }}</strong><span class="dim mono">{{ c.taxId ?? 'Sin RNC' }}</span></button></li>
          } @empty { @if (q) { <li class="dim empty">No hay clientes con «{{ q }}».</li> } }
        </ul>
        <button type="button" class="btn btn-sm" (click)="creating.set(true)">+ Cliente nuevo</button>
      } @else {
        <form id="cn-form" class="form-grid" (ngSubmit)="create()">
          <div class="field span-all"><label for="cn-name">Nombre o razón social</label><input id="cn-name" name="name" class="input" [(ngModel)]="name" required /></div>
          <div class="field"><label for="cn-type">Documento</label>
            <select id="cn-type" name="type" class="select" [(ngModel)]="taxIdType"><option value="RNC">RNC</option><option value="CEDULA">Cédula</option></select></div>
          <div class="field"><label for="cn-tax">Número</label><input id="cn-tax" name="tax" class="input mono" [(ngModel)]="taxId" placeholder="Solo números" /></div>
          <div class="field"><label for="cn-phone">Teléfono</label><input id="cn-phone" name="phone" class="input" [(ngModel)]="phone" /></div>
          <label class="check span-all"><input type="checkbox" name="b01" [(ngModel)]="fiscalCredit" /> Pide comprobante de crédito fiscal ({{ fiscalCreditNcf() }})</label>
          @if (error()) { <div class="notice neg span-all" role="alert">{{ error() }}</div> }
        </form>
      }
      <ng-container modal-actions>
        @if (creating()) {
          <button type="button" class="btn" (click)="creating.set(false)">Volver</button>
          <button type="submit" form="cn-form" class="btn btn-primary" [disabled]="!name.trim()">Crear y usar</button>
        } @else { <button type="button" class="btn" (click)="closed.emit()">Cerrar</button> }
      </ng-container>
    </app-modal>
  `,
  styles: `
    .list { list-style: none; margin: 12px 0; padding: 0; max-height: 320px; overflow-y: auto; border: 1px solid var(--line); border-radius: 10px; }
    .list li + li { border-top: 1px solid var(--line); }
    .list button { width: 100%; display: flex; justify-content: space-between; gap: 12px; padding: 12px 14px; border: 0; background: none; cursor: pointer; text-align: left; }
    .list button:hover { background: var(--surface-2); }
    .empty { padding: 12px 14px; }
  `,
})
export class PosCustomerDialog {
  private readonly pos = inject(PosApi);
  readonly open = input(false);
  readonly defaultName = input<string | null>(null);
  /** Tipo de comprobante de crédito fiscal configurado en el POS */
  readonly fiscalCreditNcf = input('B01');
  readonly picked = output<PosCustomer>();
  readonly pickDefault = output<void>();
  readonly closed = output<void>();
  protected q = '';
  protected readonly search$ = new Subject<string>();
  protected readonly results = signal<PosCustomer[]>([]);
  protected readonly creating = signal(false);
  protected readonly error = signal('');
  protected name = ''; protected taxId = ''; protected taxIdType = 'RNC'; protected phone = ''; protected fiscalCredit = false;

  constructor() {
    this.search$.pipe(debounceTime(250), switchMap((q) => from(this.pos.customers(q)).pipe(catchError(() => of([])))), takeUntilDestroyed())
      .subscribe((r) => this.results.set(r));
    effect(() => { if (this.open()) untracked(() => { this.creating.set(false); this.q = ''; this.search$.next(''); }); });
  }

  protected async create(): Promise<void> {
    this.error.set('');
    try {
      const c = await this.pos.createCustomer({
        name: this.name.trim(), ...(this.taxId.trim() ? { taxId: this.taxId.replace(/\D/g, ''), taxIdType: this.taxIdType } : {}),
        ...(this.phone.trim() ? { phone: this.phone.trim() } : {}), ...(this.fiscalCredit ? { defaultNcfType: this.fiscalCreditNcf() } : {}),
      });
      this.name = this.taxId = this.phone = ''; this.fiscalCredit = false;
      this.picked.emit(c);
    } catch (e) { this.error.set(errorMessage(e)); }
  }
}
