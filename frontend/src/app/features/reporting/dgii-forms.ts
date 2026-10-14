import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { Notify } from '../../core/notify';
import { UI } from '../../shared/ui';
import { ExportButtons } from '../../shared/ui/export-buttons';

type Form = '609' | 'it1' | 'ir17';
interface Box { box: string; text: string; value: string; origin: string; link: string | null }
interface Sheet { form: string; period: string; mapStatus: string; boxes: Box[]; warnings: string[]; summary: Record<string, string | null>; check607?: { ok: boolean; ventas607: string; ventasIt1: string; difference: string } }
interface R609 { count: number; rows: Record<string, string>[]; columns: { campo: string; titulo: string }[]; errors: { message: string; invoiceNumber: string }[]; warnings: { message: string; invoiceNumber: string }[]; canExport: boolean; totals: Record<string, string>; assumptions: string[] }

const prevMonth = () => { const d = new Date(); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() - 1); return d.toISOString().slice(0, 7); };
const SUMMARY: Record<string, string> = { itbisFacturado: 'ITBIS facturado', itbisDeducible: 'ITBIS deducible (incluye retenido por terceros y saldo anterior)', saldoAnterior: 'Saldo a favor del mes anterior', aPagar: 'ITBIS a pagar', saldoAFavor: 'Saldo a favor para el mes siguiente', total: 'Total retenido', previous: 'Total del mes anterior' };

