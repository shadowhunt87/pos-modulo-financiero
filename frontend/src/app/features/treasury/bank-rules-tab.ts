import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean } from '../../shared/format';
import { ComboOption, UI } from '../../shared/ui';
import { BankRule } from './types';

/** Pestaña "Reglas bancarias": si la descripción del movimiento contiene el texto, se categoriza con la cuenta elegida. */
@Component({
  selector: 'app-bank-rules-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ...UI],
  template: `
    <div class="toolbar">
      <div class="field"><label for="br-act">Estado</label>
        <select id="br-act" class="select" (change)="onlyActive.set($any($event.target).value === 'true')">
          <option value="true">Activas</option><option value="">Todas</option>
        </select></div>
      <div class="grow"></div>
      @if (canAdmin) { <button type="button" class="btn btn-primary" (click)="openNew()">Nueva regla</button> }
    </div>
    <p class="hint" style="margin:-4px 0 12px">Las reglas se aplican de menor a mayor prioridad: gana la primera cuyo texto aparezca en la descripción (sin distinguir mayúsculas).</p>
    <app-error-notice [error]="error()" />
    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th class="num">Prioridad</th><th>Nombre</th><th>Si la descripción contiene</th><th>Categorizar en</th><th>Cuenta bancaria</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
            @for (r of visible(); track r.id) {
              <tr>
                <td class="num">{{ r.priority }}</td>
                <td><strong>{{ r.name }}</strong></td>
                <td class="mono">{{ r.matchText }}</td>
                <td>{{ r.account ? r.account.code + ' · ' + r.account.name : accountName(r.accountId) }}</td>
                <td>{{ bankName(r.bankAccountId) }}</td>
                <td><span class="badge" [class.pos]="r.active">{{ r.active ? 'Activa' : 'Inactiva' }}</span></td>
                <td class="actions">
                  @if (canAdmin) {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(r)">Editar</button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(r)">{{ r.active ? 'Desactivar' : 'Activar' }}</button>
                  }
                </td>
              </tr>
            } @empty {
              @if (!loading()) { <tr><td colspan="7"><app-empty-state title="No hay reglas. Con una regla, comisiones e intereses se categorizan solos al importar el extracto." actionLabel="Nueva regla" (action)="openNew()" [canAct]="canAdmin" /></td></tr> }
            }
          </tbody>
        </table>
      </div>
    </section>

    <app-modal [open]="modalOpen()" [title]="editing() ? 'Editar regla' : 'Nueva regla'" width="620px" (closed)="modalOpen.set(false)">
      <form id="rule-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="r-name">Nombre</label><input id="r-name" class="input" formControlName="name" placeholder="Comisión bancaria" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe un nombre para la regla.</span> }</div>
          <div class="field"><label for="r-text">Texto a buscar</label><input id="r-text" class="input mono" formControlName="matchText" placeholder="COMISION" />
            @if (form.controls.matchText.touched && form.controls.matchText.invalid) { <span class="error-text">Escribe al menos 2 caracteres.</span> }</div>
          <div class="field"><label for="r-prio">Prioridad (1 a 1000)</label><input id="r-prio" class="input num" type="number" min="1" max="1000" formControlName="priority" /></div>
          <div class="field span-2"><label for="r-acc">Cuenta contable</label>
            <app-combobox id="r-acc" formControlName="accountId" [options]="accountOptions()" placeholder="Busca por código o nombre" [clearable]="false" />
            @if (form.controls.accountId.touched && form.controls.accountId.invalid) { <span class="error-text">Elige la cuenta donde se registrará el movimiento.</span> }</div>
          @if (!editing()) {
            <div class="field span-2"><label for="r-bank">Solo para la cuenta bancaria</label>
              <app-combobox id="r-bank" formControlName="bankAccountId" [options]="bankOptions()" placeholder="Todas las cuentas" />
              <span class="hint">No se puede cambiar después de crear la regla.</span></div>
          } @else {
            <label class="check span-all"><input type="checkbox" formControlName="active" /> Regla activa</label>
          }
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="rule-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class BankRulesTab {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);

  protected readonly canAdmin = inject(Auth).has('ADMIN');
  protected readonly rows = signal<BankRule[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly onlyActive = signal(true);
  protected readonly visible = computed(() => (this.onlyActive() ? this.rows().filter((r) => r.active) : this.rows()));
  protected readonly accountOptions = computed<ComboOption[]>(() =>
    this.lookups.accounts().filter((a) => a.active && a.isPostable).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })));
  protected readonly bankOptions = computed<ComboOption[]>(() =>
    this.lookups.bankAccounts().filter((b) => b.active).map((b) => ({ value: b.id, label: `${b.bankName} · ${b.accountNumber}` })));

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<BankRule | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]], matchText: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(100)]],
    accountId: ['', Validators.required], bankAccountId: [''], priority: [100, [Validators.min(1), Validators.max(1000)]], active: [true],
  });

  constructor() {
    void this.lookups.ensureAccounts();
    void this.lookups.ensureBankAccounts();
    void this.load();
  }

  protected accountName(id: string): string { return this.lookups.accountName(id); }
  protected bankName(id: string | null): string {
    if (!id) return 'Todas';
    const b = this.lookups.bankAccounts().find((x) => x.id === id);
    return b ? `${b.bankName} · ${b.accountNumber}` : '';
  }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.rows.set(await this.api.getP<BankRule[]>('/bank-rules')); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.editing.set(null); this.formError.set('');
    this.form.reset({ priority: 100, active: true });
    this.modalOpen.set(true);
  }
  protected openEdit(r: BankRule): void {
    this.editing.set(r); this.formError.set('');
    this.form.reset({ name: r.name, matchText: r.matchText, accountId: r.accountId, priority: r.priority, active: r.active });
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const cur = this.editing();
    try {
      if (cur) {
        const body = { name: v.name.trim(), matchText: v.matchText.trim(), accountId: v.accountId, priority: Number(v.priority), active: v.active };
        await new Promise<void>((ok, bad) => this.api.patch(`/bank-rules/${cur.id}`, body).subscribe({ next: () => ok(), error: bad }));
      } else {
        const body = clean({ name: v.name.trim(), matchText: v.matchText.trim(), accountId: v.accountId, bankAccountId: v.bankAccountId, priority: Number(v.priority) });
        await new Promise<void>((ok, bad) => this.api.post('/bank-rules', body).subscribe({ next: () => ok(), error: bad }));
      }
      this.notify.ok(cur ? 'Regla actualizada.' : 'Regla creada.');
      this.modalOpen.set(false);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async toggle(r: BankRule): Promise<void> {
    const to = !r.active;
    if (!(await this.confirm.ask({
      title: to ? 'Activar regla' : 'Desactivar regla',
      message: to ? `“${r.name}” volverá a aplicarse a los movimientos pendientes.` : `“${r.name}” dejará de aplicarse. Los movimientos ya categorizados no cambian.`,
      confirmText: to ? 'Activar' : 'Desactivar', danger: !to,
    }))) return;
    try {
      await new Promise<void>((ok, bad) => this.api.patch(`/bank-rules/${r.id}`, { active: to }).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok(to ? 'Regla activada.' : 'Regla desactivada.');
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
