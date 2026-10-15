import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom, map } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { InventoryAdjustment } from '../../core/models';
import { Notify } from '../../core/notify';
import { today } from '../../shared/format';
import { ComboOption, ErrorNotice, FieldHelp, UI } from '../../shared/ui';
import { qty } from './labels';

/** Nuevo ajuste de inventario (P2). POST /inventory/adjustments. Las salidas usan el costo promedio; las entradas, el costo que escribas. */
@Component({
  selector: 'app-adjustment-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ErrorNotice, FieldHelp, ...UI],
  styles: `
    .line { display: grid; gap: 10px 12px; grid-template-columns: minmax(220px, 3fr) 130px 120px 140px minmax(150px, 1.2fr) 36px; align-items: end; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    .line:last-child { border-bottom: 0; }
    @media (max-width: 900px) { .line { grid-template-columns: 1fr 1fr; } .line .prod { grid-column: 1 / -1; } }
  `,
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Nuevo ajuste de inventario</h1><p class="sub">Entradas para la existencia inicial o un sobrante; salidas para faltantes, mermas o daños.</p></div>
        <a class="btn" routerLink="/inventory/adjustments">Cancelar</a>
      </div>
      <app-error-notice [error]="loadError()" />
      @if (!canEdit) { <div class="notice info" role="status">Solo un administrador o un contador registra ajustes.</div> }
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <section class="panel" style="margin-bottom:16px">
          <div class="panel-pad form-grid">
            <div class="field"><label for="a-date">Fecha</label><input id="a-date" class="input" type="date" formControlName="date" /></div>
            <div class="field span-2"><label for="a-reason">Motivo</label><input id="a-reason" class="input" formControlName="reason" placeholder="Existencia inicial, conteo de fin de mes, mercancía dañada…" />
              @if (form.controls.reason.touched && form.controls.reason.invalid) { <span class="error-text">Escribe el motivo.</span> }</div>
            <div class="field span-2"><label for="a-acc">Cuenta de contrapartida <app-field-help key="ajuste.contrapartida" text="La otra cuenta del asiento. Para un faltante o una merma suele ser un gasto; para la existencia inicial, una cuenta de patrimonio o de saldos iniciales. Si la dejas vacía se usa la de Configuración contable." /></label>
              <app-combobox id="a-acc" formControlName="counterAccountId" [options]="counterOptions()" placeholder="La de Configuración contable" /></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Productos</h2><button type="button" class="btn btn-sm" (click)="addLine()">Agregar producto</button></div>
          <div formArrayName="lines">
            @for (l of lines.controls; track l; let i = $index) {
              <div class="line" [formGroupName]="i">
                <div class="field prod"><label [for]="'a-p' + i">Producto</label>
                  <app-combobox [id]="'a-p' + i" formControlName="productId" [options]="productOptions()" placeholder="Busca por código o nombre" />
                  @if (stockOf(raw().lines[i]?.productId); as s) { <span class="hint">Hay {{ s }}</span> }</div>
                <div class="field"><label [for]="'a-d' + i">Tipo</label>
                  <select [id]="'a-d' + i" class="select" formControlName="direction"><option value="IN">Entrada</option><option value="OUT">Salida</option></select></div>
                <div class="field"><label [for]="'a-q' + i">Cantidad</label><input [id]="'a-q' + i" class="input num" type="number" min="0.0001" step="any" formControlName="quantity" /></div>
                <div class="field"><label [for]="'a-c' + i">Costo unitario</label>
                  @if (raw().lines[i]?.direction === 'IN') { <input [id]="'a-c' + i" class="input num" type="number" min="0" step="any" formControlName="unitCost" /> }
                  @else { <div class="dim" style="padding-bottom:8px">Promedio: {{ avgOf(raw().lines[i]?.productId) | money }}</div> }</div>
                <div class="field"><span class="label">Valor estimado</span><div class="num" style="padding-bottom:8px;font-weight:600">{{ estimate(i) | money }}</div></div>
                <button type="button" class="btn btn-ghost btn-icon" [disabled]="lines.length === 1" (click)="lines.removeAt(i)" [attr.aria-label]="'Quitar producto ' + (i + 1)">✕</button>
              </div>
            }
          </div>
          <p class="hint" style="padding:0 16px 12px">Solo aparecen los productos que controlan inventario. El valor final de las salidas lo calcula el sistema con el costo promedio del momento.</p>
        </section>

        @if (formError()) { <app-error-notice style="display:block;margin-top:14px" [error]="formError()" /> }
        @if (canEdit) {
          <div class="btn-row" style="margin-top:16px"><button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Registrar ajuste' }}</button></div>
        }
      </form>
    </div>
  `,
})
export class AdjustmentForm {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly formError = signal<unknown>('');
  protected readonly form = this.fb.nonNullable.group({
    date: [today(), Validators.required],
    reason: ['', [Validators.required, Validators.maxLength(500)]],
    counterAccountId: [null as string | null],
    lines: this.fb.array([this.newLine()]),
  });
  protected get lines() { return this.form.controls.lines; }
  protected readonly raw = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });

  private readonly tracked = computed(() => this.lookups.products().filter((p) => p.tracksInventory));
  protected readonly productOptions = computed<ComboOption[]>(() =>
    this.tracked().filter((p) => p.active).map((p) => ({ value: p.id, label: `${p.code} · ${p.name}`, hint: `${qty(p.stockQty)} ${p.unit}` })));
  protected readonly counterOptions = computed<ComboOption[]>(() =>
    this.lookups.accounts().filter((a) => a.active && a.isPostable && ['EXPENSE', 'INCOME', 'EQUITY'].includes(a.type)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })));

  constructor() {
    if (!this.canEdit) this.form.disable();
    // Existencias al día: el selector muestra cuánto hay de cada producto
    Promise.all([this.lookups.ensureProducts(true), this.lookups.ensureAccounts()]).catch((e) => this.loadError.set(errorMessage(e)));
  }

  private newLine() {
    return this.fb.nonNullable.group({
      productId: ['', Validators.required], direction: ['IN'], quantity: [null as number | null, [Validators.required, Validators.min(0.0001)]], unitCost: [null as number | null],
    });
  }
  protected addLine(): void { this.lines.push(this.newLine()); }

  protected stockOf(id: string | undefined): string {
    const p = this.tracked().find((x) => x.id === id);
    return p ? `${qty(p.stockQty)} ${p.unit}` : '';
  }
  protected avgOf(id: string | undefined): string { return this.tracked().find((x) => x.id === id)?.avgCost ?? '0'; }
  protected estimate(i: number): number {
    const l = this.raw().lines[i];
    if (!l?.quantity) return 0;
    const cost = l.direction === 'IN' ? Number(l.unitCost ?? 0) : Number(this.avgOf(l.productId));
    return Math.round(Number(l.quantity) * cost * 100) / 100 * (l.direction === 'IN' ? 1 : -1);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const missingCost = v.lines.findIndex((l) => l.direction === 'IN' && (l.unitCost === null || String(l.unitCost) === ''));
    if (missingCost >= 0) { this.formError.set(`Escribe el costo unitario de la entrada ${missingCost + 1}.`); return; }
    this.saving.set(true); this.formError.set('');
    const body = {
      date: v.date, reason: v.reason.trim(), ...(v.counterAccountId ? { counterAccountId: v.counterAccountId } : {}),
      lines: v.lines.map((l) => ({
        productId: l.productId, quantity: (l.direction === 'IN' ? 1 : -1) * Number(l.quantity),
        ...(l.direction === 'IN' ? { unitCost: Number(l.unitCost) } : {}),
      })),
    };
    try {
      const res = await firstValueFrom(this.api.post<InventoryAdjustment>('/inventory/adjustments', body));
      this.notify.ok(`Ajuste ${res.number} registrado.`);
      void this.lookups.ensureProducts(true);
      void this.router.navigate(['/inventory/adjustments', res.id]);
    } catch (e) { this.formError.set(e); }
    this.saving.set(false);
  }
}
