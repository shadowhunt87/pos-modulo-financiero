import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { isoDate, money } from '../../shared/format';
import { ErrorNotice, UI } from '../../shared/ui';
import { PAY_FREQUENCY, PayrollConcept, PayrollLine, PayrollRun, RUN_STATUS, RUN_TYPE, fullName } from './types';

/** Etiqueta de cada valor fiscal guardado en la nómina. */
const PARAM_LABEL: Record<string, string> = {
  TSS_AFP_EMPLEADO: 'AFP del empleado', TSS_SFS_EMPLEADO: 'SFS del empleado', TSS_AFP_EMPLEADOR: 'AFP del empleador', TSS_SFS_EMPLEADOR: 'SFS del empleador',
  TSS_SRL_EMPLEADOR: 'Riesgos laborales', SRL_EMPRESA: 'Riesgos laborales de tu empresa', INFOTEP_EMPLEADOR: 'INFOTEP',
  TSS_SALARIO_MINIMO_COTIZABLE: 'Salario mínimo cotizable', TSS_TOPE_AFP_SALARIOS: 'Tope AFP (en salarios mínimos)',
  TSS_TOPE_SFS_SALARIOS: 'Tope SFS (en salarios mínimos)', TSS_TOPE_SRL_SALARIOS: 'Tope SRL (en salarios mínimos)', ISR_ASALARIADOS_ESCALA: 'Escala del ISR',
};

