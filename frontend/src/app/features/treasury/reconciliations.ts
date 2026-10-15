import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean, fmtDate, today } from '../../shared/format';
import { RECON_STATUS } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { Reconciliation } from './types';

/** Listado de conciliaciones bancarias por fecha de corte, con alta rápida. */
@Component({
  selector: 'app-reconciliations',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Conciliación bancaria</h1><p class="sub">Compara el extracto del banco con tus libros a una fecha de corte.</p></div>
        @if (canCreate) { <button type="button" class="btn btn-primary" (click)="openNew()">Nueva conciliación</button> }
      </div>

      <div class="toolbar">
        <div class="field wide"><label for="rc-bank">Cuenta bancaria</label>
          <select id="rc-bank" class="select" (change)="bankFilter.set($any($event.target).value)">
            <option value="">Todas</option>
            @for (b of banks(); track b.value) { <option [value]="b.value" [selected]="b.value === bankFilter()">{{ b.label }}</option> }
          </select></div>
        <div class="field"><label for="rc-status">Estado</label>
          <select id="rc-status" class="select" (change)="statusFilter.set($any($event.target).value)">
            <option value="">Todos</option><option value="DRAFT">En proceso</option><option value="COMPLETED">Completadas</option>
          </select></div>
      </div>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Fecha de corte</th><th>Cuenta bancaria</th><th class="num">Saldo del extracto</th><th class="num">Saldo en libros</th><th class="num">Diferencia</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (r of rows(); track r.id) {
                <tr>
                  <td><a [routerLink]="['/reconciliations', r.id]"><strong>{{ r.statementDate | fdate }}</strong></a></td>
                  <td>{{ r.bankAccount.bankName }} <span class="mono dim">{{ r.bankAccount.accountNumber }}</span></td>
                  <td class="num">{{ r.statementBalance | money }}</td>
                  <td class="num">{{ r.bookBalance | money }}</td>
                  <td class="num" [class]="r.difference | signClass">{{ r.difference | money }}</td>
                  <td><app-status [value]="r.status" [map]="STATUS" /></td>
                  <td class="actions">
                    <a class="btn btn-ghost btn-sm" [routerLink]="['/reconciliations', r.id]">Abrir</a>
                    @if (canDelete && r.status === 'DRAFT') { <button type="button" class="btn btn-ghost btn-sm" (click)="remove(r)">Eliminar</button> }
                  </td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="7"><app-empty-state title="No hay conciliaciones con esos filtros." text="Compara el extracto del banco con tus libros, mes a mes." actionLabel="Nueva conciliación" (action)="openNew()" [canAct]="canCreate" /></td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="modalOpen()" title="Nueva conciliación" width="560px" (closed)="modalOpen.set(false)">
      <form id="rec-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="n-bank">Cuenta bancaria</label>
            <app-combobox id="n-bank" formControlName="bankAccountId" [options]="activeBanks()" placeholder="Elige la cuenta" [clearable]="false" />
            @if (form.controls.bankAccountId.touched && form.controls.bankAccountId.invalid) { <span class="error-text">Elige la cuenta bancaria a conciliar.</span> }</div>
          <div class="field"><label for="n-date">Fecha de corte</label><app-date-input id="n-date" formControlName="statementDate" />
            @if (form.controls.statementDate.touched && form.controls.statementDate.invalid) { <span class="error-text">Indica la fecha del extracto.</span> }</div>
          <div class="field"><label for="n-bal">Saldo final del extracto</label><input id="n-bal" class="input num" type="number" step="0.01" formControlName="statementBalance" />
            @if (form.controls.statementBalance.touched && form.controls.statementBalance.invalid) { <span class="error-text">Escribe el saldo que muestra el banco.</span> }</div>
          <div class="field span-2"><label for="n-notes">Notas</label><textarea id="n-notes" class="textarea" rows="2" formControlName="notes" maxlength="1000"></textarea></div>
        </div>
        <p class="hint" style="margin-top:10px">La fecha debe ser posterior a la última conciliación completada de esa cuenta. Solo cuentas en moneda base.</p>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="rec-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Creando…' : 'Crear y conciliar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class Reconciliations {
  /** Filtro opcional que llega por ?bankAccountId= desde el detalle de la cuenta. */
  readonly bankAccountId = input<string>();

  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  private readonly router = inject(Router);

  protected readonly STATUS = RECON_STATUS;
  private readonly auth = inject(Auth);
  protected readonly canCreate = this.auth.has('ADMIN', 'ACCOUNTANT', 'APPROVER');
  protected readonly canDelete = this.auth.has('ADMIN', 'ACCOUNTANT');

  protected readonly rows = signal<Reconciliation[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly bankFilter = signal('');
  protected readonly statusFilter = signal('');
  protected readonly banks = computed<ComboOption[]>(() => this.lookups.bankAccounts().map((b) => ({ value: b.id, label: `${b.bankName} · ${b.accountNumber}` })));
  protected readonly activeBanks = computed<ComboOption[]>(() => this.lookups.bankAccounts().filter((b) => b.active).map((b) => ({ value: b.id, label: `${b.bankName} · ${b.accountNumber}`, hint: b.currency })));

  protected readonly modalOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    bankAccountId: ['', Validators.required], statementDate: [today(), Validators.required],
    statementBalance: [null as number | null, Validators.required], notes: [''],
  });

  constructor() {
    void this.lookups.ensureBankAccounts();
    effect(() => { const id = this.bankAccountId(); if (id) this.bankFilter.set(id); });
    effect(() => { this.bankFilter(); this.statusFilter(); void this.load(); });
  }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.rows.set(await this.api.getP<Reconciliation[]>('/bank-reconciliations', { bankAccountId: this.bankFilter(), status: this.statusFilter() })); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.formError.set('');
    this.form.reset({ bankAccountId: this.bankFilter(), statementDate: today(), statementBalance: null, notes: '' });
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const body = clean({ bankAccountId: v.bankAccountId, statementDate: v.statementDate, statementBalance: Number(v.statementBalance), notes: v.notes.trim() });
    try {
      const rec = await firstValueFrom(this.api.post<{ id: string }>('/bank-reconciliations', body));
      this.notify.ok('Conciliación creada.');
      this.modalOpen.set(false);
      await this.router.navigate(['/reconciliations', rec.id]);
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async remove(r: Reconciliation): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Eliminar conciliación', message: `Se eliminará la conciliación al ${fmtDate(r.statementDate)} de ${r.bankAccount.bankName}. Los movimientos y enlaces no cambian.`, confirmText: 'Eliminar', danger: true }))) return;
    try {
      await firstValueFrom(this.api.delete(`/bank-reconciliations/${r.id}`));
      this.notify.ok('Conciliación eliminada.');
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
