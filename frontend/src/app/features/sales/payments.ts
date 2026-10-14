import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { opts, PAYMENT_DIRECTION, PAYMENT_METHOD, PAYMENT_STATUS } from '../../shared/labels';
import { ComboOption, EmptyState, UI } from '../../shared/ui';

interface PaymentRow {
  id: string; number: string | null; direction: string; status: string; date: string; method: string; reference: string | null;
  amount: string; currency: string; partner: { id: string; name: string };
}

@Component({
  selector: 'app-payments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, EmptyState, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Cobros y pagos</h1><p class="sub">Cobros a clientes y pagos a proveedores, con su aplicación a facturas.</p></div>
        <div class="btn-row">
          <a routerLink="/receivables" class="btn">Cuentas por cobrar y pagar</a>
          @if (canEdit) { <a routerLink="/payments/new" class="btn btn-primary">Nuevo cobro o pago</a> }
        </div>
      </div>

      <form class="toolbar" [formGroup]="filters">
        <div class="field"><label for="f-dir">Tipo</label>
          <select id="f-dir" class="select" formControlName="direction"><option value="">Todos</option>@for (o of dirOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
        <div class="field"><label for="f-st">Estado</label>
          <select id="f-st" class="select" formControlName="status"><option value="">Todos</option>@for (o of statusOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
        <div class="field wide"><span class="label">Cliente / proveedor</span>
          <app-combobox formControlName="partnerId" [options]="partnerOptions()" placeholder="Todos los clientes y proveedores" /></div>
        <div class="field"><label for="f-from">Desde</label><input id="f-from" class="input" type="date" formControlName="from" /></div>
        <div class="field"><label for="f-to">Hasta</label><input id="f-to" class="input" type="date" formControlName="to" /></div>
      </form>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Número</th><th>Fecha</th><th>Tipo</th><th>Cliente / proveedor</th><th>Método</th><th>Referencia</th><th class="num">Monto</th><th>Estado</th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="8"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (p of rows(); track p.id) {
                <tr class="clickable" (click)="open(p)">
                  <td><a class="mono" [routerLink]="['/payments', p.id]" (click)="$event.stopPropagation()">{{ p.number ?? 'Sin número' }}</a></td>
                  <td>{{ p.date | fdate }}</td>
                  <td><span class="badge" [class.pos]="p.direction === 'RECEIVED'" [class.info]="p.direction === 'MADE'">{{ p.direction | lbl: PAYMENT_DIRECTION }}</span></td>
                  <td>{{ p.partner.name }}</td>
                  <td>{{ p.method | lbl: PAYMENT_METHOD }}</td>
                  <td class="mono dim">{{ p.reference }}</td>
                  <td class="num">{{ p.amount | money }} <span class="faint">{{ p.currency }}</span></td>
                  <td><app-status [value]="p.status" [map]="PAYMENT_STATUS" /></td>
                </tr>
              } @empty {
                @if (!loading() && !error()) {
                  <tr><td colspan="8">
                    <app-empty-state [filtered]="hasFilters()" (clear)="clearFilters()"
                      [title]="hasFilters() ? 'No hay cobros ni pagos con esos filtros' : 'Todavía no hay cobros ni pagos'"
                      text="Registra el primer cobro a un cliente o pago a un proveedor y aplícalo a sus facturas."
                      actionLabel="Nuevo cobro o pago" actionLink="/payments/new" [canAct]="canEdit" />
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>
    </div>
  `,
})
export class Payments {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly lookups = inject(Lookups);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly PAYMENT_DIRECTION = PAYMENT_DIRECTION;
  protected readonly PAYMENT_METHOD = PAYMENT_METHOD;
  protected readonly PAYMENT_STATUS = PAYMENT_STATUS;
  protected readonly dirOptions = opts.paymentDirection;
  protected readonly statusOptions = opts.paymentStatus;
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly limit = 25;

  protected readonly rows = signal<PaymentRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly hasFilters = signal(false);
  protected readonly partnerOptions = computed<ComboOption[]>(() =>
    this.lookups.partners().map((p) => ({ value: p.id, label: p.name, hint: p.taxId ?? undefined })));

  protected readonly filters = this.fb.nonNullable.group({
    direction: [''], status: [''], partnerId: [null as string | null], from: [''], to: [''],
  });

  constructor() {
    void this.lookups.ensurePartners();
    this.filters.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe(() => { this.page.set(1); void this.load(); });
    void this.load();
  }

  protected clearFilters(): void { this.filters.reset(); }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }
  protected open(p: PaymentRow): void { void this.router.navigate(['/payments', p.id]); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    const f = this.filters.getRawValue();
    this.hasFilters.set(Object.values(f).some((v) => !!v));
    try {
      const res = await this.api.getP<Page<PaymentRow>>('/payments', {
        direction: f.direction, status: f.status, partnerId: f.partnerId, from: f.from, to: f.to, page: this.page(), limit: this.limit,
      });
      this.rows.set(res.data);
      this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
}
