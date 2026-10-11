import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { INVOICE_STATUS, INVOICE_TYPE, opts } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { InvoiceRow } from './invoice-types';

/** Listado de facturas (venta, compra, notas) con filtros y paginación. Lee GET /invoices. */
@Component({
  selector: 'app-invoices',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Facturas</h1><p class="sub">Ventas, compras y notas de crédito o débito.</p></div>
        @if (canEdit) { <a routerLink="/invoices/new" class="btn btn-primary">Nueva factura</a> }
      </div>

      <div class="toolbar">
        <div class="field wide"><label for="q">Buscar</label><input id="q" class="input" placeholder="Número o NCF" (input)="search$.next($any($event.target).value)" /></div>
        <div class="field"><label for="type">Tipo</label>
          <select id="type" class="select" (change)="setFilter('type', $any($event.target).value)">
            <option value="">Todos</option>@for (o of typeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
        <div class="field"><label for="st">Estado</label>
          <select id="st" class="select" [disabled]="overdue()" (change)="setFilter('status', $any($event.target).value)">
            <option value="">Todos</option>@for (o of statusOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
        <div class="field wide"><label for="partner">Tercero</label>
          <app-combobox id="partner" [options]="partnerOptions()" placeholder="Todos los terceros" [formControl]="partnerCtl" /></div>
        <div class="field"><label for="from">Desde</label><input id="from" class="input" type="date" (change)="setFilter('from', $any($event.target).value)" /></div>
        <div class="field"><label for="to">Hasta</label><input id="to" class="input" type="date" (change)="setFilter('to', $any($event.target).value)" /></div>
        <label class="check" style="height:36px"><input type="checkbox" (change)="setOverdue($any($event.target).checked)" /> Solo vencidas</label>
      </div>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Número</th><th>Tipo</th><th>NCF</th><th>Tercero</th><th>Fecha</th><th>Vence</th><th class="num">Total</th><th class="num">Saldo</th><th>Estado</th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="9"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (r of rows(); track r.id) {
                <tr>
                  <td><a class="mono" [routerLink]="['/invoices', r.id]">{{ r.number }}</a></td>
                  <td>{{ r.type | lbl: INVOICE_TYPE }}</td>
                  <td class="mono">{{ r.ncf }}</td>
                  <td><strong>{{ r.partner.name }}</strong>@if (r.partner.taxId) { <div class="dim mono">{{ r.partner.taxId }}</div> }</td>
                  <td>{{ r.issueDate | fdate }}</td>
                  <td>{{ r.dueDate | fdate }}</td>
                  <td class="num">{{ r.total | money }} <span class="faint">{{ r.currency }}</span></td>
                  <td class="num">{{ r.balance | money }}</td>
                  <td><app-status [value]="r.status" [map]="INVOICE_STATUS" /></td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="9" class="table-empty">No hay facturas con esos filtros.</td></tr> }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>
    </div>
  `,
})
export class Invoices {
  private readonly api = inject(Api);
  private readonly lookups = inject(Lookups);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly INVOICE_TYPE = INVOICE_TYPE;
  protected readonly INVOICE_STATUS = INVOICE_STATUS;
  protected readonly typeOptions = opts.invoiceType;
  protected readonly statusOptions = opts.invoiceStatus;
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly limit = 25;

  protected readonly rows = signal<InvoiceRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly overdue = signal(false);
  private filters: Record<string, string> = {};
  protected readonly search$ = new Subject<string>();
  protected readonly partnerCtl = new FormControl<string | null>(null);
  protected readonly partnerOptions = computed<ComboOption[]>(() =>
    this.lookups.partners().map((p) => ({ value: p.id, label: p.name, hint: p.taxId ?? undefined })));

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((q) => this.setFilter('q', q));
    this.partnerCtl.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => this.setFilter('partnerId', v ?? ''));
    void this.lookups.ensurePartners();
    void this.load();
  }

  protected setFilter(key: string, value: string): void { this.filters = { ...this.filters, [key]: value }; this.page.set(1); void this.load(); }
  protected setOverdue(on: boolean): void {
    this.overdue.set(on);
    this.filters = { ...this.filters, overdue: on ? 'true' : '', ...(on ? { status: '' } : {}) };
    this.page.set(1); void this.load();
  }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await this.api.getP<Page<InvoiceRow>>('/invoices', { ...this.filters, page: this.page(), limit: this.limit });
      this.rows.set(res.data);
      this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
}
