import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { ReactiveFormsModule, Validators } from '@angular/forms';
import { FormBuilder } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean, dec } from '../../shared/format';
import { BANK_ACCOUNT_TYPE } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { BankAccountRow } from './types';

/** Pestaña "Cuentas bancarias": listado con saldo en libros y alta/edición (solo administradores escriben). */
@Component({
  selector: 'app-bank-accounts-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  template: `
    <div class="toolbar">
      <div class="field"><label for="ba-act">Estado</label>
        <select id="ba-act" class="select" (change)="onlyActive.set($any($event.target).value === 'true')">
          <option value="true">Activas</option><option value="">Todas</option>
        </select></div>
      <div class="grow"></div>
      @if (canAdmin) { <button type="button" class="btn btn-primary" (click)="openNew()">Nueva cuenta bancaria</button> }
    </div>
    @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Banco</th><th>Número</th><th>Tipo</th><th>Moneda</th><th>Cuenta contable</th><th class="num">Saldo en libros</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @if (loading()) { <tr><td colspan="8"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
            @for (b of visible(); track b.id) {
              <tr>
                <td><a [routerLink]="['/bank-accounts', b.id]"><strong>{{ b.bankName }}</strong></a>@if (b.iban) { <div class="dim mono">{{ b.iban }}</div> }</td>
                <td class="mono">{{ b.accountNumber }}</td>
                <td>{{ b.type | lbl: TYPES }}</td>
                <td>{{ b.currency }}</td>
                <td>{{ accountName(b.glAccountId) }}</td>
                <td class="num" [class]="b.glBalance | signClass">{{ b.glBalance | money }}</td>
                <td><span class="badge" [class.pos]="b.active">{{ b.active ? 'Activa' : 'Inactiva' }}</span></td>
                <td class="actions">
                  <a class="btn btn-ghost btn-sm" [routerLink]="['/bank-accounts', b.id]">Movimientos</a>
                  @if (canAdmin) {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(b)">Editar</button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(b)">{{ b.active ? 'Desactivar' : 'Activar' }}</button>
                  }
                </td>
              </tr>
            } @empty {
              @if (!loading()) { <tr><td colspan="8" class="table-empty">No hay cuentas bancarias. @if (canAdmin) { Crea la primera con “Nueva cuenta bancaria”. }</td></tr> }
            }
          </tbody>
          @if (visible().length > 1) {
            <tfoot><tr><td colspan="5">Total en libros (puede mezclar monedas)</td><td class="num">{{ total() | money }}</td><td colspan="2"></td></tr></tfoot>
          }
        </table>
      </div>
    </section>

    <app-modal [open]="modalOpen()" [title]="editing() ? 'Editar cuenta bancaria' : 'Nueva cuenta bancaria'" width="680px" (closed)="modalOpen.set(false)">
      <form id="bank-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="b-name">Banco</label><input id="b-name" class="input" formControlName="bankName" />
            @if (form.controls.bankName.touched && form.controls.bankName.invalid) { <span class="error-text">Escribe el nombre del banco.</span> }</div>
          @if (!editing()) {
            <div class="field"><label for="b-num">Número de cuenta</label><input id="b-num" class="input mono" formControlName="accountNumber" />
              @if (form.controls.accountNumber.touched && form.controls.accountNumber.invalid) { <span class="error-text">Escribe el número de cuenta.</span> }</div>
            <div class="field"><label for="b-type">Tipo</label>
              <select id="b-type" class="select" formControlName="type"><option value="CHECKING">Corriente</option><option value="SAVINGS">Ahorros</option></select></div>
            <div class="field"><label for="b-cur">Moneda</label><input id="b-cur" class="input mono" formControlName="currency" maxlength="3" placeholder="DOP" />
              @if (form.controls.currency.invalid) { <span class="error-text">Usa 3 letras mayúsculas, por ejemplo DOP.</span> }</div>
            <div class="field span-2"><label for="b-gl">Cuenta contable (activo)</label>
              <app-combobox id="b-gl" formControlName="glAccountId" [options]="glOptions()" placeholder="Busca por código o nombre" [clearable]="false" />
              @if (form.controls.glAccountId.touched && form.controls.glAccountId.invalid) { <span class="error-text">Elige la cuenta contable que representa a este banco.</span> }
              <span class="hint">Solo aparecen cuentas de activo activas que no usa otro banco o caja.</span></div>
          }
          <div class="field"><label for="b-iban">IBAN</label><input id="b-iban" class="input mono" formControlName="iban" maxlength="34" /></div>
          <div class="field"><label for="b-swift">SWIFT</label><input id="b-swift" class="input mono" formControlName="swift" maxlength="11" /></div>
          @if (!editing()) {
            <div class="field"><label for="b-open">Saldo inicial (informativo)</label><input id="b-open" class="input num" type="number" step="0.01" formControlName="openingBalance" />
              <span class="hint">El saldo real entra por un asiento de apertura.</span></div>
            <div class="field"><label for="b-opend">Fecha del saldo inicial</label><input id="b-opend" class="input" type="date" formControlName="openingBalanceDate" /></div>
          } @else {
            <label class="check span-all"><input type="checkbox" formControlName="active" /> Cuenta activa</label>
          }
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="bank-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class BankAccountsTab {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);

  protected readonly TYPES = BANK_ACCOUNT_TYPE;
  protected readonly canAdmin = inject(Auth).has('ADMIN');

  protected readonly rows = signal<BankAccountRow[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly onlyActive = signal(true);
  protected readonly visible = computed(() => (this.onlyActive() ? this.rows().filter((r) => r.active) : this.rows()));
  protected readonly total = computed(() => this.visible().reduce((s, r) => s.plus(dec(r.glBalance)), dec(0)).toString());
  private readonly usedGl = signal<Set<string>>(new Set());
  protected readonly glOptions = computed<ComboOption[]>(() =>
    this.lookups.accounts()
      .filter((a) => a.type === 'ASSET' && a.active && a.isPostable && !this.usedGl().has(a.id))
      .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })));

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<BankAccountRow | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    bankName: ['', [Validators.required, Validators.maxLength(100)]],
    accountNumber: ['', [Validators.required, Validators.maxLength(50)]],
    type: ['CHECKING'], currency: ['', Validators.pattern(/^[A-Z]{3}$/)], glAccountId: ['', Validators.required],
    iban: ['', Validators.maxLength(34)], swift: ['', Validators.maxLength(11)],
    openingBalance: [null as number | null], openingBalanceDate: [''], active: [true],
  });

  constructor() {
    void this.lookups.ensureAccounts();
    void this.load();
  }

  protected accountName(id: string | null): string { return this.lookups.accountName(id); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [banks, cash] = await Promise.all([this.api.getP<BankAccountRow[]>('/bank-accounts'), this.api.getP<{ glAccountId: string | null }[]>('/cash-registers')]);
      this.rows.set(banks);
      this.usedGl.set(new Set([...banks, ...cash].map((x) => x.glAccountId).filter((x): x is string => !!x)));
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.editing.set(null); this.formError.set('');
    this.form.reset({ type: 'CHECKING', active: true });
    this.modalOpen.set(true);
  }
  protected openEdit(b: BankAccountRow): void {
    this.editing.set(b); this.formError.set('');
    this.form.reset({ bankName: b.bankName, accountNumber: b.accountNumber, glAccountId: b.glAccountId ?? '', iban: b.iban ?? '', swift: b.swift ?? '', active: b.active });
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    const cur = this.editing();
    this.form.markAllAsTouched();
    const c = this.form.controls;
    const invalid = cur ? c.bankName.invalid || c.iban.invalid || c.swift.invalid : this.form.invalid;
    if (invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    try {
      if (cur) {
        const body = { bankName: v.bankName.trim(), iban: v.iban.trim(), swift: v.swift.trim(), active: v.active };
        await new Promise<void>((ok, bad) => this.api.patch(`/bank-accounts/${cur.id}`, body).subscribe({ next: () => ok(), error: bad }));
      } else {
        const body = clean({
          bankName: v.bankName.trim(), accountNumber: v.accountNumber.trim(), iban: v.iban.trim(), swift: v.swift.trim(), type: v.type,
          currency: v.currency, glAccountId: v.glAccountId,
          openingBalance: v.openingBalance === null ? '' : Number(v.openingBalance), openingBalanceDate: v.openingBalanceDate,
        });
        await new Promise<void>((ok, bad) => this.api.post('/bank-accounts', body).subscribe({ next: () => ok(), error: bad }));
      }
      this.notify.ok(cur ? 'Cuenta bancaria actualizada.' : 'Cuenta bancaria creada.');
      this.modalOpen.set(false);
      void this.lookups.ensureBankAccounts(true);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async toggle(b: BankAccountRow): Promise<void> {
    const to = !b.active;
    if (!(await this.confirm.ask({
      title: to ? 'Activar cuenta bancaria' : 'Desactivar cuenta bancaria',
      message: to ? `${b.bankName} ${b.accountNumber} volverá a estar disponible en transferencias y pagos.` : `${b.bankName} ${b.accountNumber} dejará de aparecer en transferencias y pagos. Sus movimientos no cambian.`,
      confirmText: to ? 'Activar' : 'Desactivar', danger: !to,
    }))) return;
    try {
      await new Promise<void>((ok, bad) => this.api.patch(`/bank-accounts/${b.id}`, { active: to }).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok(to ? 'Cuenta activada.' : 'Cuenta desactivada.');
      void this.lookups.ensureBankAccounts(true);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
