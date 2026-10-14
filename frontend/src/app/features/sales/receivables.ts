import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import Decimal from 'decimal.js';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { dec, monthRange, today, yearStart } from '../../shared/format';
import { ComboOption, EmptyState, ErrorNotice, FieldHelp, UI } from '../../shared/ui';
import { loadOpenInvoices, OpenInvoice } from './payment-shared';

interface Buckets { current: string; d1_30: string; d31_60: string; d61_90: string; over90: string; total: string }
interface AgingRow extends Buckets { partnerId: string; name: string; taxId: string | null }
interface Aging { scope: string; asOf: string; partners: AgingRow[]; totals: Buckets }
interface Movement {
  date: string; entryId: string; entryNumber: string; description: string | null; reference: string | null;
  debit: string; credit: string; balance: string;
}
interface Statement { partner: { id: string; name: string; taxId: string | null }; scope: string; openingBalance: string; movements: Movement[]; closingBalance: string }
type Scope = 'RECEIVABLE' | 'PAYABLE';
type Tab = 'aging' | 'statement';

@Component({
  selector: 'app-receivables',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, EmptyState, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Cuentas por cobrar y pagar</h1><p class="sub">Antigüedad de saldos y estado de cuenta de clientes y proveedores.</p></div>
        <div class="btn-row">
          @if (canEdit) { <button type="button" class="btn" (click)="openCredit()">Aplicar nota de crédito</button> }
          @if (isAdmin) { <button type="button" class="btn" [disabled]="marking()" (click)="markOverdue()">{{ marking() ? 'Marcando…' : 'Marcar facturas vencidas' }}</button> }
          <a routerLink="/payments" class="btn">Cobros y pagos</a>
        </div>
      </div>

      <div class="toolbar">
        <div class="field"><label for="r-scope">Ver</label>
          <select id="r-scope" class="select" [value]="scope()" (change)="setScope($any($event.target).value)">
            <option value="RECEIVABLE">Por cobrar (clientes)</option><option value="PAYABLE">Por pagar (proveedores)</option>
          </select></div>
      </div>

      <div class="tabs" role="tablist">
        <button type="button" role="tab" class="tab" [class.active]="tab() === 'aging'" [attr.aria-selected]="tab() === 'aging'" (click)="tab.set('aging')">Antigüedad de saldos</button>
        <button type="button" role="tab" class="tab" [class.active]="tab() === 'statement'" [attr.aria-selected]="tab() === 'statement'" (click)="tab.set('statement')">Estado de cuenta</button>
      </div>

      @if (tab() === 'aging') {
        <form class="toolbar" [formGroup]="agingForm" (ngSubmit)="loadAging()">
          <div class="field"><label for="r-asof">Al corte<app-field-help key="ventas.alCorte" /></label><input id="r-asof" class="input" type="date" formControlName="asOf" /></div>
          <button type="submit" class="btn" [disabled]="agingLoading()">Actualizar</button>
        </form>
        @if (agingError()) { <div class="notice neg" role="alert">{{ agingError() }}</div> }
        @if (aging(); as a) {
          <div class="figures" style="margin-bottom:16px">
            <div class="figure"><div class="f-label">{{ scope() === 'RECEIVABLE' ? 'Total por cobrar' : 'Total por pagar' }}</div><div class="f-value">{{ a.totals.total | money }}</div><div class="f-note">Moneda base</div></div>
            <div class="figure"><div class="f-label">Al día</div><div class="f-value">{{ a.totals.current | money }}</div></div>
            <div class="figure"><div class="f-label">Vencido<app-field-help key="ventas.vencido" /></div><div class="f-value">{{ overdue() | money }}</div><div class="f-note">{{ overduePct() }}% del total</div></div>
            <div class="figure"><div class="f-label">Más de 90 días</div><div class="f-value">{{ a.totals.over90 | money }}</div></div>
          </div>
        }
        <section class="panel">
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Cliente / proveedor</th><th class="num">Al día</th><th class="num">1–30 días</th><th class="num">31–60 días</th><th class="num">61–90 días</th><th class="num">Más de 90</th><th class="num">Total</th><th></th></tr></thead>
              <tbody>
                @if (agingLoading()) { <tr><td colspan="8"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
                @for (r of aging()?.partners ?? []; track r.partnerId) {
                  <tr>
                    <td><strong>{{ r.name }}</strong>@if (r.taxId) { <div class="dim mono">{{ r.taxId }}</div> }</td>
                    <td class="num">{{ r.current | money: 'blank' }}</td><td class="num">{{ r.d1_30 | money: 'blank' }}</td><td class="num">{{ r.d31_60 | money: 'blank' }}</td>
                    <td class="num">{{ r.d61_90 | money: 'blank' }}</td><td class="num" [class.neg]="r.over90 !== '0'">{{ r.over90 | money: 'blank' }}</td>
                    <td class="num"><strong>{{ r.total | money }}</strong></td>
                    <td class="actions"><button type="button" class="btn btn-ghost btn-sm" (click)="showStatement(r)">Estado de cuenta</button></td>
                  </tr>
                } @empty {
                  @if (!agingLoading() && !agingError()) {
                    <tr><td colspan="8">
                      <app-empty-state
                        [title]="scope() === 'RECEIVABLE' ? 'Nadie te debe nada a esa fecha' : 'No le debes nada a ningún proveedor a esa fecha'"
                        [text]="scope() === 'RECEIVABLE' ? 'Cuando emitas una factura de venta a crédito, aparecerá aquí con los días que lleva de atraso.' : 'Cuando registres una factura de compra a crédito, aparecerá aquí hasta que la pagues.'"
                        actionLabel="Nueva factura" actionLink="/invoices/new" [canAct]="canEdit" />
                    </td></tr>
                  }
                }
              </tbody>
              @if (aging(); as a) {
                @if (a.partners.length) {
                  <tfoot><tr><td>Totales</td><td class="num">{{ a.totals.current | money }}</td><td class="num">{{ a.totals.d1_30 | money }}</td><td class="num">{{ a.totals.d31_60 | money }}</td>
                    <td class="num">{{ a.totals.d61_90 | money }}</td><td class="num">{{ a.totals.over90 | money }}</td><td class="num">{{ a.totals.total | money }}</td><td></td></tr></tfoot>
                }
              }
            </table>
          </div>
        </section>
        <p class="hint" style="margin-top:8px">Montos en moneda base. Las notas de crédito sin aplicar restan del saldo. La antigüedad se cuenta desde la fecha de vencimiento.</p>
      }

      @if (tab() === 'statement') {
        <form class="toolbar" [formGroup]="stmtForm" (ngSubmit)="loadStatement()">
          <div class="field wide"><span class="label">{{ scope() === 'RECEIVABLE' ? 'Cliente' : 'Proveedor' }}</span>
            <app-combobox formControlName="partnerId" [options]="partnerOptions()" [clearable]="false" placeholder="Buscar por nombre o RNC" /></div>
          <div class="field"><label for="s-from">Desde</label><input id="s-from" class="input" type="date" formControlName="from" /></div>
          <div class="field"><label for="s-to">Hasta</label><input id="s-to" class="input" type="date" formControlName="to" /></div>
          <button type="submit" class="btn btn-primary" [disabled]="stmtLoading() || stmtForm.invalid">Ver estado de cuenta</button>
        </form>
        @if (stmtError()) { <div class="notice neg" role="alert">{{ stmtError() }}</div> }
        @if (stmtLoading()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
        @if (stmt(); as s) {
          <section class="panel">
            <div class="panel-head"><h2>{{ s.partner.name }}</h2><span class="dim mono">{{ s.partner.taxId }}</span></div>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Fecha</th><th>Asiento</th><th>Descripción</th><th>Referencia</th><th class="num">Débito</th><th class="num">Crédito</th><th class="num">Saldo</th></tr></thead>
                <tbody>
                  <tr class="sub-row"><td colspan="6">Saldo inicial</td><td class="num">{{ s.openingBalance | money }}</td></tr>
                  @for (m of s.movements; track $index) {
                    <tr>
                      <td>{{ m.date | fdate }}</td>
                      <td><a class="mono" [routerLink]="['/entries', m.entryId]">{{ m.entryNumber }}</a></td>
                      <td>{{ m.description }}</td><td class="mono dim">{{ m.reference }}</td>
                      <td class="num">{{ m.debit | money: 'blank' }}</td><td class="num">{{ m.credit | money: 'blank' }}</td>
                      <td class="num" [class]="m.balance | signClass">{{ m.balance | money }}</td>
                    </tr>
                  } @empty { <tr><td colspan="7" class="table-empty">Sin movimientos en el rango.</td></tr> }
                </tbody>
                <tfoot><tr><td colspan="6">Saldo final</td><td class="num">{{ s.closingBalance | money }}</td></tr></tfoot>
              </table>
            </div>
          </section>
          <p class="hint" style="margin-top:8px">Un saldo negativo indica un anticipo a favor del {{ scope() === 'RECEIVABLE' ? 'cliente' : 'proveedor' }}.</p>
        } @else if (!stmtLoading() && !stmtError()) {
          <div class="empty">Elige un cliente o proveedor y el rango de fechas para ver su estado de cuenta.</div>
        }
      }
    </div>

    <app-modal [open]="creditOpen()" title="Aplicar nota de crédito" width="640px" (closed)="creditOpen.set(false)">
      <form id="credit-form" [formGroup]="creditForm" (ngSubmit)="applyCredit()" novalidate>
        <div class="form-grid">
          <div class="field span-all"><span class="label">{{ scope() === 'RECEIVABLE' ? 'Cliente' : 'Proveedor' }}</span>
            <app-combobox formControlName="partnerId" [options]="partnerOptions()" [clearable]="false" placeholder="Buscar por nombre o RNC" /></div>
          @if (creditLoading()) { <div class="loading span-all"><span class="spinner"></span> Cargando documentos…</div> }
          <div class="field span-all"><label for="c-note">Nota de crédito<app-field-help key="ventas.notaCredito" /></label>
            <select id="c-note" class="select" formControlName="creditNoteId">
              <option value="">{{ notes().length ? 'Elige la nota' : 'Sin notas de crédito pendientes' }}</option>
              @for (n of notes(); track n.id) { <option [value]="n.id">{{ n.number }} · disponible {{ n.balance | money }} {{ n.currency }}</option> }
            </select></div>
          <div class="field span-all"><label for="c-inv">Factura a la que se aplica</label>
            <select id="c-inv" class="select" formControlName="invoiceId">
              <option value="">{{ invoices().length ? 'Elige la factura' : 'Sin facturas pendientes' }}</option>
              @for (i of invoices(); track i.id) { <option [value]="i.id">{{ i.number }} · saldo {{ i.balance | money }} {{ i.currency }}</option> }
            </select></div>
          <div class="field"><label for="c-amount">Monto a aplicar</label>
            <input id="c-amount" class="input num" type="number" min="0.01" step="0.01" formControlName="amount" />
            @if (maxCredit().gt(0)) { <span class="hint">Máximo: {{ maxCredit().toFixed(2) }}</span> }
            @if (creditForm.controls.amount.touched && creditForm.controls.amount.invalid) { <span class="error-text">Indica un monto mayor que cero.</span> }</div>
        </div>
        <app-error-notice style="display:block;margin-top:14px" [error]="creditError()" />
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="creditOpen.set(false)">Cancelar</button>
        <button type="submit" form="credit-form" class="btn btn-primary" [disabled]="creditSaving()">{{ creditSaving() ? 'Aplicando…' : 'Aplicar nota' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class Receivables {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  private readonly auth = inject(Auth);

  protected readonly canEdit = this.auth.has('ADMIN', 'ACCOUNTANT');
  protected readonly isAdmin = this.auth.has('ADMIN');
  protected readonly scope = signal<Scope>('RECEIVABLE');
  protected readonly tab = signal<Tab>('aging');
  protected readonly marking = signal(false);

  protected readonly partnerOptions = computed<ComboOption[]>(() => {
    const rec = this.scope() === 'RECEIVABLE';
    return this.lookups.partners().filter((p) => (rec ? p.type !== 'SUPPLIER' : p.type !== 'CUSTOMER'))
      .map((p) => ({ value: p.id, label: p.name, hint: p.taxId ?? undefined }));
  });

  // Antigüedad
  protected readonly agingForm = this.fb.nonNullable.group({ asOf: [today(), Validators.required] });
  protected readonly aging = signal<Aging | null>(null);
  protected readonly agingLoading = signal(false);
  protected readonly agingError = signal('');
  protected readonly overdue = computed(() => {
    const t = this.aging()?.totals;
    return t ? dec(t.d1_30).plus(dec(t.d31_60)).plus(dec(t.d61_90)).plus(dec(t.over90)) : new Decimal(0);
  });
  protected readonly overduePct = computed(() => {
    const t = this.aging()?.totals;
    return t && !dec(t.total).isZero() ? this.overdue().div(dec(t.total)).times(100).toFixed(1) : '0.0';
  });

  // Estado de cuenta
  protected readonly stmtForm = this.fb.nonNullable.group({
    partnerId: [null as string | null, Validators.required], from: [monthRange().from || yearStart()], to: [today()],
  });
  protected readonly stmt = signal<Statement | null>(null);
  protected readonly stmtLoading = signal(false);
  protected readonly stmtError = signal('');

  // Aplicar nota de crédito
  protected readonly creditOpen = signal(false);
  protected readonly creditLoading = signal(false);
  protected readonly creditSaving = signal(false);
  protected readonly creditError = signal<unknown>('');
  protected readonly notes = signal<OpenInvoice[]>([]);
  protected readonly invoices = signal<OpenInvoice[]>([]);
  protected readonly creditForm = this.fb.nonNullable.group({
    partnerId: [null as string | null, Validators.required], creditNoteId: ['', Validators.required], invoiceId: ['', Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
  });
  protected readonly maxCredit = signal(new Decimal(0));

  constructor() {
    void this.lookups.ensurePartners();
    void this.loadAging();
    this.creditForm.controls.partnerId.valueChanges.subscribe((id) => void this.loadCreditDocs(id));
    this.creditForm.controls.creditNoteId.valueChanges.subscribe(() => this.suggestAmount());
    this.creditForm.controls.invoiceId.valueChanges.subscribe(() => this.suggestAmount());
  }

  protected setScope(s: string): void {
    this.scope.set(s === 'PAYABLE' ? 'PAYABLE' : 'RECEIVABLE');
    this.stmt.set(null); this.stmtError.set('');
    this.stmtForm.controls.partnerId.reset(null);
    void this.loadAging();
  }

  protected async loadAging(): Promise<void> {
    this.agingLoading.set(true); this.agingError.set('');
    try { this.aging.set(await this.api.getP<Aging>('/receivables-payables/aging', { scope: this.scope(), asOf: this.agingForm.controls.asOf.value })); }
    catch (e) { this.agingError.set(errorMessage(e)); }
    this.agingLoading.set(false);
  }

  protected showStatement(r: AgingRow): void {
    this.stmtForm.patchValue({ partnerId: r.partnerId });
    this.tab.set('statement');
    void this.loadStatement();
  }

  protected async loadStatement(): Promise<void> {
    this.stmtForm.markAllAsTouched();
    const v = this.stmtForm.getRawValue();
    if (!v.partnerId) return;
    this.stmtLoading.set(true); this.stmtError.set('');
    try { this.stmt.set(await this.api.getP<Statement>(`/receivables-payables/statements/${v.partnerId}`, { scope: this.scope(), from: v.from, to: v.to })); }
    catch (e) { this.stmt.set(null); this.stmtError.set(errorMessage(e)); }
    this.stmtLoading.set(false);
  }

  protected async markOverdue(): Promise<void> {
    if (!(await this.confirm.ask({
      title: 'Marcar facturas vencidas',
      message: 'Las facturas pendientes con fecha de vencimiento pasada pasarán a estado “Vencida”. Esto no cambia sus saldos.',
      confirmText: 'Marcar vencidas',
    }))) return;
    this.marking.set(true);
    try {
      const res = await new Promise<{ updated: number }>((ok, bad) => this.api.post<{ updated: number }>('/receivables-payables/mark-overdue').subscribe({ next: ok, error: bad }));
      this.notify.ok(res.updated ? `${res.updated} factura(s) marcadas como vencidas.` : 'No había facturas por marcar.');
      await this.loadAging();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.marking.set(false);
  }

  protected openCredit(): void {
    this.creditError.set('');
    this.notes.set([]); this.invoices.set([]); this.maxCredit.set(new Decimal(0));
    this.creditForm.reset({ partnerId: this.stmtForm.controls.partnerId.value, creditNoteId: '', invoiceId: '', amount: null });
    this.creditOpen.set(true);
    if (this.stmtForm.controls.partnerId.value) void this.loadCreditDocs(this.stmtForm.controls.partnerId.value);
  }

  private async loadCreditDocs(partnerId: string | null): Promise<void> {
    this.notes.set([]); this.invoices.set([]);
    this.creditForm.patchValue({ creditNoteId: '', invoiceId: '', amount: null }, { emitEvent: false });
    this.maxCredit.set(new Decimal(0));
    if (!partnerId) return;
    this.creditLoading.set(true); this.creditError.set('');
    try {
      const dir = this.scope() === 'RECEIVABLE' ? 'RECEIVED' : 'MADE';
      const [invs, notes] = await Promise.all([
        loadOpenInvoices(this.api, partnerId, dir, ''),
        Promise.all(['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'].map((status) => this.api.getAll<OpenInvoice>('/invoices', { partnerId, type: 'CREDIT_NOTE', status }))),
      ]);
      this.invoices.set(invs);
      this.notes.set(notes.flat().filter((n) => dec(n.balance).gt(0)));
    } catch (e) { this.creditError.set(e); }
    this.creditLoading.set(false);
  }

  private suggestAmount(): void {
    const v = this.creditForm.getRawValue();
    const n = this.notes().find((x) => x.id === v.creditNoteId);
    const i = this.invoices().find((x) => x.id === v.invoiceId);
    if (!n || !i) { this.maxCredit.set(new Decimal(0)); return; }
    const max = Decimal.min(dec(n.balance), dec(i.balance));
    this.maxCredit.set(max);
    this.creditForm.controls.amount.setValue(Number(max.toFixed(2)));
  }

  protected async applyCredit(): Promise<void> {
    this.creditForm.markAllAsTouched();
    if (this.creditForm.invalid || this.creditSaving()) return;
    const v = this.creditForm.getRawValue();
    this.creditSaving.set(true); this.creditError.set('');
    try {
      await new Promise<void>((ok, bad) => this.api.post('/receivables-payables/apply-credit', {
        creditNoteId: v.creditNoteId, invoiceId: v.invoiceId, amount: Number(v.amount),
      }).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok('Nota de crédito aplicada a la factura.');
      this.creditOpen.set(false);
      await this.loadAging();
      if (this.stmt()) await this.loadStatement();
    } catch (e) { this.creditError.set(e); }
    this.creditSaving.set(false);
  }
}
