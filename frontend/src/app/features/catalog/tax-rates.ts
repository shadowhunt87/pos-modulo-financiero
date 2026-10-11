import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { TaxRate } from '../../core/models';
import { Notify } from '../../core/notify';
import { clean } from '../../shared/format';
import { opts, TAX_APPLIES, TAX_TYPE } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';

@Component({
  selector: 'app-tax-rates',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Impuestos</h1><p class="sub">Tasas de ITBIS, retenciones y otros impuestos que se aplican en facturas.</p></div>
        @if (canEdit) { <button type="button" class="btn btn-primary" (click)="openNew()">Nuevo impuesto</button> }
      </div>

      <div class="toolbar">
        <div class="field"><label for="type">Tipo</label>
          <select id="type" class="select" (change)="type.set($any($event.target).value)">
            <option value="">Todos</option>@for (o of typeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
        <div class="field"><label for="act">Estado</label>
          <select id="act" class="select" (change)="active.set($any($event.target).value)">
            <option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option>
          </select></div>
      </div>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Tipo</th><th class="num">Tasa</th><th>Aplica a</th><th>Código DGII</th><th>Cuenta ventas</th><th>Cuenta compras</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="9"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (t of visible(); track t.id) {
                <tr>
                  <td><strong>{{ t.name }}</strong>@if (t.isWithholding) { <span class="badge info" style="margin-left:6px">Retención</span> }</td>
                  <td>{{ t.type | lbl: TAX_TYPE }}</td>
                  <td class="num">{{ t.rate | pct: 2 }}</td>
                  <td>{{ t.appliesTo | lbl: TAX_APPLIES }}</td>
                  <td class="mono">{{ t.dgiiCode }}</td>
                  <td class="dim">{{ lookups.accountName(t.salesAccountId) }}</td>
                  <td class="dim">{{ lookups.accountName(t.purchaseAccountId) }}</td>
                  <td><span class="badge" [class.pos]="t.active">{{ t.active ? 'Activo' : 'Inactivo' }}</span></td>
                  <td class="actions">
                    @if (canEdit) {
                      <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(t)">Editar</button>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(t)">{{ t.active ? 'Desactivar' : 'Activar' }}</button>
                    }
                  </td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="9" class="table-empty">No hay impuestos con esos filtros.</td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="modalOpen()" [title]="editing() ? 'Editar impuesto' : 'Nuevo impuesto'" width="680px" (closed)="modalOpen.set(false)">
      <form id="tax-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="f-name">Nombre</label><input id="f-name" class="input" formControlName="name" placeholder="ITBIS 18%" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe el nombre.</span> }</div>
          <div class="field"><label for="f-rate">Tasa (%)</label><input id="f-rate" class="input num" type="number" min="0" max="100" step="0.01" formControlName="rate" />
            @if (form.controls.rate.touched && form.controls.rate.invalid) { <span class="error-text">La tasa va de 0 a 100.</span> }</div>
          <div class="field"><label for="f-type">Tipo</label>
            <select id="f-type" class="select" formControlName="type">@for (o of typeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select>
            @if (editing()) { <span class="hint">El tipo no se puede cambiar.</span> }</div>
          <div class="field"><label for="f-app">Aplica a</label>
            <select id="f-app" class="select" formControlName="appliesTo">@for (o of appliesOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
          <div class="field"><label for="f-dgii">Código DGII</label><input id="f-dgii" class="input mono" formControlName="dgiiCode" maxlength="20" /></div>
          <div class="field span-2"><label for="f-sales">Cuenta para ventas</label>
            <app-combobox id="f-sales" formControlName="salesAccountId" [options]="accountOptions()" placeholder="Buscar cuenta" /></div>
          <div class="field span-2"><label for="f-purch">Cuenta para compras</label>
            <app-combobox id="f-purch" formControlName="purchaseAccountId" [options]="accountOptions()" placeholder="Buscar cuenta" /></div>
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="tax-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class TaxRates {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  protected readonly lookups = inject(Lookups);

  protected readonly TAX_TYPE = TAX_TYPE;
  protected readonly TAX_APPLIES = TAX_APPLIES;
  protected readonly typeOptions = opts.taxType;
  protected readonly appliesOptions = opts.taxApplies;
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  protected readonly rows = signal<TaxRate[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly type = signal('');
  protected readonly active = signal('');
  protected readonly visible = computed(() => this.rows().filter((t) => (!this.type() || t.type === this.type()) && (!this.active() || String(t.active) === this.active())));
  protected readonly accountOptions = computed<ComboOption[]>(() => this.lookups.accounts().filter((a) => a.active && a.isPostable).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })));

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<TaxRate | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    rate: [18 as number | null, [Validators.required, Validators.min(0), Validators.max(100)]],
    type: ['ITBIS', Validators.required], appliesTo: ['BOTH'], dgiiCode: [''],
    salesAccountId: [null as string | null], purchaseAccountId: [null as string | null],
  });

  constructor() {
    void this.lookups.ensureAccounts();
    void this.load();
  }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.rows.set(await this.api.getP<TaxRate[]>('/tax-rates')); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.editing.set(null); this.formError.set('');
    this.form.reset({ rate: 18, type: 'ITBIS', appliesTo: 'BOTH', salesAccountId: null, purchaseAccountId: null });
    this.form.controls.type.enable();
    this.modalOpen.set(true);
  }
  protected openEdit(t: TaxRate): void {
    this.editing.set(t); this.formError.set('');
    this.form.reset({
      name: t.name, rate: Number(t.rate), type: t.type, appliesTo: t.appliesTo, dgiiCode: t.dgiiCode ?? '',
      salesAccountId: t.salesAccountId, purchaseAccountId: t.purchaseAccountId,
    });
    this.form.controls.type.disable();
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const cur = this.editing();
    const common = clean({
      name: v.name.trim(), rate: Number(v.rate), appliesTo: v.appliesTo, dgiiCode: v.dgiiCode.trim(),
      salesAccountId: v.salesAccountId, purchaseAccountId: v.purchaseAccountId,
    });
    try {
      if (cur) await firstValueFrom(this.api.patch(`/tax-rates/${cur.id}`, common));
      else await firstValueFrom(this.api.post('/tax-rates', { ...common, type: v.type }));
      this.notify.ok(cur ? 'Impuesto actualizado.' : 'Impuesto creado.');
      this.modalOpen.set(false);
      void this.lookups.ensureTaxRates(true);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async toggle(t: TaxRate): Promise<void> {
    const to = !t.active;
    if (!(await this.confirm.ask({
      title: to ? 'Activar impuesto' : 'Desactivar impuesto',
      message: to ? `${t.name} volverá a aparecer en las facturas.` : `${t.name} dejará de aparecer en las facturas nuevas. Los documentos existentes no cambian.`,
      confirmText: to ? 'Activar' : 'Desactivar', danger: !to,
    }))) return;
    try {
      await firstValueFrom(this.api.patch(`/tax-rates/${t.id}`, { active: to }));
      this.notify.ok(to ? 'Impuesto activado.' : 'Impuesto desactivado.');
      void this.lookups.ensureTaxRates(true);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
