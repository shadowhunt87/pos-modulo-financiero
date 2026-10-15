import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Api } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { UI } from '../../shared/ui';
import { fmtDoc, fullName } from './types';

type Emp = { id: string; code: string; firstName: string; lastName: string; documentType: string; documentNumber: string; nss?: string | null };
interface TssReport {
  month: string;
  rows: ({ employee: Emp } & Record<'tssBase' | 'afpEmployee' | 'sfsEmployee' | 'afpEmployer' | 'sfsEmployer' | 'srlEmployer' | 'infotepEmployer', string>)[];
  totals: Record<'tssBase' | 'afpEmployee' | 'sfsEmployee' | 'afpEmployer' | 'sfsEmployer' | 'srlEmployer' | 'infotepEmployer', string>;
}
interface Ir3Report { month: string; rows: { employee: Emp; grossTotal: string; isrBase: string; isr: string }[]; totals: { grossTotal: string; isrBase: string; isr: string } }

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

/** Reportes de nómina del mes (P3): aportes a la TSS e ISR retenido (IR-3). Resúmenes para preparar la declaración. */
@Component({
  selector: 'app-payroll-reports',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Reportes de nómina</h1><p class="sub">Lo que debes a la TSS y el ISR retenido a tus empleados en el mes, sacado de las nóminas contabilizadas.</p></div>
      </div>
      <div class="toolbar">
        <div class="field"><label for="m">Mes</label><input id="m" class="input" type="month" [value]="month()" (change)="setMonth($any($event.target).value)" /></div>
      </div>
      <div class="notice info" role="status">Son resúmenes para preparar la autodeterminación de la TSS y el IR-3. Todavía no generan los archivos oficiales.</div>
      <app-error-notice [error]="error()" />
      @if (loading()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }

      @if (tss(); as t) {
        <section class="panel" style="margin-top:16px">
          <div class="panel-head"><h2>Aportes a la TSS</h2><span class="dim">Nóminas cuyo período termina en el mes</span></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Empleado</th><th>Cédula</th><th class="num">Cotizable</th><th class="num" title="AFP del empleado">AFP emp.</th><th class="num" title="SFS del empleado">SFS emp.</th><th class="num" title="AFP del empleador">AFP patr.</th><th class="num" title="SFS del empleador">SFS patr.</th><th class="num" title="Seguro de riesgos laborales">SRL</th><th class="num">INFOTEP</th></tr></thead>
              <tbody>
                @for (r of t.rows; track r.employee.id) {
                  <tr>
                    <td class="nowrap">{{ fullName(r.employee) }}@if (r.employee.nss) { <div class="dim">NSS {{ r.employee.nss }}</div> }</td><td class="mono nowrap">{{ fmtDoc(r.employee.documentType, r.employee.documentNumber) }}</td>
                    <td class="num">{{ r.tssBase | money }}</td><td class="num">{{ r.afpEmployee | money }}</td><td class="num">{{ r.sfsEmployee | money }}</td>
                    <td class="num">{{ r.afpEmployer | money }}</td><td class="num">{{ r.sfsEmployer | money }}</td><td class="num">{{ r.srlEmployer | money }}</td><td class="num">{{ r.infotepEmployer | money }}</td>
                  </tr>
                } @empty { <tr><td colspan="9"><p class="dim" style="padding:12px">No hay nóminas contabilizadas de ese mes.</p></td></tr> }
              </tbody>
              @if (t.rows.length) {
                <tfoot><tr><th colspan="2">Total</th>
                  <th class="num">{{ t.totals.tssBase | money }}</th><th class="num">{{ t.totals.afpEmployee | money }}</th><th class="num">{{ t.totals.sfsEmployee | money }}</th>
                  <th class="num">{{ t.totals.afpEmployer | money }}</th><th class="num">{{ t.totals.sfsEmployer | money }}</th><th class="num">{{ t.totals.srlEmployer | money }}</th><th class="num">{{ t.totals.infotepEmployer | money }}</th></tr></tfoot>
              }
            </table>
          </div>
        </section>
      }

      @if (ir3(); as t) {
        <section class="panel" style="margin-top:16px">
          <div class="panel-head"><h2>ISR retenido a asalariados (IR-3)</h2><span class="dim">Nóminas con fecha de pago en el mes</span></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Empleado</th><th>Cédula</th><th class="num">Bruto</th><th class="num">Base del ISR</th><th class="num">ISR retenido</th></tr></thead>
              <tbody>
                @for (r of t.rows; track r.employee.id) {
                  <tr><td class="nowrap">{{ fullName(r.employee) }}</td><td class="mono nowrap">{{ fmtDoc(r.employee.documentType, r.employee.documentNumber) }}</td>
                    <td class="num">{{ r.grossTotal | money }}</td><td class="num">{{ r.isrBase | money }}</td><td class="num">{{ r.isr | money }}</td></tr>
                } @empty { <tr><td colspan="5"><p class="dim" style="padding:12px">No hay nóminas pagadas o contabilizadas en ese mes.</p></td></tr> }
              </tbody>
              @if (t.rows.length) {
                <tfoot><tr><th colspan="2">Total</th><th class="num">{{ t.totals.grossTotal | money }}</th><th class="num">{{ t.totals.isrBase | money }}</th><th class="num">{{ t.totals.isr | money }}</th></tr></tfoot>
              }
            </table>
          </div>
        </section>
      }
    </div>
  `,
})
export class PayrollReports {
  private readonly api = inject(Api);
  protected readonly fullName = fullName;
  protected readonly fmtDoc = fmtDoc;
  protected readonly month = signal(thisMonth());
  protected readonly tss = signal<TssReport | null>(null);
  protected readonly ir3 = signal<Ir3Report | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() { void this.load(); }

  protected setMonth(m: string): void { if (m) { this.month.set(m); void this.load(); } }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [tss, ir3] = await Promise.all([
        this.api.getP<TssReport>('/hr/reports/tss', { month: this.month() }), this.api.getP<Ir3Report>('/hr/reports/ir3', { month: this.month() }),
      ]);
      this.tss.set(tss); this.ir3.set(ir3);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
}
