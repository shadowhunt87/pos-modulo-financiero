import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { InventoryAdjustment } from '../../core/models';
import { EmptyState, UI } from '../../shared/ui';
import { ADJUSTMENT_STATUS } from './labels';

/** Ajustes de inventario (P2): existencias iniciales, conteos físicos, mermas y daños. */
@Component({
  selector: 'app-adjustments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, EmptyState, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Ajustes de inventario</h1><p class="sub">Para cargar la existencia inicial, cuadrar un conteo físico o sacar mercancía dañada. Cada ajuste genera su asiento.</p></div>
        @if (canEdit) { <a class="btn btn-primary" routerLink="/inventory/adjustments/new">Nuevo ajuste</a> }
      </div>
      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Número</th><th>Fecha</th><th>Motivo</th><th>Contrapartida</th><th class="num">Productos</th><th>Estado</th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="6"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (a of rows(); track a.id) {
                <tr>
                  <td><a [routerLink]="['/inventory/adjustments', a.id]" class="mono">{{ a.number }}</a></td>
                  <td>{{ a.date | fdate }}</td>
                  <td>{{ a.reason }}</td>
                  <td>{{ a.counterAccount.code }} · {{ a.counterAccount.name }}</td>
                  <td class="num">{{ a._count?.lines }}</td>
                  <td><span class="badge" [class.pos]="a.status === 'POSTED'" [class.neg]="a.status === 'VOIDED'">{{ a.status | lbl: ADJUSTMENT_STATUS }}</span></td>
                </tr>
              } @empty {
                @if (!loading() && !error()) {
                  <tr><td colspan="6">
                    <app-empty-state [filtered]="false" (action)="goNew()" title="Todavía no hay ajustes de inventario"
                      text="Empieza registrando la existencia inicial de tus productos." actionLabel="Nuevo ajuste" [canAct]="canEdit" />
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
export class Adjustments {
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly ADJUSTMENT_STATUS = ADJUSTMENT_STATUS;
  protected readonly limit = 25;
  protected readonly rows = signal<InventoryAdjustment[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() { void this.load(); }

  protected goNew(): void { void this.router.navigateByUrl('/inventory/adjustments/new'); }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const res = await this.api.getP<Page<InventoryAdjustment>>('/inventory/adjustments', { page: this.page(), limit: this.limit });
      this.rows.set(res.data); this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
}
