import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime, firstValueFrom } from 'rxjs';
import { Api, Page } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { today } from '../../shared/format';
import { EmptyState, ErrorNotice, UI } from '../../shared/ui';
import { resetFilterControls } from '../../shared/ui/empty-state';
import { EmployeeDialog } from './employee-dialog';
import { Department, EMPLOYEE_STATUS, Employee, PAY_FREQUENCY, fmtDoc, fullName } from './types';

/** Empleados (P3): ficha, salario y salida de la empresa. Solo ADMIN y ACCOUNTANT (lo garantiza la ruta). */
@Component({
  selector: 'app-employees',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, EmployeeDialog, EmptyState, ErrorNotice, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Empleados</h1><p class="sub">Las personas de tu nómina, con su salario mensual y cada cuánto cobran.</p></div>
        <button type="button" class="btn btn-primary" (click)="openNew()">Nuevo empleado</button>
      </div>

      <div class="toolbar" #bar>
        <div class="field wide"><label for="q">Buscar</label><input id="q" class="input" placeholder="Nombre, código o cédula" (input)="search$.next($any($event.target).value)" /></div>
        <div class="field"><label for="st">Estado</label>
          <select id="st" class="select" (change)="setFilter('status', $any($event.target).value)">
            <option value="">Todos</option><option value="ACTIVE">Activos</option><option value="SUSPENDED">Suspendidos</option><option value="TERMINATED">Salieron</option></select></div>
        <div class="field"><label for="dep">Departamento</label>
          <select id="dep" class="select" (change)="setFilter('departmentId', $any($event.target).value)">
            <option value="">Todos</option>@for (d of departments(); track d.id) { <option [value]="d.id">{{ d.name }}</option> }</select></div>
      </div>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Documento</th><th>Cargo</th><th>Ingreso</th><th class="num">Salario mensual</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (e of rows(); track e.id) {
                <tr>
                  <td class="nowrap"><strong>{{ fullName(e) }}</strong><div class="dim">{{ e.code }}@if (e.department) { · {{ e.department.name }} }</div></td>
                  <td class="mono nowrap">{{ fmtDoc(e.documentType, e.documentNumber) }}</td>
                  <td>{{ e.position }}</td>
                  <td>{{ e.hireDate | fdate }}</td>
                  <td class="num">{{ e.baseSalary | money }}<div class="dim">{{ e.payFrequency | lbl: PAY_FREQUENCY }}</div></td>
                  <td>
                    <span class="badge" [class.pos]="e.status === 'ACTIVE'" [class.warn]="e.status === 'SUSPENDED'">{{ e.status | lbl: EMPLOYEE_STATUS }}</span>
                    @if (e.terminationDate) { <div class="dim">{{ e.terminationDate | fdate }}</div> }
                  </td>
                  <td class="actions">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(e)">Editar</button>
                    @if (e.status !== 'TERMINATED') {
                      <button type="button" class="btn btn-ghost btn-sm" (click)="toggleSuspend(e)">{{ e.status === 'SUSPENDED' ? 'Reactivar' : 'Suspender' }}</button>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="openTerminate(e)">Dar de baja</button>
                    }
                  </td>
                </tr>
              } @empty {
                @if (!loading() && !error()) {
                  <tr><td colspan="7">
                    <app-empty-state [filtered]="hasFilters()" (clear)="clearFilters(bar)" (action)="openNew()"
                      [title]="hasFilters() ? 'No hay empleados con esos filtros' : 'Aún no tienes empleados registrados'"
                      text="Registra a las personas de tu nómina para calcular sus pagos, la TSS y el ISR."
                      actionLabel="Nuevo empleado" [canAct]="true" />
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>
    </div>

    <app-employee-dialog [open]="modalOpen()" [employee]="editing()" [departments]="departments()" (saved)="onSaved()" (closed)="modalOpen.set(false)" />

    <app-modal [open]="!!terminating()" title="Dar de baja" width="520px" (closed)="terminating.set(null)">
      @if (terminating(); as t) {
        <p>{{ fullName(t) }} dejará de entrar en las nóminas después de la fecha de salida. Su historial no cambia.</p>
        <form id="term-form" [formGroup]="termForm" (ngSubmit)="terminate()" novalidate>
          <div class="form-grid">
            <div class="field"><label for="t-date">Fecha de salida</label><input id="t-date" class="input" type="date" formControlName="date" /></div>
            <div class="field span-2"><label for="t-reason">Motivo</label><input id="t-reason" class="input" formControlName="reason" placeholder="Renuncia, desahucio, despido…" />
              @if (termForm.controls.reason.touched && termForm.controls.reason.invalid) { <span class="error-text">Escribe el motivo.</span> }</div>
          </div>
          @if (termError()) { <app-error-notice style="display:block;margin-top:12px" [error]="termError()" /> }
        </form>
      }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="terminating.set(null)">Cancelar</button>
        <button type="submit" form="term-form" class="btn btn-danger">Dar de baja</button>
      </ng-container>
    </app-modal>
  `,
})
export class Employees {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly EMPLOYEE_STATUS = EMPLOYEE_STATUS;
  protected readonly PAY_FREQUENCY = PAY_FREQUENCY;
  protected readonly fullName = fullName;
  protected readonly fmtDoc = fmtDoc;
  protected readonly limit = 25;
  protected readonly rows = signal<Employee[]>([]);
  protected readonly departments = signal<Department[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly hasFilters = signal(false);
  private filters: Record<string, string> = {};
  protected readonly search$ = new Subject<string>();
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Employee | null>(null);
  protected readonly terminating = signal<Employee | null>(null);
  protected readonly termError = signal<unknown>('');
  protected readonly termForm = this.fb.nonNullable.group({ date: [today(), Validators.required], reason: ['', [Validators.required, Validators.maxLength(500)]] });

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((q) => this.setFilter('q', q));
    void this.load();
    this.api.getP<Department[]>('/hr/departments').then((d) => this.departments.set(d)).catch(() => undefined);
  }

  protected setFilter(key: string, value: string): void { this.filters = { ...this.filters, [key]: value }; this.page.set(1); void this.load(); }
  protected clearFilters(bar: HTMLElement): void { resetFilterControls(bar); this.filters = {}; this.page.set(1); void this.load(); }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    this.hasFilters.set(Object.values(this.filters).some((v) => !!v));
    try {
      const res = await this.api.getP<Page<Employee>>('/hr/employees', { ...this.filters, page: this.page(), limit: this.limit });
      this.rows.set(res.data); this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void { this.editing.set(null); this.modalOpen.set(true); }
  protected openEdit(e: Employee): void { this.editing.set(e); this.modalOpen.set(true); }
  protected onSaved(): void { this.modalOpen.set(false); void this.load(); }

  protected async toggleSuspend(e: Employee): Promise<void> {
    const status = e.status === 'SUSPENDED' ? 'ACTIVE' : 'SUSPENDED';
    try {
      await firstValueFrom(this.api.patch(`/hr/employees/${e.id}`, { status }));
      this.notify.ok(status === 'SUSPENDED' ? `${fullName(e)} queda suspendido: no entra en las nóminas.` : `${fullName(e)} vuelve a estar activo.`);
      await this.load();
    } catch (err) { this.notify.error(errorMessage(err)); }
  }

  protected openTerminate(e: Employee): void { this.termForm.reset({ date: today(), reason: '' }); this.termError.set(''); this.terminating.set(e); }

  protected async terminate(): Promise<void> {
    const e = this.terminating();
    this.termForm.markAllAsTouched();
    if (!e || this.termForm.invalid) return;
    try {
      await firstValueFrom(this.api.post(`/hr/employees/${e.id}/terminate`, this.termForm.getRawValue()));
      this.notify.ok(`${fullName(e)} quedó dado de baja.`);
      this.terminating.set(null);
      await this.load();
    } catch (err) { this.termError.set(err); }
  }
}
