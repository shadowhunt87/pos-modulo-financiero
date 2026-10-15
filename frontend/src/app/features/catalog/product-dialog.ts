import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Lookups } from '../../core/lookups';
import { Product } from '../../core/models';
import { Notify } from '../../core/notify';
import { ComboOption, ErrorNotice, FieldHelp, UI } from '../../shared/ui';

/**
 * Alta y edición de un producto o servicio del catálogo (P1), con sus datos de inventario (P2) si es un bien.
 * POST /products y PATCH /products/:id. Al guardar emite `saved` con lo que devolvió la API.
 */
@Component({
  selector: 'app-product-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ErrorNotice, FieldHelp, ...UI],
  styles: `.group { font-size: 13px; font-weight: 600; color: var(--text-dim); margin: 8px 0 -4px; border-top: 1px solid var(--line); padding-top: 12px; }`,
  template: `
    <app-modal [open]="open()" [title]="product() ? 'Editar producto o servicio' : 'Nuevo producto o servicio'" width="760px" (closed)="closed.emit()">
      <form id="product-form" [formGroup]="form" (ngSubmit)="save()" (submit)="$event.stopPropagation()" novalidate>
        <div class="form-grid">
          <div class="field"><label for="p-code">Código</label><input id="p-code" class="input mono" formControlName="code" placeholder="ACE-001" />
            @if (form.controls.code.touched && form.controls.code.invalid) { <span class="error-text">Hasta 40 letras o números, sin espacios.</span> }</div>
          <div class="field span-2"><label for="p-name">Nombre</label><input id="p-name" class="input" formControlName="name" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe el nombre.</span> }</div>
          <div class="field"><label for="p-kind">Tipo</label>
            <select id="p-kind" class="select" formControlName="kind"><option value="SERVICE">Servicio</option><option value="GOODS">Bien (mercancía)</option></select></div>
          <div class="field"><label for="p-unit">Unidad</label><input id="p-unit" class="input" formControlName="unit" placeholder="UND, HORA, GAL…" /></div>
          <div class="field span-all"><label for="p-desc">Descripción (opcional)</label><input id="p-desc" class="input" formControlName="description" /></div>

          <h3 class="span-all group">Venta</h3>
          <div class="field"><label for="p-sp">Precio de venta</label><input id="p-sp" class="input num" type="number" min="0" step="any" formControlName="salePrice" /></div>
          <div class="field"><label for="p-st">Impuesto de venta</label>
            <select id="p-st" class="select" formControlName="saleTaxRateId"><option value="">Sin impuesto</option>
              @for (t of saleTaxes(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }</select></div>
          <div class="field"><label for="p-ia">Cuenta de ingreso <app-field-help key="producto.cuentaIngreso" text="Dónde se registra la venta de este producto. Si la dejas vacía se usa la cuenta de ingresos de Configuración contable." /></label>
            <app-combobox id="p-ia" formControlName="incomeAccountId" [options]="accountsOf(['INCOME'])" placeholder="La de Configuración contable" /></div>

          <h3 class="span-all group">Compra</h3>
          <div class="field"><label for="p-pp">Costo de compra (referencia)</label><input id="p-pp" class="input num" type="number" min="0" step="any" formControlName="purchasePrice" /></div>
          <div class="field"><label for="p-pt">Impuesto de compra</label>
            <select id="p-pt" class="select" formControlName="purchaseTaxRateId"><option value="">Sin impuesto</option>
              @for (t of purchaseTaxes(); track t.id) { <option [value]="t.id">{{ t.name }}</option> }</select></div>
          <div class="field"><label for="p-ea">Cuenta de gasto o costo</label>
            <app-combobox id="p-ea" formControlName="expenseAccountId" [options]="accountsOf(['EXPENSE', 'ASSET'])" placeholder="La de Configuración contable" /></div>

          @if (isGoods()) {
            <h3 class="span-all group">Inventario</h3>
            <label class="check span-all"><input type="checkbox" formControlName="tracksInventory" /> Controlar existencias (inventario)
              <app-field-help key="producto.inventario" text="El sistema lleva cuántas unidades tienes y cuánto valen (costo promedio). Las compras suman, las ventas restan y no deja vender si no hay. Cada venta registra su costo de ventas." /></label>
            @if (form.controls.tracksInventory.value) {
              <div class="field"><label for="p-inv">Cuenta de inventario</label>
                <app-combobox id="p-inv" formControlName="inventoryAccountId" [options]="accountsOf(['ASSET'])" placeholder="La de Configuración contable" /></div>
              <div class="field"><label for="p-cogs">Cuenta de costo de ventas</label>
                <app-combobox id="p-cogs" formControlName="cogsAccountId" [options]="accountsOf(['EXPENSE'])" placeholder="La de Configuración contable" /></div>
            }
          }
        </div>
        @if (formError()) { <app-error-notice style="display:block;margin-top:14px" [error]="formError()" /> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
        <button type="submit" form="product-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class ProductDialog {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);

  readonly open = input(false);
  readonly product = input<Product | null>(null);
  readonly saved = output<Product>();
  readonly closed = output<void>();

  protected readonly saving = signal(false);
  protected readonly formError = signal<unknown>('');
  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9._-]{1,40}$/)]], name: ['', [Validators.required, Validators.maxLength(200)]],
    description: [''], kind: ['SERVICE'], unit: ['UND', Validators.required],
    salePrice: [null as number | null], purchasePrice: [null as number | null], saleTaxRateId: [''], purchaseTaxRateId: [''],
    incomeAccountId: [null as string | null], expenseAccountId: [null as string | null],
    tracksInventory: [false], inventoryAccountId: [null as string | null], cogsAccountId: [null as string | null],
  });
  private readonly kind = toSignal(this.form.controls.kind.valueChanges, { initialValue: 'SERVICE' });
  protected readonly isGoods = computed(() => this.kind() === 'GOODS');
  protected readonly saleTaxes = computed(() => this.lookups.taxRates().filter((t) => t.active && !t.isWithholding && t.appliesTo !== 'PURCHASES'));
  protected readonly purchaseTaxes = computed(() => this.lookups.taxRates().filter((t) => t.active && !t.isWithholding && t.appliesTo !== 'SALES'));

  constructor() {
    void this.lookups.ensureAccounts(); void this.lookups.ensureTaxRates();
    effect(() => {
      if (!this.open()) return;
      const p = this.product();
      untracked(() => this.fill(p));
    });
    this.form.controls.kind.valueChanges.subscribe((k) => { if (k !== 'GOODS') this.form.controls.tracksInventory.setValue(false); });
  }

  protected accountsOf(types: string[]): ComboOption[] {
    return this.lookups.accounts().filter((a) => a.active && a.isPostable && types.includes(a.type)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
  }

  private fill(p: Product | null): void {
    this.formError.set('');
    if (!p) { this.form.reset({ kind: 'SERVICE', unit: 'UND', tracksInventory: false }); this.form.controls.code.enable(); return; }
    this.form.reset({
      code: p.code, name: p.name, description: p.description ?? '', kind: p.kind, unit: p.unit,
      salePrice: p.salePrice === null ? null : Number(p.salePrice), purchasePrice: p.purchasePrice === null ? null : Number(p.purchasePrice),
      saleTaxRateId: p.saleTaxRateId ?? '', purchaseTaxRateId: p.purchaseTaxRateId ?? '',
      incomeAccountId: p.incomeAccountId, expenseAccountId: p.expenseAccountId,
      tracksInventory: p.tracksInventory, inventoryAccountId: p.inventoryAccountId, cogsAccountId: p.cogsAccountId,
    });
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const cur = this.product();
    const num = (x: number | null) => (x === null || String(x) === '' ? null : Number(x));
    const id = (x: string | null) => (x ? x : null);
    // Al crear se omiten los vacíos; al editar, null quita el valor
    const body: Record<string, unknown> = {
      code: v.code.trim(), name: v.name.trim(), description: v.description.trim() || null, kind: v.kind, unit: v.unit.trim(),
      salePrice: num(v.salePrice), purchasePrice: num(v.purchasePrice), saleTaxRateId: id(v.saleTaxRateId), purchaseTaxRateId: id(v.purchaseTaxRateId),
      incomeAccountId: id(v.incomeAccountId), expenseAccountId: id(v.expenseAccountId), tracksInventory: v.kind === 'GOODS' && v.tracksInventory,
      inventoryAccountId: v.tracksInventory ? id(v.inventoryAccountId) : null, cogsAccountId: v.tracksInventory ? id(v.cogsAccountId) : null,
    };
    if (!cur) for (const k of Object.keys(body)) if (body[k] === null) delete body[k];
    try {
      const res = await firstValueFrom(cur ? this.api.patch<Product>(`/products/${cur.id}`, body) : this.api.post<Product>('/products', body));
      this.notify.ok(cur ? 'Producto actualizado.' : 'Producto creado.');
      await this.lookups.ensureProducts(true);
      this.saved.emit(res);
    } catch (e) { this.formError.set(e); }
    this.saving.set(false);
  }
}