/** Detalle de una nómina (P3): montos por empleado, novedades y el ciclo contabilizar → pagar (o anular). */
@Component({
  selector: 'app-payroll-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ErrorNotice, ...UI],
  styles: `
    .cards { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); margin-bottom: 16px; }
    .cards .panel { padding: 14px 16px; margin: 0; } .cards .v { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
    .item { display: grid; gap: 10px; grid-template-columns: minmax(200px, 2fr) 140px minmax(160px, 2fr) 36px; align-items: end; margin-bottom: 10px; }
    @media (max-width: 700px) { .item { grid-template-columns: 1fr 1fr; } }
  `,
  template: `
    <div class="page">
      <app-error-notice [error]="error()" />
      @if (run(); as r) {
        <div class="page-head">
          <div>
            <h1>{{ r.type | lbl: RUN_TYPE }} {{ r.status === 'DRAFT' ? '(borrador)' : r.number }}
              <span class="badge" [class]="tone(r.status)">{{ r.status | lbl: RUN_STATUS }}</span></h1>
            <p class="sub">
              @if (r.type === 'REGULAR') { {{ r.frequency | lbl: PAY_FREQUENCY }} · }
              {{ r.periodStart | fdate }} – {{ r.periodEnd | fdate }} · se paga el {{ r.payDate | fdate }}
              @if (r.notes) { · {{ r.notes }} }
            </p>
          </div>
          <div class="btn-row">
            <a class="btn" routerLink="/hr/payroll">Volver</a>
            @if (r.status === 'DRAFT') {
              <button type="button" class="btn" [disabled]="busy()" (click)="recalculate()">Recalcular</button>
              <button type="button" class="btn btn-ghost" [disabled]="busy()" (click)="remove()">Eliminar</button>
              <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="post()">Contabilizar</button>
            }
            @if (r.status === 'POSTED') { <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="openPay()">Registrar pago</button> }
            @if (r.status === 'POSTED' || r.status === 'PAID') { <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="voidIt()">Anular</button> }
          </div>
        </div>

        @if (r.status === 'DRAFT') { <div class="notice info" role="status">Revisa los montos y agrega las novedades (horas extra, comisiones, préstamos). Al contabilizar se genera el asiento y la nómina ya no cambia.</div> }
        @if (r.status === 'VOIDED') { <div class="notice neg" role="status">Anulada: {{ r.voidReason }}. Sus asientos se reversaron.</div> }

        <div class="cards">
          <div class="panel"><div class="dim">Bruto</div><div class="v">{{ r.grossTotal | money }}</div></div>
          <div class="panel"><div class="dim">TSS del empleado</div><div class="v">{{ r.employeeTssTotal | money }}</div></div>
          <div class="panel"><div class="dim">ISR retenido</div><div class="v">{{ r.isrTotal | money }}</div></div>
          <div class="panel"><div class="dim">Otros descuentos</div><div class="v">{{ r.otherDeductionsTotal | money }}</div></div>
          <div class="panel"><div class="dim">Neto a pagar</div><div class="v">{{ r.netTotal | money }}</div></div>
          <div class="panel"><div class="dim">Aportes del empleador</div><div class="v">{{ r.employerTotal | money }}</div></div>
        </div>

        <section class="panel">
          <div class="table-wrap">
            <table class="table">
              <thead><tr>
                <th style="min-width:220px">Empleado</th><th class="num">Salario</th><th class="num">Otros ingresos</th><th class="num">AFP</th><th class="num">SFS</th>
                <th class="num">ISR</th><th class="num">Descuentos</th><th class="num">Neto</th><th class="num">Aporte patronal</th>
              </tr></thead>
              <tbody>
                @for (l of r.lines ?? []; track l.id) {
                  <tr>
                    <td><strong class="nowrap">{{ fullName(l.employee) }}</strong><div class="dim nowrap">{{ l.employee.code }}@if (l.employee.position) { · {{ l.employee.position }} }</div>
                      @for (i of l.items; track i.id) { <div class="dim nowrap">{{ i.concept.kind === 'EARNING' ? '+' : '−' }} {{ i.concept.name }}: {{ i.amount | money }}</div> }
                      @if (r.status === 'DRAFT' && r.type === 'REGULAR') { <button type="button" class="btn btn-ghost btn-sm" style="margin-left:-10px" (click)="openItems(l)">Novedades</button> }</td>
                    <td class="num">{{ l.salary | money }}@if (l.daysWorked < l.periodDays) { <div class="dim">{{ l.daysWorked }} de {{ l.periodDays }} días</div> }</td>
                    <td class="num">{{ l.otherEarnings | money: 'blank' }}</td>
                    <td class="num">{{ l.afpEmployee | money: 'blank' }}</td>
                    <td class="num">{{ l.sfsEmployee | money: 'blank' }}</td>
                    <td class="num">{{ l.isr | money: 'blank' }}</td>
                    <td class="num">{{ l.otherDeductions | money: 'blank' }}</td>
                    <td class="num"><strong>{{ l.netPay | money }}</strong></td>
                    <td class="num">{{ employer(l) | money: 'blank' }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <div class="panel" style="margin-top:16px">
          <div class="panel-pad form-grid">
            <div class="field"><span class="label">Asiento de la nómina</span><div>{{ r.journalEntry?.number ?? '—' }}</div></div>
            <div class="field"><span class="label">Asiento del pago</span><div>{{ r.paymentEntry?.number ?? '—' }}</div></div>
            <div class="field"><span class="label">Pagada desde</span><div>{{ r.bankAccount ? r.bankAccount.bankName + ' ' + r.bankAccount.accountNumber : '—' }}</div></div>
          </div>
        </div>

        @if (r.parameters?.length) {
          <section class="panel" style="margin-top:16px">
            <div class="panel-head"><h2>Valores legales usados</h2></div>
            <div class="panel-pad">
              <p class="hint">Salen de Valores fiscales, vigentes al cierre del período. «Por validar» significa que la contadora todavía no los confirmó.</p>
              <ul style="margin:8px 0 0;padding-left:18px">
                @for (p of r.parameters; track p.key) {
                  <li>{{ paramLabel(p.key) }}@if (p.value) {: <strong>{{ paramValue(p.key, p.value) }}</strong>}
                    @if (p.status === 'POR_VALIDAR') { <span class="badge warn" style="margin-left:6px">Por validar</span> }</li>
                }
              </ul>
            </div>
          </section>
        }
      } @else if (!error()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
    </div>

    <app-modal [open]="!!itemsLine()" [title]="'Novedades · ' + (itemsLine() ? fullName(itemsLine()!.employee) : '')" width="720px" (closed)="itemsLine.set(null)">
      <form id="items-form" [formGroup]="itemsForm" (ngSubmit)="saveItems()" novalidate>
        <div formArrayName="items">
          @for (g of items.controls; track g; let i = $index) {
            <div class="item" [formGroupName]="i">
              <div class="field"><label [for]="'it-c' + i">Concepto</label>
                <select [id]="'it-c' + i" class="select" formControlName="conceptId"><option value="">Elige…</option>
                  @for (c of activeConcepts(); track c.id) { <option [value]="c.id">{{ c.kind === 'EARNING' ? 'Ingreso' : 'Descuento' }} · {{ c.name }}</option> }</select></div>
              <div class="field"><label [for]="'it-a' + i">Monto</label><input [id]="'it-a' + i" class="input num" type="number" min="0.01" step="0.01" formControlName="amount" /></div>
              <div class="field"><label [for]="'it-d' + i">Detalle (opcional)</label><input [id]="'it-d' + i" class="input" formControlName="description" /></div>
              <button type="button" class="btn btn-ghost btn-icon" (click)="items.removeAt(i)" [attr.aria-label]="'Quitar novedad ' + (i + 1)">✕</button>
            </div>
          } @empty { <p class="dim">Sin novedades. Agrega horas extra, comisiones, préstamos o adelantos.</p> }
        </div>
        <button type="button" class="btn btn-sm" (click)="addItem()">Agregar novedad</button>
        @if (!concepts().length) { <p class="hint">Todavía no hay conceptos. Créalos en Configuración de nómina.</p> }
        @if (itemsError()) { <app-error-notice style="display:block;margin-top:12px" [error]="itemsError()" /> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="itemsLine.set(null)">Cancelar</button>
        <button type="submit" form="items-form" class="btn btn-primary" [disabled]="busy()">Guardar y recalcular</button>
      </ng-container>
    </app-modal>

    <app-modal [open]="paying()" title="Registrar el pago de la nómina" width="520px" (closed)="paying.set(false)">
      <form id="pay-form" [formGroup]="payForm" (ngSubmit)="pay()" novalidate>
        <p>Se registra la salida del neto ({{ run()?.netTotal | money }}) desde la cuenta bancaria que elijas.</p>
        <div class="form-grid">
          <div class="field span-2"><label for="p-bank">Cuenta bancaria</label>
            <select id="p-bank" class="select" formControlName="bankAccountId"><option value="">Elige…</option>
              @for (b of banks(); track b.id) { <option [value]="b.id">{{ b.bankName }} {{ b.accountNumber }}</option> }</select></div>
          <div class="field"><label for="p-date">Fecha del pago</label><input id="p-date" class="input" type="date" formControlName="date" /></div>
        </div>
        @if (payError()) { <app-error-notice style="display:block;margin-top:12px" [error]="payError()" /> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="paying.set(false)">Cancelar</button>
        <button type="submit" form="pay-form" class="btn btn-primary" [disabled]="busy()">Registrar pago</button>
      </ng-container>
    </app-modal>
  `,
})
export class PayrollDetail {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  readonly id = input.required<string>();

