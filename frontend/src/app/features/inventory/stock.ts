import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { StockRow } from '../../core/models';
import { EmptyState, UI } from '../../shared/ui';
import { resetFilterControls } from '../../shared/ui/empty-state';
import { qty } from './labels';

/** Existencias (P2): cuánto hay de cada producto que controla inventario, a qué costo promedio y cuánto vale. */
@Component({
  selector: 'app-stock',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EmptyState, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Existencias</h1><p class="sub">Cuánto tienes de cada producto, a qué costo promedio y cuánto vale. Las compras suman y las ventas restan solas.</p></div>
        @if (canEdit) { <a class="btn btn-primary" routerLink="/inventory/adjustments/new">Nuevo ajuste</a> }
      </div>

      <section class="panel" style="margin-bottom:16px">
        <div class="panel-pad" style="display:flex;gap:32px;flex-wrap:wrap">
          <div><div class="dim">Valor total del inventario</div><div style="font-size:22px;font-weight:600"><span class="cur">RD$</span>{{ totalValue() | money }}</div></div>
          <div><div class="dim">Productos que controlan inventario</div><div style="font-size:22px;font-weight:600">{{ total() }}</div></div>
        </div>
      </section>

      <div class="toolbar" #bar>
        <div class="field wide"><label for="q">Buscar</label><input id="q" class="input" placeholder="Código o nombre" (input)="search$.next($any($event.target).value)" /></div>
        <label class="check" style="align-self:end;padding-bottom:8px"><input type="checkbox" (change)="setFilter('withStock', $any($event.target).checked ? 'true' : '')" /> Solo con existencia</label>
      </div>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Código</th><th>Producto</th><th class="num">Existencia</th><th class="num">Costo promedio</th><th class="num">Valor</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="6"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (r of rows(); track r.id) {
                <tr>
                  <td class="mono">{{ r.code }}</td>
                  <td><strong>{{ r.name }}</strong>@if (!r.active) { <span class="badge" style="margin-left:6px">Inactivo</span> }</td>
                  <td class="num">{{ qty(r.stockQty) }} <span class="dim">{{ r.unit }}</span></td>
                  <td class="num">{{ r.avgCost | money }}</td>
                  <td class="num">{{ r.stockValue | money }}</td>
                  <td class="actions"><a class="btn btn-ghost btn-sm" [routerLink]="['/inventory/products', r.id]">Ver kárdex</a></td>
                </tr>
              } @empty {
                @if (!loading() && !error()) {
                  <tr><td colspan="6">
                    <app-empty-state [filtered]="hasFilters()" (clear)="clearFilters(bar)" (action)="goProducts()"
                      [title]="hasFilters() ? 'No hay productos con esos filtros' : 'Todavía no controlas inventario de ningún producto'"
                      text="En Productos y servicios, marca «Controlar existencias» en los bienes que vendes o compras. Luego registra la existencia inicial con un ajuste."
                      actionLabel="Ir a Productos y servicios" [canAct]="true" />
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
export class Stock {
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  private readonly router = inject(Router);

  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly qty = qty;
  protected readonly limit = 50;
  protected readonly rows = signal<StockRow[]>([]);
  protected readonly total = signal(0);
  protected readonly totalValue = signal('0');
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly hasFilters = signal(false);
  private filters: Record<string, string> = {};
  protected readonly search$ = new Subject<string>();

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((q) => this.setFilter('q', q));
    void this.load();
  }

  protected goProducts(): void { void this.router.navigateByUrl('/products'); }
  protected setFilter(key: string, value: string): void { this.filters = { ...this.filters, [key]: value }; this.page.set(1); void this.load(); }
  protected clearFilters(bar: HTMLElement): void { resetFilterControls(bar); this.filters = {}; this.page.set(1); void this.load(); }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    this.hasFilters.set(Object.values(this.filters).some((v) => !!v));
    try {
      const res = await this.api.getP<Page<StockRow> & { totalValue: string }>('/inventory/stock', { ...this.filters, page: this.page(), limit: this.limit });
      this.rows.set(res.data); this.total.set(res.total); this.totalValue.set(res.totalValue);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
}
