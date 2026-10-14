import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean, dec } from '../../shared/format';
import { ComboOption, UI } from '../../shared/ui';
import { CashRegisterRow, UserLite } from './types';

/** Pestaña "Cajas": cajas de efectivo con su saldo en libros (solo administradores escriben). */
@Component({
  selector: 'app-cash-registers-tab',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ...UI],
  template: `
    <div class="toolbar">
      <div class="field"><label for="cr-act">Estado</label>
        <select id="cr-act" class="select" (change)="onlyActive.set($any($event.target).value === 'true')">
          <option value="true">Activas</option><option value="">Todas</option>
        </select></div>
      <div class="grow"></div>
      @if (canAdmin) { <button type="button" class="btn btn-primary" (click)="openNew()">Nueva caja</button> }
    </div>
    <app-error-notice [error]="error()" />
    <section class="panel">
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>Caja</th><th>Responsable</th><th>Moneda</th><th>Cuenta contable</th><th class="num">Saldo en libros</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
            @for (c of visible(); track c.id) {
              <tr>
                <td><strong>{{ c.name }}</strong></td>
                <td>{{ userName(c.custodianId) }}</td>
                <td>{{ c.currency }}</td>
                <td>{{ accountName(c.glAccountId) }}</td>
                <td class="num" [class]="c.glBalance | signClass">{{ c.glBalance | money }}</td>
                <td><span class="badge" [class.pos]="c.active">{{ c.active ? 'Activa' : 'Inactiva' }}</span></td>
                <td class="actions">
                  @if (canAdmin) {
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(c)">Editar</button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(c)">{{ c.active ? 'Desactivar' : 'Activar' }}</button>
                  }
                </td>
              </tr>
            } @empty {
              @if (!loading()) { <tr><td colspan="7"><app-empty-state title="No hay cajas" text="Una caja registra el efectivo que entra y sale del negocio." actionLabel="Nueva caja" (action)="openNew()" [canAct]="canAdmin" /></td></tr> }
            }
          </tbody>
        </table>
      </div>
    </section>

    <app-modal [open]="modalOpen()" [title]="editing() ? 'Editar caja' : 'Nueva caja'" width="620px" (closed)="modalOpen.set(false)">
      <form id="cash-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="c-name">Nombre</label><input id="c-name" class="input" formControlName="name" placeholder="Caja chica" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe el nombre de la caja.</span> }</div>
          @if (!editing()) {
            <div class="field"><label for="c-cur">Moneda</label><input id="c-cur" class="input mono" formControlName="currency" maxlength="3" placeholder="DOP" />
              @if (form.controls.currency.invalid) { <span class="error-text">Usa 3 letras mayúsculas, por ejemplo DOP.</span> }</div>
            <div class="field"><label for="c-open">Saldo inicial (informativo)</label><input id="c-open" class="input num" type="number" step="0.01" formControlName="openingBalance" /></div>
            <div class="field span-2"><label for="c-gl">Cuenta contable (activo)</label>
              <app-combobox id="c-gl" formControlName="glAccountId" [options]="glOptions()" placeholder="Busca por código o nombre" [clearable]="false" />
              @if (form.controls.glAccountId.touched && form.controls.glAccountId.invalid) { <span class="error-text">Elige la cuenta contable de la caja.</span> }
              <span class="hint">Solo aparecen cuentas de activo activas que no usa otro banco o caja.</span></div>
          }
          <div class="field span-2"><label for="c-cust">Responsable</label>
            <app-combobox id="c-cust" formControlName="custodianId" [options]="userOptions()" placeholder="Sin responsable" />
          </div>
          @if (editing()) { <label class="check span-all"><input type="checkbox" formControlName="active" /> Caja activa</label> }
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="cash-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class CashRegistersTab {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);

  protected readonly canAdmin = inject(Auth).has('ADMIN');
  protected readonly rows = signal<CashRegisterRow[]>([]);
  protected readonly users = signal<UserLite[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly onlyActive = signal(true);
  protected readonly visible = computed(() => (this.onlyActive() ? this.rows().filter((r) => r.active) : this.rows()));
  private readonly usedGl = signal<Set<string>>(new Set());
  protected readonly glOptions = computed<ComboOption[]>(() =>
    this.lookups.accounts()
      .filter((a) => a.type === 'ASSET' && a.active && a.isPostable && !this.usedGl().has(a.id))
      .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })));
  protected readonly userOptions = computed<ComboOption[]>(() => this.users().filter((u) => u.active).map((u) => ({ value: u.id, label: u.name, hint: u.email })));

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<CashRegisterRow | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]], currency: ['', Validators.pattern(/^[A-Z]{3}$/)],
    glAccountId: ['', Validators.required], custodianId: [''], openingBalance: [null as number | null], active: [true],
  });

  constructor() {
    void this.lookups.ensureAccounts();
    void this.load();
  }

  protected accountName(id: string | null): string { return this.lookups.accountName(id); }
  protected userName(id: string | null): string { return this.users().find((u) => u.id === id)?.name ?? ''; }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [cash, banks] = await Promise.all([this.api.getP<CashRegisterRow[]>('/cash-registers'), this.api.getP<{ glAccountId: string | null }[]>('/bank-accounts')]);
      this.rows.set(cash);
      this.usedGl.set(new Set([...banks, ...cash].map((x) => x.glAccountId).filter((x): x is string => !!x)));
      // La lista de usuarios solo la puede leer un administrador (es quien asigna responsables).
      if (this.canAdmin && !this.users().length) this.users.set(await this.api.getAll<UserLite>('/users'));
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.editing.set(null); this.formError.set('');
    this.form.reset({ active: true });
    this.modalOpen.set(true);
  }
  protected openEdit(c: CashRegisterRow): void {
    this.editing.set(c); this.formError.set('');
    this.form.reset({ name: c.name, glAccountId: c.glAccountId ?? '', custodianId: c.custodianId ?? '', active: c.active });
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    const cur = this.editing();
    this.form.markAllAsTouched();
    const c = this.form.controls;
    const invalid = cur ? c.name.invalid : this.form.invalid;
    if (invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    try {
      if (cur) {
        const body = { name: v.name.trim(), custodianId: v.custodianId || null, active: v.active };
        await new Promise<void>((ok, bad) => this.api.patch(`/cash-registers/${cur.id}`, body).subscribe({ next: () => ok(), error: bad }));
      } else {
        const body = clean({
          name: v.name.trim(), currency: v.currency, glAccountId: v.glAccountId, custodianId: v.custodianId,
          openingBalance: v.openingBalance === null ? '' : Number(v.openingBalance),
        });
        await new Promise<void>((ok, bad) => this.api.post('/cash-registers', body).subscribe({ next: () => ok(), error: bad }));
      }
      this.notify.ok(cur ? 'Caja actualizada.' : 'Caja creada.');
      this.modalOpen.set(false);
      void this.lookups.ensureCashRegisters(true);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async toggle(c: CashRegisterRow): Promise<void> {
    const to = !c.active;
    const saldo = dec(c.glBalance);
    if (!(await this.confirm.ask({
      title: to ? 'Activar caja' : 'Desactivar caja',
      message: to ? `${c.name} volverá a estar disponible en transferencias y pagos.`
        : `${c.name} dejará de aparecer en transferencias y pagos.${saldo.isZero() ? '' : ' Todavía tiene saldo en libros; transfiérelo antes si hace falta.'}`,
      confirmText: to ? 'Activar' : 'Desactivar', danger: !to,
    }))) return;
    try {
      await new Promise<void>((ok, bad) => this.api.patch(`/cash-registers/${c.id}`, { active: to }).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok(to ? 'Caja activada.' : 'Caja desactivada.');
      void this.lookups.ensureCashRegisters(true);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