  protected readonly RUN_TYPE = RUN_TYPE;
  protected readonly RUN_STATUS = RUN_STATUS;
  protected readonly PAY_FREQUENCY = PAY_FREQUENCY;
  protected readonly fullName = fullName;
  protected readonly run = signal<PayrollRun | null>(null);
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly concepts = signal<PayrollConcept[]>([]);
  protected readonly activeConcepts = computed(() => this.concepts().filter((c) => c.active));
  protected readonly banks = computed(() => this.lookups.bankAccounts().filter((b) => b.active && b.glAccountId));

  protected readonly itemsLine = signal<PayrollLine | null>(null);
  protected readonly itemsError = signal<unknown>('');
  protected readonly itemsForm = this.fb.nonNullable.group({ items: this.fb.array([] as ReturnType<PayrollDetail['newItem']>[]) });
  protected get items() { return this.itemsForm.controls.items; }

  protected readonly paying = signal(false);
  protected readonly payError = signal<unknown>('');
  protected readonly payForm = this.fb.nonNullable.group({ bankAccountId: ['', Validators.required], date: ['', Validators.required] });

  constructor() {
    effect(() => { const id = this.id(); untracked(() => void this.load(id)); });
    this.api.getP<PayrollConcept[]>('/hr/payroll-concepts').then((c) => this.concepts.set(c)).catch(() => undefined);
  }

  protected tone(s: string): string { return s === 'PAID' ? 'pos' : s === 'POSTED' ? 'info' : s === 'VOIDED' ? 'neg' : 'warn'; }
  protected paramLabel(key: string): string { return PARAM_LABEL[key] ?? key; }
  /** Tasas con %, montos con RD$ y topes en salarios mínimos. */
  protected paramValue(key: string, value: string): string {
    if (key === 'TSS_SALARIO_MINIMO_COTIZABLE') return `RD$${money(value)}`;
    if (key.startsWith('TSS_TOPE_')) return value;
    return `${Number(value).toLocaleString('es-DO', { minimumFractionDigits: 2 })} %`;
  }
  protected employer(l: PayrollLine): number { return [l.afpEmployer, l.sfsEmployer, l.srlEmployer, l.infotepEmployer].reduce((s, x) => s + Number(x), 0); }

  private async load(id: string): Promise<void> {
    this.error.set('');
    try { this.run.set(await this.api.getP<PayrollRun>(`/hr/payroll-runs/${id}`)); }
    catch (e) { this.error.set(errorMessage(e)); }
  }

