import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime, firstValueFrom } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Product } from '../../core/models';
import { Notify } from '../../core/notify';
import { EmptyState, UI } from '../../shared/ui';
import { resetFilterControls } from '../../shared/ui/empty-state';
import { ProductDialog } from './product-dialog';

/** Catálogo de productos y servicios (P1): lo que vendes o compras, con su precio, impuesto y cuentas. */
@Component({
  selector: 'app-products',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ProductDialog, EmptyState, RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Productos y servicios</h1><p class="sub">Lo que vendes o compras. Al facturar, elígelos y se llenan la descripción, el precio y el impuesto.</p></div>
        @if (canEdit) { <button type="button" class="btn btn-primary" (click)="openNew()">Nuevo producto o servicio</button> }
      </div>

      <div class="toolbar" #bar>
        <div class="field wide"><label for="q">Buscar</label><input id="q" class="input" placeholder="Código o nombre" (input)="search$.next($any($event.target).value)" /></div>
        <div class="field"><label for="kind">Tipo</label>
          <select id="kind" class="select" (change)="setFilter('kind', $any($event.target).value)">
            <option value="">Todos</option><option value="GOODS">Bienes</option><option value="SERVICE">Servicios</option></select></div>
        <div class="field"><label for="act">Estado</label>
          <select id="act" class="select" (change)="setFilter('active', $any($event.target).value)">
            <option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option></select></div>
      </div>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th class="num">Precio de venta</th><th>Impuesto</th><th class="num">Existencia</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="8"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (p of rows(); track p.id) {
                <tr>
                  <td class="mono">{{ p.code }}</td>
                  <td><strong>{{ p.name }}</strong><div class="dim">{{ p.unit }}</div></td>
                  <td>{{ p.kind === 'GOODS' ? 'Bien' : 'Servicio' }}</td>
                  <td class="num">{{ p.salePrice === null ? '—' : (p.salePrice | money) }}</td>
                  <td>{{ p.saleTaxRate?.name ?? '—' }}</td>
                  <td class="num">
                    @if (p.tracksInventory) { <a [routerLink]="['/inventory/products', p.id]">{{ qty(p.stockQty) }}</a> } @else { <span class="dim">No controla</span> }
                  </td>
                  <td><span class="badge" [class.pos]="p.active">{{ p.active ? 'Activo' : 'Inactivo' }}</span></td>
                  <td class="actions">
                    @if (canEdit) {
                      <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(p)">Editar</button>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(p)">{{ p.active ? 'Desactivar' : 'Activar' }}</button>
                    }
                  </td>
                </tr>
              } @empty {
                @if (!loading() && !error()) {
                  <tr><td colspan="8">
                    <app-empty-state [filtered]="hasFilters()" (clear)="clearFilters(bar)" (action)="openNew()"
                      [title]="hasFilters() ? 'No hay productos con esos filtros' : 'Aún no tienes productos ni servicios'"
                      text="Registra lo que vendes o compras para facturar más rápido y, si son mercancías, llevar sus existencias."
                      actionLabel="Nuevo producto o servicio" [canAct]="canEdit" />
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>
    </div>

    <app-product-dialog [open]="modalOpen()" [product]="editing()" (saved)="onSaved()" (closed)="modalOpen.set(false)" />
  `,
})
export class Products {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly limit = 25;
  protected readonly rows = signal<Product[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly hasFilters = signal(false);
  private filters: Record<string, string> = {};
  protected readonly search$ = new Subject<string>();
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Product | null>(null);

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((q) => this.setFilter('q', q));
    void this.load();
  }

  protected qty(v: string): string { return Number(v).toLocaleString('es-DO', { maximumFractionDigits: 4 }); }
  protected setFilter(key: string, value: string): void { this.filters = { ...this.filters, [key]: value }; this.page.set(1); void this.load(); }
  protected clearFilters(bar: HTMLElement): void { resetFilterControls(bar); this.filters = {}; this.page.set(1); void this.load(); }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    this.hasFilters.set(Object.values(this.filters).some((v) => !!v));
    try {
      const res = await this.api.getP<Page<Product>>('/products', { ...this.filters, page: this.page(), limit: this.limit });
      this.rows.set(res.data); this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void { this.editing.set(null); this.modalOpen.set(true); }
  protected openEdit(p: Product): void { this.editing.set(p); this.modalOpen.set(true); }
  protected onSaved(): void { this.modalOpen.set(false); void this.load(); }

  protected async toggle(p: Product): Promise<void> {
    const to = !p.active;
    if (!(await this.confirm.ask({
      title: to ? 'Activar producto' : 'Desactivar producto',
      message: to ? `${p.name} volverá a aparecer al facturar.` : `${p.name} dejará de aparecer al facturar. Sus facturas y existencias no cambian.`,
      confirmText: to ? 'Activar' : 'Desactivar', danger: !to,
    }))) return;
    try {
      await firstValueFrom(this.api.patch(`/products/${p.id}`, { active: to }));
      this.notify.ok(to ? 'Producto activado.' : 'Producto desactivado.');
      void this.lookups.ensureProducts(true);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
