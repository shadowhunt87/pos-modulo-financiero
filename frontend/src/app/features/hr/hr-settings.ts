import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { ComboOption, ErrorNotice, FieldHelp, UI } from '../../shared/ui';
import { CONCEPT_KIND, Department, PayrollConcept } from './types';

type AccountKey = 'salaryExpenseAccountId' | 'employerContributionsExpenseAccountId' | 'salariesPayableAccountId' | 'tssPayableAccountId' | 'isrPayableAccountId' | 'otherDeductionsPayableAccountId';
const ACCOUNTS: { key: AccountKey; label: string; hint: string; types: string[] }[] = [
  { key: 'salaryExpenseAccountId', label: 'Gasto de sueldos', hint: 'Gasto. Recibe el salario y los ingresos sin cuenta propia.', types: ['EXPENSE'] },
  { key: 'employerContributionsExpenseAccountId', label: 'Gasto de aportes patronales', hint: 'Gasto. AFP, SFS y riesgos laborales del empleador, e INFOTEP.', types: ['EXPENSE'] },
  { key: 'salariesPayableAccountId', label: 'Sueldos por pagar', hint: 'Pasivo. El neto que se debe a los empleados hasta pagarlo.', types: ['LIABILITY'] },
  { key: 'tssPayableAccountId', label: 'TSS por pagar', hint: 'Pasivo. Aportes del empleado y del empleador, e INFOTEP.', types: ['LIABILITY'] },
  { key: 'isrPayableAccountId', label: 'ISR retenido por pagar', hint: 'Pasivo. El ISR de los asalariados que se declara en el IR-3.', types: ['LIABILITY'] },
  { key: 'otherDeductionsPayableAccountId', label: 'Otros descuentos', hint: 'Pasivo o activo. Para descuentos sin cuenta propia.', types: ['LIABILITY', 'ASSET'] },
];
type SettingsResponse = Record<AccountKey, { accountId: string } | null> & { srlRate: string | null };

