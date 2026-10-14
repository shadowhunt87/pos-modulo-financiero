import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { clean, dec, sumDec, today } from '../../shared/format';
import { INVOICE_TYPE, PAYMENT_DIRECTION, PAYMENT_METHOD, PAYMENT_STATUS, ENTRY_STATUS } from '../../shared/labels';
import { AttachmentsPanel, ErrorNotice, FieldHelp, UI } from '../../shared/ui';
import { autoDistribute, loadOpenInvoices, OpenInvoice, toAllocations } from './payment-shared';

interface PaymentFull {
  id: string; number: string | null; direction: 'RECEIVED' | 'MADE'; status: string; date: string; method: string; reference: string | null; notes: string | null;
  amount: string; currency: string; exchangeRate: string; unapplied: string;
  partner: { id: string; name: string; taxId: string | null };
  allocations: { id: string; amount: string; invoice: { id: string; number: string; ncf: string | null; type: string } }[];
  bankAccount: { id: string; bankName: string; accountNumber: string } | null;
  cashRegister: { id: string; name: string } | null;
  journalEntry: { id: string; number: string; status: string } | null;
}

@Component({
  selector: 'app-payment-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AttachmentsPanel, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      @if (loading() && !pay()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
      @if (pay(); as p) {
        <div class="page-head">
          <div>
            <h1>{{ p.direction | lbl: PAYMENT_DIRECTION }} {{ p.number ?? '' }} <app-status [value]="p.status" [map]="PAYMENT_STATUS" /></h1>
            <p class="sub">{{ p.partner.name }} · {{ p.date | fdate }}</p>
          </div>
          <div class="btn-row">
            <a routerLink="/payments" class="btn">Volver al listado</a>
            @if (canAllocate() && p.status === 'POSTED' && dec(p.unapplied).gt(0)) { <button type="button" class="btn" (click)="openAllocate()">Aplicar anticipo a facturas</button> }
            @if (canVoid && p.status === 'POSTED') { <button type="button" class="btn btn-danger" (click)="voidIt()">Anular</button> }
          </div>
        </div>

        @if (p.status === 'VOIDED') { <div class="notice neg" style="margin-bottom:16px">Este {{ p.direction === 'RECEIVED' ? 'cobro' : 'pago' }} está anulado: su asiento fue revertido y los saldos de las facturas se restauraron.</div> }

        <div class="figures" style="margin-bottom:16px">
          <div class="figure"><div class="f-label">Monto</div><div class="f-value">{{ p.amount | money }}</div><div class="f-note">{{ p.currency }}@if (!dec(p.exchangeRate).eq(1)) { · tasa {{ p.exchangeRate }} }</div></div>
          <div class="figure"><div class="f-label">Aplicado a facturas</div><div class="f-value">{{ applied() | money }}</div></div>
          <div class="figure"><div class="f-label">Anticipo sin aplicar<app-field-help key="pago.anticipo" /></div><div class="f-value">{{ p.unapplied | money }}</div></div>
        </div>

        <div class="cols-2">
          <section class="panel panel-pad">
            <dl class="kv">
              <dt>Cliente / proveedor</dt><dd>{{ p.partner.name }}@if (p.partner.taxId) { <span class="dim mono"> · {{ p.partner.taxId }}</span> }</dd>
              <dt>Método</dt><dd>{{ p.method | lbl: PAYMENT_METHOD }}</dd>
              <dt>{{ p.direction === 'RECEIVED' ? 'Depositado en' : 'Pagado desde' }}</dt>
              <dd>@if (p.bankAccount; as b) { {{ b.bankName }} · <span class="mono">{{ b.accountNumber }}</span> } @else if (p.cashRegister; as c) { Caja {{ c.name }} } @else { — }</dd>
              <dt>Referencia</dt><dd class="mono">{{ p.reference || '—' }}</dd>
              <dt>Notas</dt><dd>{{ p.notes || '—' }}</dd>
              <dt>Asiento</dt>
              <dd>@if (p.journalEntry; as j) { <a class="mono" [routerLink]="['/entries', j.id]">{{ j.number }}</a> <span class="dim">({{ j.status | lbl: ENTRY_STATUS }})</span> } @else { — }</dd>
            </dl>
          </section>
          <section class="panel">
            <div class="panel-head"><h2>Aplicaciones</h2></div>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Factura</th><th>Tipo</th><th class="num">Monto aplicado</th></tr></thead>
                <tbody>
                  @for (a of p.allocations; track a.id) {
                    <tr><td><a class="mono" [routerLink]="['/invoices', a.invoice.id]">{{ a.invoice.number }}</a>@if (a.invoice.ncf) { <div class="dim mono">{{ a.invoice.ncf }}</div> }</td>
                      <td>{{ a.invoice.type | lbl: INVOICE_TYPE }}</td><td class="num">{{ a.amount | money }}</td></tr>
                  } @empty { <tr><td colspan="3" class="table-empty">Sin aplicaciones a facturas.</td></tr> }
                </tbody>
                @if (p.allocations.length) { <tfoot><tr><td colspan="2">Total aplicado</td><td class="num">{{ applied() | money }}</td></tr></tfoot> }
              </table>
            </div>
          </section>
        </div>

        <app-attachments parent="paymentId" [parentId]="p.id" [canEdit]="canAttach && p.status !== 'VOIDED'" />

        <app-modal [open]="allocOpen()" title="Aplicar anticipo a facturas" width="860px" (closed)="allocOpen.set(false)">
          <p class="dim">Anticipo disponible: <strong>{{ p.unapplied | money }} {{ p.currency }}</strong></p>
          @if (allocLoading()) { <div class="loading"><span class="spinner"></span> Cargando facturas…</div> }
          @else {
            <div class="btn-row" style="margin:8px 0"><button type="button" class="btn btn-sm" [disabled]="!open().length" (click)="autoAlloc()">Aplicar automáticamente</button></div>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Factura</th><th>Vence</th><th class="num">Saldo pendiente</th><th class="num">Monto a aplicar</th></tr></thead>
                <tbody>
                  @for (i of open(); track i.id) {
                    <tr><td class="mono">{{ i.number }}</td><td>{{ i.dueDate | fdate }}</td><td class="num">{{ i.balance | money }}</td>
                      <td class="num"><input class="input num" type="number" min="0" step="0.01" [attr.aria-label]="'Monto a aplicar a ' + i.number"
                        [value]="alloc()[i.id] ?? ''" (input)="setAlloc(i, $any($event.target).value)" /></td></tr>
                  } @empty { <tr><td colspan="4" class="table-empty">El cliente / proveedor no tiene facturas pendientes en {{ p.currency }}.</td></tr> }
                </tbody>
                <tfoot><tr><td colspan="3">Total a aplicar</td><td class="num">{{ allocTotal() | money }}</td></tr></tfoot>
              </table>
            </div>
            <div class="field" style="margin-top:12px;max-width:220px"><label for="a-date">Fecha de aplicación</label><input id="a-date" class="input" type="date" [value]="allocDate()" (input)="allocDate.set($any($event.target).value)" /></div>
            @if (allocTotal().gt(dec(p.unapplied))) { <div class="notice neg" style="margin-top:12px" role="alert">Lo que aplicas supera el anticipo disponible. Reduce los montos.</div> }
            <app-error-notice style="display:block;margin-top:12px" [error]="allocError()" />
          }
          <ng-container modal-actions>
            <button type="button" class="btn" (click)="allocOpen.set(false)">Cancelar</button>
            <button type="button" class="btn btn-primary" [disabled]="allocSaving() || allocTotal().lte(0) || allocTotal().gt(dec(p.unapplied))" (click)="allocate()">{{ allocSaving() ? 'Aplicando…' : 'Aplicar' }}</button>
          </ng-container>
        </app-modal>
      }
    </div>
  `,
})
export class PaymentDetail {
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);

  protected readonly PAYMENT_DIRECTION = PAYMENT_DIRECTION;
  protected readonly PAYMENT_METHOD = PAYMENT_METHOD;
  protected readonly PAYMENT_STATUS = PAYMENT_STATUS;
  protected readonly INVOICE_TYPE = INVOICE_TYPE;
  protected readonly ENTRY_STATUS = ENTRY_STATUS;
  protected readonly dec = dec;
  protected readonly canVoid = this.auth.has('ADMIN', 'APPROVER');
  protected readonly canAllocate = () => this.auth.has('ADMIN', 'ACCOUNTANT');
  protected readonly canAttach = this.auth.has('ADMIN', 'ACCOUNTANT', 'APPROVER');

  protected readonly pay = signal<PaymentFull | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly applied = computed(() => sumDec((this.pay()?.allocations ?? []).map((a) => a.amount)));

  protected readonly allocOpen = signal(false);
  protected readonly allocLoading = signal(false);
  protected readonly allocSaving = signal(false);
  protected readonly allocError = signal<unknown>('');
  protected readonly allocDate = signal(today());
  protected readonly open = signal<OpenInvoice[]>([]);
  protected readonly alloc = signal<Record<string, string>>({});
  protected readonly allocTotal = computed(() => sumDec(Object.values(this.alloc())));

  constructor() {
    effect(() => { const id = this.id(); if (id) void this.load(id); });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.pay.set(await this.api.getP<PaymentFull>(`/payments/${id}`)); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected async voidIt(): Promise<void> {
    const p = this.pay();
    if (!p) return;
    const reason = await this.confirm.reason({
      title: `Anular ${p.direction === 'RECEIVED' ? 'cobro' : 'pago'} ${p.number ?? ''}`.trim(),
      message: 'Se revierte el asiento y las facturas vuelven a tener saldo pendiente. No se puede deshacer.',
      confirmText: 'Anular', danger: true, label: 'Motivo de la anulación',
    });
    if (!reason) return;
    try {
      await new Promise<void>((ok, bad) => this.api.post(`/payments/${p.id}/void`, { reason }).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok('Anulado correctamente.');
      await this.load(p.id);
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

  protected async openAllocate(): Promise<void> {
    const p = this.pay();
    if (!p) return;
    this.allocError.set(''); this.alloc.set({}); this.open.set([]); this.allocDate.set(today());
    this.allocOpen.set(true); this.allocLoading.set(true);
    try { this.open.set(await loadOpenInvoices(this.api, p.partner.id, p.direction, p.currency)); }
    catch (e) { this.allocError.set(e); }
    this.allocLoading.set(false);
  }
  protected setAlloc(i: OpenInvoice, raw: string): void {
    this.alloc.update((a) => {
      const next = { ...a }; const v = dec(raw);
      if (v.lte(0)) delete next[i.id]; else next[i.id] = (v.gt(dec(i.balance)) ? dec(i.balance) : v).toString();
      return next;
    });
  }
  protected autoAlloc(): void { this.alloc.set(autoDistribute(this.open(), this.pay()?.unapplied ?? 0)); }

  protected async allocate(): Promise<void> {
    const p = this.pay();
    if (!p || this.allocSaving()) return;
    const allocations = toAllocations(this.alloc());
    if (!allocations.length) return;
    this.allocSaving.set(true); this.allocError.set('');
    try {
      await new Promise<void>((ok, bad) => this.api.post(`/payments/${p.id}/allocate`, clean({ allocations, date: this.allocDate() })).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok('Anticipo aplicado a las facturas.');
      this.allocOpen.set(false);
      await this.load(p.id);
    } catch (e) { this.allocError.set(e); }
    this.allocSaving.set(false);
  }
}