  /** Ejecuta una acción que devuelve la nómina actualizada. */
  private async act(call: () => Promise<PayrollRun>, ok: string): Promise<boolean> {
    this.busy.set(true);
    try { this.run.set(await call()); this.notify.ok(ok); return true; }
    catch (e) { this.notify.error(errorMessage(e)); return false; }
    finally { this.busy.set(false); }
  }

  protected recalculate(): void {
    void this.act(() => firstValueFrom(this.api.post<PayrollRun>(`/hr/payroll-runs/${this.id()}/recalculate`)), 'Nómina recalculada con los salarios y valores actuales.');
  }

  protected async post(): Promise<void> {
    const r = this.run();
    if (!r || !(await this.confirm.ask({
      title: 'Contabilizar la nómina', confirmText: 'Contabilizar',
      message: `Se genera el asiento contable de la nómina y ya no se podrá editar. Neto a pagar: RD$${money(r.netTotal)}.`,
    }))) return;
    await this.act(() => firstValueFrom(this.api.post<PayrollRun>(`/hr/payroll-runs/${r.id}/post`)), 'Nómina contabilizada.');
  }

  protected async remove(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Eliminar el borrador', message: 'Se borra esta nómina en borrador con sus novedades.', confirmText: 'Eliminar', danger: true }))) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.delete(`/hr/payroll-runs/${this.id()}`));
      this.notify.ok('Borrador eliminado.');
      void this.router.navigateByUrl('/hr/payroll');
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async voidIt(): Promise<void> {
    const reason = await this.confirm.reason({
      title: 'Anular la nómina', confirmText: 'Anular', danger: true,
      message: 'Se reversan el asiento de la nómina y, si ya se pagó, el del pago. Los empleados podrán entrar en otra nómina del mismo período.',
    });
    if (!reason) return;
    await this.act(() => firstValueFrom(this.api.post<PayrollRun>(`/hr/payroll-runs/${this.id()}/void`, { reason })), 'Nómina anulada.');
  }

  // ---------- Novedades ----------
  private newItem(v: { conceptId?: string; amount?: number | null; description?: string } = {}) {
    return this.fb.nonNullable.group({
      conceptId: [v.conceptId ?? '', Validators.required], amount: [v.amount ?? null as number | null, [Validators.required, Validators.min(0.01)]], description: [v.description ?? ''],
    });
  }
  protected addItem(): void { this.items.push(this.newItem()); }

  protected openItems(l: PayrollLine): void {
    this.items.clear();
    for (const i of l.items) this.items.push(this.newItem({ conceptId: i.conceptId, amount: Number(i.amount), description: i.description ?? '' }));
    this.itemsError.set('');
    this.itemsLine.set(l);
  }

  protected async saveItems(): Promise<void> {
    const l = this.itemsLine();
    this.itemsForm.markAllAsTouched();
    if (!l || this.itemsForm.invalid) { this.itemsError.set('Cada novedad lleva concepto y monto.'); return; }
    const items = this.items.getRawValue().map((i) => ({ conceptId: i.conceptId, amount: Number(i.amount), ...(i.description.trim() ? { description: i.description.trim() } : {}) }));
    this.busy.set(true); this.itemsError.set('');
    try {
      this.run.set(await firstValueFrom(this.api.put<PayrollRun>(`/hr/payroll-runs/${this.id()}/lines/${l.id}/items`, { items })));
      this.notify.ok('Novedades guardadas y línea recalculada.');
      this.itemsLine.set(null);
    } catch (e) { this.itemsError.set(e); }
    this.busy.set(false);
  }

  // ---------- Pago ----------
  protected async openPay(): Promise<void> {
    await this.lookups.ensureBankAccounts().catch(() => undefined);
    this.payForm.reset({ bankAccountId: this.banks()[0]?.id ?? '', date: isoDate(this.run()?.payDate) });
    this.payError.set(''); this.paying.set(true);
  }

  protected async pay(): Promise<void> {
    this.payForm.markAllAsTouched();
    if (this.payForm.invalid) { this.payError.set('Elige la cuenta bancaria y la fecha.'); return; }
    this.busy.set(true); this.payError.set('');
    try {
      this.run.set(await firstValueFrom(this.api.post<PayrollRun>(`/hr/payroll-runs/${this.id()}/pay`, this.payForm.getRawValue())));
      this.notify.ok('Pago registrado.');
      this.paying.set(false);
    } catch (e) { this.payError.set(e); }
    this.busy.set(false);
  }
}
