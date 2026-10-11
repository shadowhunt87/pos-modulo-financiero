import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { dec, isoDate, yearEnd, yearStart } from '../../shared/format';
import { PERIOD_STATUS } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { ClosingPreview, FiscalYear, issuesOf, send } from './ledger-shared';

/** Años fiscales: alta, vista previa del cierre, cierre y reapertura. */
@Component({
  selector: 'app-fiscal-years',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  templateUrl: './fiscal-years.html',
})
export class FiscalYears {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);

  protected readonly PERIOD_STATUS = PERIOD_STATUS;
  protected readonly isAdmin = inject(Auth).has('ADMIN');

  protected readonly years = signal<FiscalYear[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busyId = signal('');

  // Alta
  protected readonly modalOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]], startDate: ['', Validators.required], endDate: ['', Validators.required],
    generatePeriods: [true],
  });

  // Vista previa y cierre
  protected readonly previewOpen = signal(false);
  protected readonly previewLoading = signal(false);
  protected readonly preview = signal<ClosingPreview | null>(null);
  protected readonly previewError = signal('');
  protected readonly closeIssues = signal<string[]>([]);
  protected readonly closing = signal(false);

  protected readonly previewTitle = computed(() => { const p = this.preview(); return p ? `Cierre del año ${p.year.name}` : 'Vista previa de cierre'; });
  protected sign(v: string): number { return dec(v).comparedTo(0); }

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    this.error.set('');
    try { this.years.set((await this.api.getP<FiscalYear[]>('/fiscal-years')).slice().reverse()); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    const last = this.years()[0]; // el más reciente
    const y = last ? Number(isoDate(last.endDate).slice(0, 4)) + 1 : new Date().getFullYear();
    this.formError.set('');
    this.form.reset({ name: String(y), startDate: yearStart(y), endDate: yearEnd(y), generatePeriods: true });
    this.modalOpen.set(true);
  }

  protected async create(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    if (isoDate(v.startDate) >= isoDate(v.endDate)) { this.formError.set('La fecha inicial debe ser anterior a la final.'); return; }
    this.saving.set(true); this.formError.set('');
    try {
      await send(this.api.post('/fiscal-years', { name: v.name.trim(), startDate: v.startDate, endDate: v.endDate, generatePeriods: v.generatePeriods }));
      this.notify.ok(v.generatePeriods ? 'Año fiscal creado con sus períodos mensuales.' : 'Año fiscal creado.');
      this.modalOpen.set(false);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async openPreview(y: FiscalYear): Promise<void> {
    this.preview.set(null); this.previewError.set(''); this.closeIssues.set([]);
    this.previewOpen.set(true); this.previewLoading.set(true);
    try { this.preview.set(await this.api.getP<ClosingPreview>(`/fiscal-years/${y.id}/closing-preview`)); }
    catch (e) { this.previewError.set(errorMessage(e)); }
    this.previewLoading.set(false);
  }

  protected async closeYear(): Promise<void> {
    const p = this.preview();
    if (!p || this.closing()) return;
    const ok = await this.confirm.ask({
      title: `Cerrar el año ${p.year.name}`,
      message: 'Se creará el asiento de cierre que lleva los ingresos y gastos a cero y traslada el resultado a utilidades acumuladas, y se cerrarán todos los períodos del año. Después no se podrán registrar asientos con fecha dentro del año hasta que lo reabras.',
      confirmText: 'Cerrar año', danger: true,
    });
    if (!ok) return;
    this.closing.set(true); this.closeIssues.set([]);
    try {
      const res = await send<{ entryNumber: string | null }>(this.api.post(`/fiscal-years/${p.year.id}/close`));
      this.notify.ok(res.entryNumber ? `Año cerrado. Asiento de cierre ${res.entryNumber}.` : 'Año cerrado. No había ingresos ni gastos que trasladar.');
      this.previewOpen.set(false);
      await this.load();
    } catch (e) {
      const issues = issuesOf(e);
      this.closeIssues.set(issues);
      if (!issues.length) this.notify.error(errorMessage(e));
    }
    this.closing.set(false);
  }

  protected async reopen(y: FiscalYear): Promise<void> {
    const reason = await this.confirm.reason({
      title: `Reabrir el año ${y.name}`,
      message: 'Se anulará el asiento de cierre y se abrirán los períodos del año, así que ingresos y gastos vuelven a mostrar su saldo del año. Si hay años posteriores cerrados, primero hay que reabrirlos.',
      confirmText: 'Reabrir año', danger: true, label: 'Motivo de la reapertura',
    });
    if (reason === null) return;
    if (reason.length > 300) { this.notify.error('El motivo admite máximo 300 caracteres.'); return; }
    this.busyId.set(y.id);
    try {
      await send(this.api.post(`/fiscal-years/${y.id}/reopen`, { reason }));
      this.notify.ok('Año fiscal reabierto.');
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busyId.set('');
  }
}