/** Declaraciones asistidas (PLAN-v0.3 §9.2, N6): 609 con su TXT; hojas IT-1 e IR-17 para llenar en la Oficina Virtual. */
@Component({
  selector: 'app-dgii-forms',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ExportButtons, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Declaraciones DGII</h1><p class="sub">Prepara el 609 y las hojas del IT-1 y el IR-17 con los datos de tus facturas.</p></div>
        <div class="field"><label for="df-p">Mes</label><input id="df-p" class="input" type="month" [value]="period()" (change)="period.set($any($event.target).value); load()" /></div>
      </div>
      <nav class="tabs" aria-label="Declaraciones">
        <a class="tab" routerLink="/dgii/it1" [class.active]="form() === 'it1'">IT-1 (ITBIS)</a>
        <a class="tab" routerLink="/dgii/ir17" [class.active]="form() === 'ir17'">IR-17 (retenciones)</a>
        <a class="tab" routerLink="/dgii/609" [class.active]="form() === '609'">609 (pagos al exterior)</a>
      </nav>
      <app-error-notice [error]="error()" />
      @if (loading()) { <div class="loading"><span class="spinner"></span> Calculando…</div> }

      @if (form() === '609') {
        @if (r609(); as r) {
          @for (e of r.errors; track $index) { <div class="notice neg" role="alert">{{ e.invoiceNumber ? e.invoiceNumber + ': ' : '' }}{{ e.message }}</div> }
          @for (w of r.warnings; track $index) { <div class="notice warn" role="status">{{ w.invoiceNumber }}: {{ w.message }}</div> }
          <div class="btn-row section">
            <button type="button" class="btn btn-primary" [disabled]="!r.canExport || !r.count" (click)="txt()">Descargar TXT</button>
            @if (canFile) { <button type="button" class="btn" (click)="file()">Ya lo presenté</button> }
          </div>
          <section class="panel"><div class="table-wrap"><table class="table">
            <thead><tr>@for (c of r.columns; track c.campo) { <th>{{ c.titulo }}</th> }</tr></thead>
            <tbody>
              @for (row of r.rows; track row['invoiceId']) { <tr>@for (c of r.columns; track c.campo) { <td>{{ row[c.campo] }}</td> }</tr> }
              @empty { <tr><td [attr.colspan]="r.columns.length || 1"><app-empty-state title="No hubo pagos al exterior este mes" text="Entran las compras con comprobante B17/E47 o a proveedores de otro país." /></td></tr> }
            </tbody>
          </table></div></section>
          @for (a of r.assumptions; track $index) { <p class="hint">{{ a }}</p> }
        }
      } @else if (sheet(); as s) {
        @for (w of s.warnings; track $index) { <div class="notice warn" role="status">{{ w }}</div> }
        @if (s.check607; as c) {
          <div class="notice" [class.pos]="c.ok" [class.neg]="!c.ok" role="status">{{ c.ok ? '✓ Las ventas cuadran con el 607.' : '! Las ventas no cuadran con el 607: diferencia ' }}@if (!c.ok) { {{ c.difference | money }} (607 {{ c.ventas607 | money }} · hoja {{ c.ventasIt1 | money }}) }</div>
        }
        <div class="btn-row section">
          <app-export-buttons [path]="'/dgii-returns/' + form() + '/export'" [query]="{ period: period() }" [name]="'hoja-' + form()" />
          @if (canFile) { <button type="button" class="btn" (click)="file()">Ya lo presenté</button> }
        </div>
        <section class="panel"><div class="table-wrap"><table class="table">
          <thead><tr><th>Casilla</th><th>Concepto</th><th class="num">Valor</th><th>De dónde sale</th></tr></thead>
          <tbody>
            @for (b of s.boxes; track b.box) {
              <tr><td class="mono">{{ b.box }}</td><td>{{ b.text }}</td><td class="num">{{ b.value | money }}</td>
                <td class="dim">@if (b.link) { <a [routerLink]="b.link">{{ b.origin }}</a> } @else { {{ b.origin }} }</td></tr>
            } @empty { <tr><td colspan="4"><app-empty-state title="Falta el mapa de casillas" text="Quien administra el sistema debe cargarlo (Valores fiscales)." /></td></tr> }
          </tbody>
        </table></div></section>
        <section class="panel panel-pad section"><dl class="kv">@for (k of keys(s.summary); track k) { <dt>{{ SUMMARY[k] ?? k }}</dt><dd>{{ s.summary[k] | money }}</dd> }</dl></section>
      }
    </div>
  `,
})
export class DgiiForms {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  readonly form = input.required<Form>();
  protected readonly canFile = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly SUMMARY = SUMMARY;
  protected readonly period = signal(prevMonth());
  protected readonly sheet = signal<Sheet | null>(null);
  protected readonly r609 = signal<R609 | null>(null);
  protected readonly loading = signal(false);
  protected readonly error = signal<unknown>(null);
  protected keys(o: Record<string, unknown>) { return Object.keys(o).filter((k) => o[k] !== null); }

  constructor() { effect(() => { this.form(); untracked(() => void this.load()); }); }

  protected async load(): Promise<void> {
    this.loading.set(true); this.error.set(null); this.sheet.set(null); this.r609.set(null);
    try {
      if (this.form() === '609') this.r609.set(await this.api.getP<R609>('/dgii-returns/609', { period: this.period() }));
      else this.sheet.set(await this.api.getP<Sheet>(`/dgii-returns/${this.form()}`, { period: this.period() }));
    } catch (e) { this.error.set(e); }
    this.loading.set(false);
  }
  protected async txt(): Promise<void> {
    try { await this.api.download('/dgii-returns/609/txt', { period: this.period() }, '609.txt'); } catch (e) { this.error.set(e); }
  }
  protected async file(): Promise<void> {
    const ref = await this.confirm.reason({ title: 'Marcar como presentada', message: 'Se guarda la foto del mes (el saldo a favor pasa al mes siguiente).', confirmText: 'Ya lo presenté', label: 'Número de confirmación de la DGII (opcional)', required: false });
    if (ref === null) return;
    try { await firstValueFrom(this.api.post(`/dgii-returns/${this.form()}/file`, { period: this.period(), ...(ref.trim() ? { reference: ref.trim() } : {}) })); this.notify.ok('Marcada como presentada.'); }
    catch (e) { this.error.set(e); }
  }
}
