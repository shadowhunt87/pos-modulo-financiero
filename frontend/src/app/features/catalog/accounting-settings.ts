import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { ComboOption, UI } from '../../shared/ui';

type Key =
  | 'receivableAccountId' | 'payableAccountId' | 'salesIncomeAccountId' | 'purchaseExpenseAccountId' | 'salesDiscountAccountId'
  | 'customerAdvanceAccountId' | 'supplierAdvanceAccountId' | 'retainedEarningsAccountId' | 'currentYearResultAccountId'
  | 'fxGainAccountId' | 'fxLossAccountId' | 'roundingAccountId';

interface Field { key: Key; label: string; hint: string; types: string[] }
interface Group { title: string; fields: Field[] }

/** Tipos de cuenta permitidos por el backend para cada configuración. */
const GROUPS: Group[] = [
  { title: 'Ventas y cobros', fields: [
    { key: 'receivableAccountId', label: 'Cuentas por cobrar', hint: 'Activo. Se debita al emitir facturas de venta.', types: ['ASSET'] },
    { key: 'salesIncomeAccountId', label: 'Ingresos por ventas', hint: 'Ingreso. Se usa cuando la línea de factura no trae cuenta.', types: ['INCOME'] },
    { key: 'salesDiscountAccountId', label: 'Descuentos en ventas', hint: 'Ingreso o gasto.', types: ['INCOME', 'EXPENSE'] },
    { key: 'customerAdvanceAccountId', label: 'Anticipos de clientes', hint: 'Pasivo. Cobros recibidos sin factura.', types: ['LIABILITY'] },
  ] },
  { title: 'Compras y pagos', fields: [
    { key: 'payableAccountId', label: 'Cuentas por pagar', hint: 'Pasivo. Se acredita al emitir facturas de compra.', types: ['LIABILITY'] },
    { key: 'purchaseExpenseAccountId', label: 'Gastos de compras', hint: 'Gasto o activo. Se usa cuando la línea no trae cuenta.', types: ['EXPENSE', 'ASSET'] },
    { key: 'supplierAdvanceAccountId', label: 'Anticipos a proveedores', hint: 'Activo. Pagos hechos sin factura.', types: ['ASSET'] },
  ] },
  { title: 'Patrimonio y cierre de año', fields: [
    { key: 'retainedEarningsAccountId', label: 'Utilidades retenidas', hint: 'Patrimonio. Recibe el resultado al cerrar el año.', types: ['EQUITY'] },
    { key: 'currentYearResultAccountId', label: 'Resultado del ejercicio', hint: 'Patrimonio. Cuenta puente del cierre.', types: ['EQUITY'] },
  ] },
  { title: 'Diferencias cambiarias y redondeo', fields: [
    { key: 'fxGainAccountId', label: 'Ganancia cambiaria', hint: 'Ingreso.', types: ['INCOME'] },
    { key: 'fxLossAccountId', label: 'Pérdida cambiaria', hint: 'Gasto.', types: ['EXPENSE'] },
    { key: 'roundingAccountId', label: 'Redondeo', hint: 'Ingreso o gasto.', types: ['INCOME', 'EXPENSE'] },
  ] },
];
const KEYS = GROUPS.flatMap((g) => g.fields.map((f) => f.key));

type SettingsResponse = { requireEntryApproval: boolean } & Record<Key, { accountId: string } | null>;

@Component({
  selector: 'app-accounting-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Configuración contable</h1><p class="sub">Cuentas por defecto que usa el sistema al contabilizar facturas, pagos y el cierre de año.</p></div>
      </div>
      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      @if (!canEdit) { <div class="notice info" role="status">Solo un administrador puede cambiar esta configuración.</div> }
      @if (loading()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
      @else {
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          @for (g of groups; track g.title) {
            <section class="panel" style="margin-bottom:16px">
              <div class="panel-head"><h2>{{ g.title }}</h2></div>
              <div class="panel-pad form-grid">
                @for (f of g.fields; track f.key) {
                  <div class="field span-2">
                    <label [for]="'s-' + f.key">{{ f.label }}</label>
                    <app-combobox [id]="'s-' + f.key" [formControlName]="f.key" [options]="optionsFor(f)" placeholder="Sin definir" />
                    <span class="hint">{{ f.hint }}</span>
                  </div>
                }
              </div>
            </section>
          }
          <section class="panel" style="margin-bottom:16px">
            <div class="panel-head"><h2>Asientos manuales</h2></div>
            <div class="panel-pad">
              <label class="check"><input type="checkbox" formControlName="requireEntryApproval" /> Los asientos manuales requieren aprobación</label>
              <p class="hint">Si lo activas, los asientos nuevos quedan pendientes hasta que un aprobador los contabilice.</p>
            </div>
          </section>
          @if (formError()) { <div class="notice neg" role="alert">{{ formError() }}</div> }
          @if (canEdit) {
            <div class="btn-row"><button type="submit" class="btn btn-primary" [disabled]="saving() || form.pristine">{{ saving() ? 'Guardando…' : 'Guardar configuración' }}</button></div>
          }
        </form>
      }
    </div>
  `,
})
export class AccountingSettings {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);

  protected readonly groups = GROUPS;
  protected readonly canEdit = inject(Auth).has('ADMIN');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly formError = signal('');

  protected readonly form = this.fb.nonNullable.group({
    receivableAccountId: [null as string | null], payableAccountId: [null as string | null], salesIncomeAccountId: [null as string | null],
    purchaseExpenseAccountId: [null as string | null], salesDiscountAccountId: [null as string | null], customerAdvanceAccountId: [null as string | null],
    supplierAdvanceAccountId: [null as string | null], retainedEarningsAccountId: [null as string | null], currentYearResultAccountId: [null as string | null],
    fxGainAccountId: [null as string | null], fxLossAccountId: [null as string | null], roundingAccountId: [null as string | null],
    requireEntryApproval: [false],
  });

  private readonly postable = computed(() => this.lookups.accounts().filter((a) => a.active && a.isPostable));

  constructor() {
    void this.init();
    if (!this.canEdit) this.form.disable();
  }

  protected optionsFor(f: Field): ComboOption[] {
    return this.postable().filter((a) => f.types.includes(a.type)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
  }

  private async init(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [s] = await Promise.all([this.api.getP<SettingsResponse>('/settings/accounting'), this.lookups.ensureAccounts()]);
      const v: Record<string, string | boolean | null> = { requireEntryApproval: s.requireEntryApproval };
      for (const k of KEYS) v[k] = s[k]?.accountId ?? null;
      this.form.patchValue(v);
      this.form.markAsPristine();
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected async save(): Promise<void> {
    if (this.saving() || !this.canEdit) return;
    this.saving.set(true); this.formError.set('');
    try {
      await firstValueFrom(this.api.put('/settings/accounting', this.form.getRawValue()));
      this.notify.ok('Configuración contable guardada.');
      this.form.markAsPristine();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }
}
