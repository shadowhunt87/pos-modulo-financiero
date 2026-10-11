import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { PERIOD_STATUS } from '../../shared/labels';
import { isoDate } from '../../shared/format';
import { UI } from '../../shared/ui';
import { FiscalPeriod, FiscalYear, send } from './ledger-shared';

interface Group { key: string; title: string; year: FiscalYear | null; periods: FiscalPeriod[] }

/** Períodos fiscales agrupados por año: cerrar bloquea nuevos asientos en el rango; reabrir lo permite otra vez. */
@Component({
  selector: 'app-fiscal-periods',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Períodos fiscales</h1><p class="sub">Un período cerrado no admite asientos nuevos ni anulaciones con fecha dentro de su rango.</p></div>
        @if (isAdmin) { <button type="button" class="btn btn-primary" (click)="openNew()">Nuevo período</button> }
      </div>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      @if (loading()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
      @for (g of groups(); track g.key) {
        <section class="panel">
          <div class="panel-head">
            <h2>{{ g.title }}</h2>
            @if (g.year) { <span><app-status [value]="g.year.status" [map]="PERIOD_STATUS" /></span> }
          </div>
          @if (g.year?.status === 'CLOSED') {
            <div class="notice info" style="margin:12px 20px 0">El año está cerrado. Para abrir un período hay que reabrir el año en <a routerLink="/fiscal-years">Años fiscales y cierre</a>.</div>
          }
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Período</th><th>Desde</th><th>Hasta</th><th>Estado</th><th>Cerrado el</th><th></th></tr></thead>
              <tbody>
                @for (p of g.periods; track p.id) {
                  <tr>
                    <td><strong>{{ p.name }}</strong></td>
                    <td>{{ p.startDate | fdate }}</td><td>{{ p.endDate | fdate }}</td>
                    <td><app-status [value]="p.status" [map]="PERIOD_STATUS" /></td>
                    <td>{{ p.closedAt | fdate }}</td>
                    <td class="actions">
                      @if (isAdmin) {
                        @if (p.status === 'OPEN') {
                          <button type="button" class="btn btn-ghost btn-sm" [disabled]="busyId() === p.id" (click)="close(p)">Cerrar</button>
                        } @else {
                          <button type="button" class="btn btn-ghost btn-sm" [disabled]="busyId() === p.id || g.year?.status === 'CLOSED'" (click)="reopen(p)">Reabrir</button>
                        }
                      }
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>
      } @empty {
        @if (!loading()) {
          <section class="panel"><div class="empty"><h3>Todavía no hay períodos</h3>
            <p>Crea un año fiscal para generar sus 12 períodos mensuales@if (isAdmin) { , o agrega un período suelto }.</p></div></section>
        }
      }
    </div>

    <app-modal [open]="modalOpen()" title="Nuevo período" width="520px" (closed)="modalOpen.set(false)">
      <form id="period-form" [formGroup]="form" (ngSubmit)="create()" novalidate>
        <div class="form-grid">
          <div class="field span-all"><label for="p-name">Nombre</label><input id="p-name" class="input" formControlName="name" maxlength="100" placeholder="Enero 2027" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe el nombre del período.</span> }</div>
          <div class="field"><label for="p-from">Desde</label><input id="p-from" type="date" class="input" formControlName="startDate" /></div>
          <div class="field"><label for="p-to">Hasta</label><input id="p-to" type="date" class="input" formControlName="endDate" /></div>
        </div>
        <p class="hint" style="margin-top:10px">No puede solaparse con otro período. Si pertenece a un año fiscal, se enlaza solo al cerrar ese año.</p>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="period-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Crear período' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class FiscalPeriods {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);

  protected readonly PERIOD_STATUS = PERIOD_STATUS;
  protected readonly isAdmin = inject(Auth).has('ADMIN');

  protected readonly years = signal<FiscalYear[]>([]);
  protected readonly periods = signal<FiscalPeriod[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busyId = signal('');

  protected readonly modalOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]], startDate: ['', Validators.required], endDate: ['', Validators.required],
  });

  /** Más reciente primero; los períodos sin año van al final. */
  protected readonly groups = computed<Group[]>(() => {
    const ps = this.periods();
    const out: Group[] = [...this.years()].reverse().map((y) => ({
      key: y.id, title: `Año fiscal ${y.name}`, year: y, periods: ps.filter((p) => p.fiscalYearId === y.id),
    }));
    const known = new Set(this.years().map((y) => y.id));
    const loose = ps.filter((p) => !p.fiscalYearId || !known.has(p.fiscalYearId));
    if (loose.length) out.push({ key: 'none', title: 'Sin año fiscal', year: null, periods: loose });
    return out.filter((g) => g.periods.length || g.year);
  });

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    this.error.set('');
    try {
      const [years, periods] = await Promise.all([
        this.api.getP<FiscalYear[]>('/fiscal-years'), this.api.getP<FiscalPeriod[]>('/accounting/fiscal-periods'),
      ]);
      this.years.set(years); this.periods.set(periods);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void { this.formError.set(''); this.form.reset({ name: '', startDate: '', endDate: '' }); this.modalOpen.set(true); }

  protected async create(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    if (isoDate(v.startDate) > isoDate(v.endDate)) { this.formError.set('La fecha inicial no puede ser posterior a la final.'); return; }
    this.saving.set(true); this.formError.set('');
    try {
      await send(this.api.post('/accounting/fiscal-periods', { name: v.name.trim(), startDate: v.startDate, endDate: v.endDate }));
      this.notify.ok('Período creado.');
      this.modalOpen.set(false);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async close(p: FiscalPeriod): Promise<void> {
    const ok = await this.confirm.ask({
      title: `Cerrar ${p.name}`,
      message: 'No se podrán crear, editar, aprobar ni anular asientos con fecha dentro de este período. Si hay asientos pendientes de aprobar, primero hay que aprobarlos o rechazarlos.',
      confirmText: 'Cerrar período', danger: true,
    });
    if (ok) await this.change(p, 'close', 'Período cerrado.');
  }
  protected async reopen(p: FiscalPeriod): Promise<void> {
    const ok = await this.confirm.ask({ title: `Reabrir ${p.name}`, message: 'Volverá a admitir asientos con fecha dentro de este período.', confirmText: 'Reabrir período' });
    if (ok) await this.change(p, 'reopen', 'Período reabierto.');
  }
  private async change(p: FiscalPeriod, action: 'close' | 'reopen', done: string): Promise<void> {
    this.busyId.set(p.id);
    try {
      await send(this.api.post(`/accounting/fiscal-periods/${p.id}/${action}`));
      this.notify.ok(done);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busyId.set('');
  }
}
