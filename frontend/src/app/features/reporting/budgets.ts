import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { clean } from '../../shared/format';
import { BUDGET_STATUS, opts } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { BudgetHead } from './report-types';

@Component({
  selector: 'app-budgets',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Presupuestos</h1><p class="sub">Planifica ingresos y gastos por cuenta y mes, y compáralos contra lo real.</p></div>
        @if (canEdit) { <button type="button" class="btn btn-primary" (click)="openNew()">Nuevo presupuesto</button> }
      </div>

      <div class="toolbar">
        <div class="field"><label for="b-year">Año</label>
          <input id="b-year" class="input num" type="number" min="2000" max="2100" placeholder="Todos" (change)="setFilter('year', $any($event.target).value)" /></div>
        <div class="field"><label for="b-status">Estado</label>
          <select id="b-status" class="select" (change)="setFilter('status', $any($event.target).value)">
            <option value="">Todos</option>@for (o of statusOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
      </div>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th class="num">Año</th><th>Estado</th><th class="num">Líneas</th><th>Creado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="6"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (b of rows(); track b.id) {
                <tr>
                  <td><a [routerLink]="['/budgets', b.id]"><strong>{{ b.name }}</strong></a>@if (b.notes) { <div class="dim">{{ b.notes }}</div> }</td>
                  <td class="num">{{ b.year }}</td>
                  <td><app-status [value]="b.status" [map]="BUDGET_STATUS" /></td>
                  <td class="num">{{ b._count?.lines ?? 0 }}</td>
                  <td>{{ b.createdAt | fdate }}</td>
                  <td class="actions">
                    <a class="btn btn-ghost btn-sm" [routerLink]="['/budgets', b.id]">Abrir</a>
                    @if (canEdit && b.status === 'DRAFT') { <button type="button" class="btn btn-ghost btn-sm" (click)="remove(b)">Eliminar</button> }
                  </td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="6"><app-empty-state title="No hay presupuestos con esos filtros." text="Planea cuánto esperas vender y gastar, y compáralo con lo real." actionLabel="Nuevo presupuesto" (action)="openNew()" [canAct]="canEdit" /></td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="modalOpen()" title="Nuevo presupuesto" width="520px" (closed)="modalOpen.set(false)">
      <form id="budget-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="f-name">Nombre</label><input id="f-name" class="input" formControlName="name" placeholder="Presupuesto 2027" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe un nombre de al menos 2 caracteres.</span> }</div>
          <div class="field"><label for="f-year">Año</label><input id="f-year" class="input num" type="number" min="2000" max="2100" formControlName="year" />
            @if (form.controls.year.touched && form.controls.year.invalid) { <span class="error-text">Indica un año entre 2000 y 2100.</span> }</div>
          <div class="field span-all"><label for="f-notes">Notas</label><textarea id="f-notes" class="textarea" formControlName="notes" maxlength="500"></textarea></div>
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="budget-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Creando…' : 'Crear y editar líneas' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class Budgets {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);

  protected readonly BUDGET_STATUS = BUDGET_STATUS;
  protected readonly statusOptions = opts.budgetStatus;
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  protected readonly rows = signal<BudgetHead[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private filters: Record<string, string> = {};

  protected readonly modalOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.minLength(2), Validators.maxLength(120)]],
    year: [new Date().getFullYear() + 1, [Validators.required, Validators.min(2000), Validators.max(2100)]],
    notes: [''],
  });

  constructor() { void this.load(); }

  protected setFilter(key: string, value: string): void { this.filters = { ...this.filters, [key]: value }; void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try { this.rows.set(await this.api.getP<BudgetHead[]>('/budgets', this.filters)); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.formError.set('');
    this.form.reset({ name: '', year: new Date().getFullYear() + 1, notes: '' });
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    try {
      const b = await firstValueFrom(this.api.post<BudgetHead>('/budgets', clean({ name: v.name.trim(), year: Number(v.year), notes: v.notes.trim() })));
      this.notify.ok('Presupuesto creado. Agrega las cuentas y los importes.');
      this.modalOpen.set(false);
      await this.router.navigate(['/budgets', b.id]);
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async remove(b: BudgetHead): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Eliminar presupuesto', message: `Se eliminará «${b.name}» con todas sus líneas. Esta acción no se puede deshacer.`, confirmText: 'Eliminar', danger: true }))) return;
    try {
      await firstValueFrom(this.api.delete(`/budgets/${b.id}`));
      this.notify.ok('Presupuesto eliminado.');
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

}
