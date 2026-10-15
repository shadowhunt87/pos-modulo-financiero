import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean, dec, monthRange, today } from '../../shared/format';
import { ENTRY_STATUS } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { splitRef, TransferEntry } from './types';

/**
 * Pestaña "Transferencias". El backend solo ofrece crear (POST /treasury/transfers); no hay listado propio,
 * así que el historial se arma con los asientos del rango que traen las líneas "Transferencia enviada/recibida".
 */
@Component({
  selector: 'app-transfers-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  template: `
    <div class="toolbar">
      <div class="field"><label for="tr-from">Desde</label><app-date-input id="tr-from" [value]="from()" (dateChange)="setRange('from', $event)" /></div>
      <div class="field"><label for="tr-to">Hasta</label><app-date-input id="tr-to" [value]="to()" (dateChange)="setRange('to', $event)" /></div>
      <div class="grow"></div>
      @if (canWrite) { <button type="button" class="btn btn-primary" (click)="openNew()">Nueva transferencia</button> }
    </div>
    <app-error-notice [error]="error()" />
    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Fecha</th><th>Asiento</th><th>Origen</th><th>Destino</th><th>Descripción</th><th class="num">Monto</th><th>Estado</th></tr></thead>
          <tbody>
            @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
            @for (t of transfers(); track t.id) {
              <tr>
                <td>{{ t.date | fdate }}</td>
                <td><a [routerLink]="['/entries', t.id]" class="mono">{{ t.number || 'Ver asiento' }}</a></td>
                <td>{{ t.from }}</td><td>{{ t.to }}</td>
                <td>{{ t.description }}@if (t.reference) { <div class="dim">Ref. {{ t.reference }}</div> }</td>
                <td class="num">{{ t.amount | money }}</td>
                <td><app-status [value]="t.status" [map]="ENTRY_STATUS" /></td>
              </tr>
            } @empty {
              @if (!loading()) { <tr><td colspan="7"><app-empty-state title="No hay transferencias en ese rango de fechas." /></td></tr> }
            }
          </tbody>
        </table>
      </div>
    </section>

    <app-modal [open]="modalOpen()" title="Nueva transferencia" width="640px" (closed)="modalOpen.set(false)">
      <form id="transfer-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="t-from">Origen</label>
            <app-combobox id="t-from" formControlName="from" [options]="fromOptions()" placeholder="Banco o caja de donde sale el dinero" [clearable]="false" />
            @if (form.controls.from.touched && form.controls.from.invalid) { <span class="error-text">Elige de dónde sale el dinero.</span> }</div>
          <div class="field span-2"><label for="t-to">Destino</label>
            <app-combobox id="t-to" formControlName="to" [options]="toOptions()" placeholder="Banco o caja que recibe el dinero" [clearable]="false" />
            @if (form.controls.to.touched && form.controls.to.invalid) { <span class="error-text">Elige quién recibe el dinero.</span> }</div>
          <div class="field"><label for="t-amount">Monto</label><input id="t-amount" class="input num" type="number" min="0.01" step="0.01" formControlName="amount" />
            @if (form.controls.amount.touched && form.controls.amount.invalid) { <span class="error-text">Escribe un monto mayor que cero.</span> }</div>
          <div class="field"><label for="t-date">Fecha</label><app-date-input id="t-date" formControlName="date" />
            @if (form.controls.date.touched && form.controls.date.invalid) { <span class="error-text">Indica la fecha.</span> }</div>
          <div class="field span-2"><label for="t-desc">Descripción</label><input id="t-desc" class="input" formControlName="description" maxlength="300" placeholder="Transferencia entre cuentas" /></div>
          <div class="field span-2"><label for="t-ref">Referencia</label><input id="t-ref" class="input" formControlName="reference" maxlength="100" /></div>
        </div>
        <p class="hint" style="margin-top:10px">Solo se transfiere entre cuentas y cajas activas en la moneda base de la empresa. Se crea un asiento de diario.</p>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="transfer-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Transfiriendo…' : 'Transferir' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class TransfersTab {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);

  protected readonly ENTRY_STATUS = ENTRY_STATUS;
  protected readonly canWrite = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  protected readonly from = signal(monthRange().from);
  protected readonly to = signal(monthRange().to);
  private readonly entries = signal<TransferEntry[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  /** cuenta contable -> nombre del banco o caja */
  private readonly glNames = computed(() => {
    const m = new Map<string, string>();
    for (const b of this.lookups.bankAccounts()) if (b.glAccountId) m.set(b.glAccountId, `${b.bankName} · ${b.accountNumber}`);
    for (const c of this.lookups.cashRegisters()) if (c.glAccountId) m.set(c.glAccountId, `Caja · ${c.name}`);
    return m;
  });
  protected readonly transfers = computed(() =>
    this.entries()
      .filter((e) => e.lines.some((l) => l.description === 'Transferencia enviada'))
      .map((e) => {
        const out = e.lines.find((l) => l.description === 'Transferencia enviada');
        const inn = e.lines.find((l) => l.description === 'Transferencia recibida');
        const name = (id: string | undefined) => (id ? this.glNames().get(id) ?? this.lookups.accountName(id) : '');
        return { id: e.id, number: e.number, date: e.date, description: e.description, reference: e.reference, status: e.status,
          from: name(out?.accountId), to: name(inn?.accountId), amount: dec(inn?.debit).toString() };
      }));

  private options(): ComboOption[] {
    const banks = this.lookups.bankAccounts().filter((b) => b.active).map((b) => ({ value: `BANK:${b.id}`, label: `${b.bankName} · ${b.accountNumber}`, hint: b.currency }));
    const cash = this.lookups.cashRegisters().filter((c) => c.active).map((c) => ({ value: `CASH:${c.id}`, label: `Caja · ${c.name}`, hint: c.currency }));
    return [...banks, ...cash];
  }
  protected readonly fromOptions = computed(() => this.options().filter((o) => o.value !== this.toValue()));
  protected readonly toOptions = computed(() => this.options().filter((o) => o.value !== this.fromValue()));
  private readonly fromValue = signal('');
  private readonly toValue = signal('');

  protected readonly modalOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    from: ['', Validators.required], to: ['', Validators.required], amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    date: [today(), Validators.required], description: [''], reference: [''],
  });

  constructor() {
    void Promise.all([this.lookups.ensureBankAccounts(), this.lookups.ensureCashRegisters(), this.lookups.ensureAccounts()]);
    this.form.controls.from.valueChanges.subscribe((v) => this.fromValue.set(v));
    this.form.controls.to.valueChanges.subscribe((v) => this.toValue.set(v));
    void this.load();
  }

  protected setRange(which: 'from' | 'to', v: string): void {
    (which === 'from' ? this.from : this.to).set(v);
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.entries.set(await this.api.getAll<TransferEntry>('/accounting/journal-entries', { from: this.from(), to: this.to() })); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.formError.set('');
    this.form.reset({ date: today(), amount: null });
    this.fromValue.set(''); this.toValue.set('');
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const from = splitRef(v.from), to = splitRef(v.to);
    if (from.type === to.type && from.id === to.id) { this.formError.set('El origen y el destino no pueden ser el mismo.'); return; }
    this.saving.set(true); this.formError.set('');
    const body = clean({ fromType: from.type, fromId: from.id, toType: to.type, toId: to.id, amount: Number(v.amount), date: v.date, description: v.description.trim(), reference: v.reference.trim() });
    try {
      await new Promise<void>((ok, bad) => this.api.post('/treasury/transfers', body).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok('Transferencia registrada.');
      this.modalOpen.set(false);
      void this.lookups.ensureBankAccounts(true);
      void this.lookups.ensureCashRegisters(true);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }
}
