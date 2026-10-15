import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, Page } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { today } from '../../shared/format';
import { EmptyState, ErrorNotice, FieldHelp, UI } from '../../shared/ui';
import { PAY_FREQUENCY, PayrollRun, RUN_STATUS, RUN_TYPE } from './types';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** Nóminas (P3): lista y creación. El borrador sale calculado; se revisa y se contabiliza en su detalle. */
@Component({
  selector: 'app-payroll-runs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, EmptyState, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Nóminas</h1><p class="sub">Cada nómina calcula el salario, la TSS, el ISR y el neto de cada empleado. Revísala, contabilízala y págala.</p></div>
        <button type="button" class="btn btn-primary" (click)="openNew()">Nueva nómina</button>
      </div>
      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Número</th><th>Tipo</th><th>Período</th><th>Fecha de pago</th><th class="num">Empleados</th><th class="num">Bruto</th><th class="num">Neto a pagar</th><th>Estado</th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="8"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (r of rows(); track r.id) {
                <tr>
                  <td><a class="mono" [routerLink]="['/hr/payroll', r.id]">{{ r.status === 'DRAFT' ? 'Borrador' : r.number }}</a></td>
                  <td>{{ r.type | lbl: RUN_TYPE }}@if (r.type === 'REGULAR') { <div class="dim">{{ r.frequency | lbl: PAY_FREQUENCY }}</div> }</td>
                  <td>{{ r.periodStart | fdate }} – {{ r.periodEnd | fdate }}</td>
                  <td>{{ r.payDate | fdate }}</td>
                  <td class="num">{{ r._count?.lines }}</td>
                  <td class="num">{{ r.grossTotal | money }}</td>
                  <td class="num"><strong>{{ r.netTotal | money }}</strong></td>
                  <td><span class="badge" [class]="tone(r.status)">{{ r.status | lbl: RUN_STATUS }}</span></td>
                </tr>
              } @empty {
                @if (!loading() && !error()) {
                  <tr><td colspan="8">
                    <app-empty-state [filtered]="false" (action)="openNew()" title="Todavía no hay nóminas"
                      text="Antes de la primera, registra tus empleados y las cuentas en Configuración de nómina." actionLabel="Nueva nómina" [canAct]="true" />
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>
    </div>

    <app-modal [open]="creating()" title="Nueva nómina" width="620px" (closed)="creating.set(false)">
      <form id="run-form" [formGroup]="form" (ngSubmit)="create()" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="r-type">Tipo</label>
            <select id="r-type" class="select" formControlName="type"><option value="REGULAR">Nómina regular</option><option value="CHRISTMAS_BONUS">Regalía pascual (salario de Navidad)</option></select></div>
          @if (regular()) {
            <div class="field"><label for="r-freq">Frecuencia</label>
              <select id="r-freq" class="select" formControlName="frequency"><option value="MONTHLY">Mensual</option><option value="BIWEEKLY">Quincenal</option><option value="WEEKLY">Semanal</option></select></div>
            <div class="field"><label for="r-from">Desde</label><input id="r-from" class="input" type="date" formControlName="periodStart" /></div>
            <div class="field"><label for="r-to">Hasta</label><input id="r-to" class="input" type="date" formControlName="periodEnd" /></div>
          }
          <div class="field"><label for="r-pay">Fecha de pago</label><input id="r-pay" class="input" type="date" formControlName="payDate" /></div>
          <div class="field span-all"><label for="r-notes">Nota (opcional)</label><input id="r-notes" class="input" formControlName="notes" /></div>
        </div>
        <p class="hint" style="margin-top:10px">
          @if (regular()) { Entran todos los empleados activos con esa frecuencia que trabajaron en el período; quien entró o salió a mitad cobra por días. }
          @else { La regalía es la doceava parte del salario del año de la fecha de pago. No paga TSS ni ISR. <app-field-help key="nomina.regalia" text="Código de Trabajo, art. 219-222: se paga a más tardar el 20 de diciembre. Suma lo pagado en las nóminas contabilizadas del año y, para los días sin nómina en el sistema, el salario mensual." /> }
        </p>
        @if (formError()) { <app-error-notice style="display:block;margin-top:12px" [error]="formError()" /> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="creating.set(false)">Cancelar</button>
        <button type="submit" form="run-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Calculando…' : 'Crear y calcular' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class PayrollRuns {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);

  protected readonly RUN_TYPE = RUN_TYPE;
  protected readonly RUN_STATUS = RUN_STATUS;
  protected readonly PAY_FREQUENCY = PAY_FREQUENCY;
  protected readonly limit = 25;
  protected readonly rows = signal<PayrollRun[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly creating = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<unknown>('');

  protected readonly form = this.fb.nonNullable.group({
    type: ['REGULAR'], frequency: ['MONTHLY'], periodStart: ['', Validators.required], periodEnd: ['', Validators.required],
    payDate: [today(), Validators.required], notes: [''],
  });
  private readonly typeSig = toSignal(this.form.controls.type.valueChanges, { initialValue: 'REGULAR' });
  protected readonly regular = computed(() => this.typeSig() === 'REGULAR');

  constructor() {
    void this.load();
    // El período sale del mes en curso; quincenal y semanal se ajustan a mano
    this.form.controls.type.valueChanges.subscribe((t) => {
      const c = [this.form.controls.periodStart, this.form.controls.periodEnd];
      for (const x of c) { if (t === 'REGULAR') x.enable(); else x.disable(); }
    });
  }

  protected tone(s: string): string { return s === 'PAID' ? 'pos' : s === 'POSTED' ? 'info' : s === 'VOIDED' ? 'neg' : 'warn'; }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const res = await this.api.getP<Page<PayrollRun>>('/hr/payroll-runs', { page: this.page(), limit: this.limit });
      this.rows.set(res.data); this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    const now = new Date();
    const first = new Date(now.getFullYear(), now.getMonth(), 1), last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    this.form.reset({ type: 'REGULAR', frequency: 'MONTHLY', periodStart: iso(first), periodEnd: iso(last), payDate: iso(last), notes: '' });
    this.formError.set(''); this.creating.set(true);
  }

  protected async create(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const body = v.type === 'REGULAR'
      ? { type: v.type, frequency: v.frequency, periodStart: v.periodStart, periodEnd: v.periodEnd, payDate: v.payDate, ...(v.notes.trim() ? { notes: v.notes.trim() } : {}) }
      : { type: v.type, payDate: v.payDate, ...(v.notes.trim() ? { notes: v.notes.trim() } : {}) };
    try {
      const run = await firstValueFrom(this.api.post<PayrollRun>('/hr/payroll-runs', body));
      this.notify.ok('Nómina calculada. Revisa los montos antes de contabilizarla.');
      this.creating.set(false);
      void this.router.navigate(['/hr/payroll', run.id]);
    } catch (e) { this.formError.set(e); }
    this.saving.set(false);
  }
}
