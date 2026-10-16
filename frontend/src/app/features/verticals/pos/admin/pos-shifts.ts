import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../../../core/api';
import { errorMessage } from '../../../../core/errors';
import { UI } from '../../../../shared/ui';

interface Row { id: string; number: string; status: 'OPEN' | 'CLOSED'; openedAt: string; closedAt: string | null; openingCash: string; expectedCash: string | null; countedCash: string | null; difference: string | null; terminal: { code: string; name: string }; _count: { sales: number } }

/** Turnos de caja: abiertos y cerrados, con la diferencia del cierre. */
@Component({
  selector: 'app-pos-shifts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Turnos de caja</h1><p class="sub">Cada apertura y cierre de caja, con lo que debía haber y lo que se contó.</p></div></div>
      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Turno</th><th>Caja</th><th>Abierto</th><th>Cerrado</th><th class="num">Ventas</th><th class="num">Esperado</th><th class="num">Contado</th><th class="num">Diferencia</th><th>Estado</th></tr></thead>
          <tbody>
            @for (s of rows(); track s.id) {
              <tr><td><a class="mono" [routerLink]="['/pos/turnos', s.id]">{{ s.number }}</a></td><td>{{ s.terminal.name }}</td>
                <td>{{ s.openedAt | fdatetime }}</td><td>{{ s.closedAt | fdatetime }}</td><td class="num">{{ s._count.sales }}</td>
                <td class="num">{{ s.expectedCash | money }}</td><td class="num">{{ s.countedCash | money }}</td>
                <td class="num" [class.neg]="+(s.difference ?? 0) < 0" [class.pos]="+(s.difference ?? 0) > 0">{{ s.difference | money }}</td>
                <td><app-status [value]="s.status === 'OPEN' ? 'OPEN' : 'CLOSED_OK'" [map]="STATUS" /></td></tr>
            } @empty { <tr><td colspan="9" class="table-empty">{{ loading() ? 'Cargando…' : 'Todavía no hay turnos.' }}</td></tr> }
          </tbody>
        </table></div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>
    </div>
  `,
})
export class PosShiftsPage {
  private readonly api = inject(Api);
  protected readonly STATUS: Record<string, string> = { OPEN: 'Abierto', CLOSED_OK: 'Cerrado' };
  protected readonly limit = 30;
  protected readonly rows = signal<Row[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  constructor() { void this.load(); }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }
  private async load(): Promise<void> {
    this.loading.set(true);
    try { const r = await this.api.getP<{ data: Row[]; total: number }>('/pos/shifts', { page: this.page(), limit: this.limit }); this.rows.set(r.data); this.total.set(r.total); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
}