/** Configuración de nómina (P3): cuentas del asiento, tasa de riesgos laborales, departamentos y conceptos. */
@Component({
  selector: 'app-hr-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Configuración de nómina</h1><p class="sub">Las cuentas del asiento de nómina, la tasa de riesgos laborales de tu empresa, los departamentos y los conceptos de ingresos y descuentos.</p></div>
      </div>
      <app-error-notice [error]="error()" />

      <form [formGroup]="form" (ngSubmit)="saveSettings()" novalidate>
        <section class="panel" style="margin-bottom:16px">
          <div class="panel-head"><h2>Cuentas contables</h2></div>
          <div class="panel-pad form-grid">
            @for (f of accounts; track f.key) {
              <div class="field span-2"><label [for]="'s-' + f.key">{{ f.label }}</label>
                <app-combobox [id]="'s-' + f.key" [formControlName]="f.key" [options]="optionsFor(f.types)" placeholder="Sin definir" />
                <span class="hint">{{ f.hint }}</span></div>
            }
            <div class="field"><label for="s-srl">Riesgos laborales (%) <app-field-help key="nomina.srl" text="La tasa del Seguro de Riesgos Laborales que la TSS le asignó a tu empresa según su actividad (entre 1.10 % y 1.30 %). Si la dejas vacía se usa la tasa base de Valores fiscales." /></label>
              <input id="s-srl" class="input num" type="number" min="0" max="10" step="0.01" formControlName="srlRate" placeholder="Tasa base" /></div>
          </div>
          @if (settingsError()) { <app-error-notice style="display:block;margin:0 16px 12px" [error]="settingsError()" /> }
          <div class="btn-row" style="padding:0 16px 16px"><button type="submit" class="btn btn-primary" [disabled]="saving() || form.pristine">{{ saving() ? 'Guardando…' : 'Guardar cuentas' }}</button></div>
        </section>
      </form>

      <section class="panel" style="margin-bottom:16px">
        <div class="panel-head"><h2>Departamentos</h2></div>
        <div class="panel-pad">
          <form class="toolbar" [formGroup]="depForm" (ngSubmit)="addDepartment()" novalidate>
            <div class="field wide"><label for="d-name">Nuevo departamento</label><input id="d-name" class="input" formControlName="name" placeholder="Taller, Administración…" /></div>
            <button type="submit" class="btn" style="align-self:end">Agregar</button>
          </form>
          <ul class="plain">
            @for (d of departments(); track d.id) {
              <li><span [class.dim]="!d.active">{{ d.name }}</span> <span class="dim">· {{ d._count?.employees ?? 0 }} {{ (d._count?.employees ?? 0) === 1 ? 'empleado' : 'empleados' }}</span>
                <button type="button" class="btn btn-ghost btn-sm" (click)="toggleDepartment(d)">{{ d.active ? 'Desactivar' : 'Activar' }}</button></li>
            } @empty { <li class="dim">Sin departamentos. Son opcionales: sirven para agrupar empleados.</li> }
          </ul>
        </div>
      </section>

      <section class="panel">
        <div class="panel-head"><h2>Conceptos de ingresos y descuentos</h2><button type="button" class="btn btn-sm" (click)="openConcept(null)">Nuevo concepto</button></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Cotiza TSS</th><th>Paga ISR</th><th>Cuenta</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (c of concepts(); track c.id) {
                <tr>
                  <td class="mono">{{ c.code }}</td><td>{{ c.name }}</td><td>{{ c.kind | lbl: CONCEPT_KIND }}</td>
                  <td>{{ c.kind === 'EARNING' ? (c.affectsTss ? 'Sí' : 'No') : '—' }}</td><td>{{ c.kind === 'EARNING' ? (c.affectsIsr ? 'Sí' : 'No') : '—' }}</td>
                  <td>{{ c.account ? c.account.code + ' · ' + c.account.name : 'La de la configuración' }}</td>
                  <td><span class="badge" [class.pos]="c.active">{{ c.active ? 'Activo' : 'Inactivo' }}</span></td>
                  <td class="actions"><button type="button" class="btn btn-ghost btn-sm" (click)="openConcept(c)">Editar</button></td>
                </tr>
              } @empty { <tr><td colspan="8"><p class="dim" style="padding:12px">Sin conceptos. Ejemplos: horas extra (ingreso que cotiza y paga ISR), comisión, préstamo o adelanto (descuentos).</p></td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="conceptOpen()" [title]="editingConcept() ? 'Editar concepto' : 'Nuevo concepto'" width="620px" (closed)="conceptOpen.set(false)">
      <form id="concept-form" [formGroup]="conceptForm" (ngSubmit)="saveConcept()" novalidate>
        <div class="form-grid">
          <div class="field"><label for="c-code">Código</label><input id="c-code" class="input mono" formControlName="code" placeholder="HE" /></div>
          <div class="field span-2"><label for="c-name">Nombre</label><input id="c-name" class="input" formControlName="name" placeholder="Horas extra" /></div>
          <div class="field"><label for="c-kind">Tipo</label>
            <select id="c-kind" class="select" formControlName="kind"><option value="EARNING">Ingreso</option><option value="DEDUCTION">Descuento</option></select></div>
          @if (earning()) {
            <label class="check"><input type="checkbox" formControlName="affectsTss" /> Cotiza a la TSS</label>
            <label class="check"><input type="checkbox" formControlName="affectsIsr" /> Paga ISR</label>
          }
          <div class="field span-all"><label for="c-acc">Cuenta (opcional)</label>
            <app-combobox id="c-acc" formControlName="accountId" [options]="optionsFor(earning() ? ['EXPENSE'] : ['LIABILITY', 'ASSET'])" placeholder="La de la configuración" />
            <span class="hint">{{ earning() ? 'Gasto donde se registra este ingreso.' : 'Por pagar a un tercero (pasivo) o préstamo al empleado que se cobra (activo).' }}</span></div>
          @if (editingConcept()) { <label class="check span-all"><input type="checkbox" formControlName="active" /> Activo</label> }
        </div>
        @if (conceptError()) { <app-error-notice style="display:block;margin-top:12px" [error]="conceptError()" /> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="conceptOpen.set(false)">Cancelar</button>
        <button type="submit" form="concept-form" class="btn btn-primary">Guardar</button>
      </ng-container>
    </app-modal>
  `,
  styles: `.plain { list-style: none; padding: 0; margin: 12px 0 0; } .plain li { display: flex; align-items: center; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--line); }`,
})
export class HrSettings {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);

  protected readonly accounts = ACCOUNTS;
  protected readonly CONCEPT_KIND = CONCEPT_KIND;
  protected readonly error = signal('');
  protected readonly saving = signal(false);
  protected readonly settingsError = signal<unknown>('');
  protected readonly departments = signal<Department[]>([]);
  protected readonly concepts = signal<PayrollConcept[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    salaryExpenseAccountId: [null as string | null], employerContributionsExpenseAccountId: [null as string | null],
    salariesPayableAccountId: [null as string | null], tssPayableAccountId: [null as string | null],
    isrPayableAccountId: [null as string | null], otherDeductionsPayableAccountId: [null as string | null],
    srlRate: [null as number | null],
  });
  protected readonly depForm = this.fb.nonNullable.group({ name: ['', [Validators.required, Validators.maxLength(100)]] });

  protected readonly conceptOpen = signal(false);
  protected readonly editingConcept = signal<PayrollConcept | null>(null);
  protected readonly conceptError = signal<unknown>('');
  protected readonly conceptForm = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9._-]{1,20}$/)]], name: ['', [Validators.required, Validators.maxLength(100)]],
    kind: ['EARNING'], affectsTss: [false], affectsIsr: [false], accountId: [null as string | null], active: [true],
  });
  private readonly kindSig = toSignal(this.conceptForm.controls.kind.valueChanges, { initialValue: 'EARNING' });
  protected readonly earning = computed(() => this.kindSig() === 'EARNING');

  constructor() { void this.init(); }

  protected optionsFor(types: string[]): ComboOption[] {
    return this.lookups.accounts().filter((a) => a.active && a.isPostable && types.includes(a.type)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
  }

  private async init(): Promise<void> {
    try {
      const [s] = await Promise.all([this.api.getP<SettingsResponse>('/hr/payroll-settings'), this.lookups.ensureAccounts(), this.reloadLists()]);
      const v: Record<string, unknown> = { srlRate: s.srlRate === null ? null : Number(s.srlRate) };
      for (const f of ACCOUNTS) v[f.key] = s[f.key]?.accountId ?? null;
      this.form.patchValue(v); this.form.markAsPristine();
    } catch (e) { this.error.set(errorMessage(e)); }
  }

  private async reloadLists(): Promise<void> {
    const [d, c] = await Promise.all([this.api.getP<Department[]>('/hr/departments'), this.api.getP<PayrollConcept[]>('/hr/payroll-concepts')]);
    this.departments.set(d); this.concepts.set(c);
  }

  protected async saveSettings(): Promise<void> {
    this.saving.set(true); this.settingsError.set('');
    const v = this.form.getRawValue();
    try {
      await firstValueFrom(this.api.put('/hr/payroll-settings', { ...v, srlRate: v.srlRate === null || String(v.srlRate) === '' ? null : Number(v.srlRate) }));
      this.notify.ok('Configuración de nómina guardada.'); this.form.markAsPristine();
    } catch (e) { this.settingsError.set(e); }
    this.saving.set(false);
  }

  protected async addDepartment(): Promise<void> {
    if (this.depForm.invalid) return;
    try {
      await firstValueFrom(this.api.post('/hr/departments', { name: this.depForm.getRawValue().name.trim() }));
      this.depForm.reset(); await this.reloadLists();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

  protected async toggleDepartment(d: Department): Promise<void> {
    try { await firstValueFrom(this.api.patch(`/hr/departments/${d.id}`, { active: !d.active })); await this.reloadLists(); }
    catch (e) { this.notify.error(errorMessage(e)); }
  }

  protected openConcept(c: PayrollConcept | null): void {
    this.editingConcept.set(c); this.conceptError.set('');
    this.conceptForm.reset(c
      ? { code: c.code, name: c.name, kind: c.kind, affectsTss: c.affectsTss, affectsIsr: c.affectsIsr, accountId: c.accountId, active: c.active }
      : { kind: 'EARNING', affectsTss: false, affectsIsr: false, accountId: null, active: true });
    if (c) { this.conceptForm.controls.code.disable(); this.conceptForm.controls.kind.disable(); }
    else { this.conceptForm.controls.code.enable(); this.conceptForm.controls.kind.enable(); }
    this.conceptOpen.set(true);
  }

  protected async saveConcept(): Promise<void> {
    this.conceptForm.markAllAsTouched();
    if (this.conceptForm.invalid) { this.conceptError.set('Escribe el código (sin espacios) y el nombre.'); return; }
    const v = this.conceptForm.getRawValue();
    const earning = v.kind === 'EARNING';
    const cur = this.editingConcept();
    try {
      if (cur) {
        await firstValueFrom(this.api.patch(`/hr/payroll-concepts/${cur.id}`, {
          name: v.name.trim(), accountId: v.accountId ?? null, active: v.active, ...(earning ? { affectsTss: v.affectsTss, affectsIsr: v.affectsIsr } : {}),
        }));
      } else {
        await firstValueFrom(this.api.post('/hr/payroll-concepts', {
          code: v.code.trim(), name: v.name.trim(), kind: v.kind, ...(v.accountId ? { accountId: v.accountId } : {}),
          ...(earning ? { affectsTss: v.affectsTss, affectsIsr: v.affectsIsr } : {}),
        }));
      }
      this.notify.ok('Concepto guardado.'); this.conceptOpen.set(false); await this.reloadLists();
    } catch (e) { this.conceptError.set(e); }
  }
}
