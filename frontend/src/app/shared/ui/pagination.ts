import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

@Component({
  selector: 'app-pagination',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (total() > 0) {
      <div class="pg">
        <span class="dim">{{ from() }}–{{ to() }} de {{ total() }}</span>
        <div class="btn-row">
          <button type="button" class="btn btn-sm" [disabled]="page() <= 1" (click)="go(page() - 1)">Anterior</button>
          <span class="dim">Página {{ page() }} de {{ pages() }}</span>
          <button type="button" class="btn btn-sm" [disabled]="page() >= pages()" (click)="go(page() + 1)">Siguiente</button>
        </div>
      </div>
    }
  `,
  styles: `.pg { display: flex; align-items: center; justify-content: space-between; padding: 12px 4px; gap: 12px; flex-wrap: wrap; }`,
})
export class Pagination {
  readonly page = input(1);
  readonly limit = input(25);
  readonly total = input(0);
  readonly pageChange = output<number>();
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.total() / this.limit())));
  protected readonly from = computed(() => (this.page() - 1) * this.limit() + 1);
  protected readonly to = computed(() => Math.min(this.total(), this.page() * this.limit()));
  go(p: number): void { this.pageChange.emit(p); }
}
