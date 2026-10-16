import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../../core/api';
import { errorMessage } from '../../../../core/errors';
import { Notify } from '../../../../core/notify';
import { ErrorNotice, UI } from '../../../../shared/ui';

interface Category { id: string; name: string; color: string | null; sortOrder: number; active: boolean }
interface Row { id: string; code: string; name: string; salePrice: string | null; kind: string; categoryId: string | null; showInPos: boolean; sortOrder: number; barcodes: string[]; codesText?: string; dirty?: boolean }

/** Productos en caja: categorías de la caja y, por producto, si aparece, su categoría y sus códigos de barra. */
@Component({
  selector: 'app-pos-products',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ErrorNotice, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Productos en caja</h1><p class="sub">Los productos son los de «Productos y servicios». Aquí decides cuáles aparecen en la caja, en qué categoría y con qué códigos de barra.</p></div>
        <button type="button" class="btn btn-primary" [disabled]="!dirtyCount() || busy()" (click)="save()">Guardar cambios @if (dirtyCount()) { ({{ dirtyCount() }}) }</button>
      </div>
      <app-error-notice [error]="error()" />

      <section class="panel" style="margin-bottom:16px">
        <div class="panel-head"><h2>Categorías de la caja</h2></div>
        <div class="panel-pad">
          <div class="cats">
            @for (c of categories(); track c.id) {
              <span class="chip" [class.off]="!c.active"><i [style.background]="c.color || '#cbd5e1'"></i>{{ c.name }}
                <button type="button" class="x" (click)="toggleCategory(c)" [attr.aria-label]="(c.active ? 'Desactivar ' : 'Activar ') + c.name">{{ c.active ? '✕' : '↺' }}</button></span>
            } @empty { <span class="dim">Sin categorías: la caja muestra todo junto.</span> }
          </div>
          <form class="toolbar" style="margin:14px 0 0" (ngSubmit)="addCategory()">
            <div class="field wide"><label for="c-n">Nueva categoría</label><input id="c-n" name="n" class="input" [(ngModel)]="newCat" placeholder="Bebidas, Lubricantes…" /></div>
            <div class="field" style="width:90px"><label for="c-c">Color</label><input id="c-c" name="c" class="input" type="color" [(ngModel)]="newColor" /></div>
            <button type="submit" class="btn" style="align-self:end" [disabled]="!newCat.trim()">Agregar</button>
          </form>
        </div>
      </section>

      <div class="toolbar"><div class="field wide"><label for="q">Buscar</label><input id="q" class="input" [ngModel]="q()" (ngModelChange)="q.set($event)" placeholder="Código o nombre" /></div></div>
      <section class="panel">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Producto</th><th class="num">Precio (sin ITBIS)</th><th>En caja</th><th>Categoría</th><th>Códigos de barra</th></tr></thead>
          <tbody>
            @for (r of filtered(); track r.id) {
              <tr>
                <td><strong>{{ r.name }}</strong><div class="dim mono">{{ r.code }}</div></td>
                <td class="num">@if (r.salePrice !== null) { {{ r.salePrice | money }} } @else { <span class="neg">Sin precio</span> }</td>
                <td><label class="check"><input type="checkbox" [(ngModel)]="r.showInPos" (ngModelChange)="mark(r)" [attr.aria-label]="'Mostrar ' + r.name + ' en la caja'" /> Sí</label></td>
                <td><select class="select" [(ngModel)]="r.categoryId" (ngModelChange)="mark(r)" [attr.aria-label]="'Categoría de ' + r.name"><option [ngValue]="null">—</option>
                  @for (c of activeCategories(); track c.id) { <option [ngValue]="c.id">{{ c.name }}</option> }</select></td>
                <td><input class="input mono" [(ngModel)]="r.codesText" (ngModelChange)="mark(r)" placeholder="7501234567890, …" [attr.aria-label]="'Códigos de ' + r.name" /></td>
              </tr>
            } @empty { <tr><td colspan="5" class="table-empty">{{ loading() ? 'Cargando…' : 'No hay productos. Créalos en «Productos y servicios» con su precio de venta.' }}</td></tr> }
          </tbody>
        </table></div>
      </section>
      <p class="hint" style="margin-top:10px">Un producto sin precio de venta no aparece en la caja. Separa varios códigos de barra con comas.</p>
    </div>
  `,
  styles: `
    .cats { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip { display: inline-flex; align-items: center; gap: 7px; height: 32px; padding: 0 6px 0 12px; border: 1px solid var(--line); border-radius: 999px; font-weight: 500; }
    .chip.off { opacity: .5; }
    .chip i { width: 9px; height: 9px; border-radius: 50%; }
    .x { border: 0; background: none; cursor: pointer; color: var(--text-faint); width: 22px; height: 22px; border-radius: 50%; }
    .x:hover { background: var(--surface-2); color: var(--text); }
    td .select, td .input { height: 32px; font-size: 13px; }
  `,
})
export class PosProductsPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly categories = signal<Category[]>([]);
  protected readonly rows = signal<Row[]>([]);
  protected readonly q = signal('');
  private readonly tick = signal(0);
  protected newCat = ''; protected newColor = '#0f766e';
  protected readonly activeCategories = computed(() => this.categories().filter((c) => c.active));
  protected readonly filtered = computed(() => {
    this.tick();
    const q = this.q().trim().toLowerCase();
    return this.rows().filter((r) => !q || r.name.toLowerCase().includes(q) || r.code.toLowerCase().includes(q));
  });
  protected readonly dirtyCount = computed(() => { this.tick(); return this.rows().filter((r) => r.dirty).length; });

  constructor() { void this.load(); }
  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [cats, rows] = await Promise.all([this.api.getP<Category[]>('/pos/categories'), this.api.getP<Row[]>('/pos/product-settings')]);
      this.categories.set(cats);
      this.rows.set(rows.map((r) => ({ ...r, codesText: r.barcodes.join(', '), dirty: false })));
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
  protected mark(r: Row): void { r.dirty = true; this.tick.update((n) => n + 1); }
  protected async addCategory(): Promise<void> {
    try { await firstValueFrom(this.api.post('/pos/categories', { name: this.newCat.trim(), color: this.newColor, sortOrder: this.categories().length })); this.newCat = ''; this.categories.set(await this.api.getP<Category[]>('/pos/categories')); }
    catch (e) { this.notify.error(errorMessage(e)); }
  }
  protected async toggleCategory(c: Category): Promise<void> {
    try { await firstValueFrom(this.api.patch(`/pos/categories/${c.id}`, { name: c.name, active: !c.active })); this.categories.set(await this.api.getP<Category[]>('/pos/categories')); }
    catch (e) { this.notify.error(errorMessage(e)); }
  }
  protected async save(): Promise<void> {
    const items = this.rows().filter((r) => r.dirty).map((r) => ({
      productId: r.id, categoryId: r.categoryId, showInPos: r.showInPos,
      barcodes: (r.codesText ?? '').split(',').map((x) => x.trim()).filter(Boolean),
    }));
    this.busy.set(true);
    try { await firstValueFrom(this.api.put('/pos/product-settings', { items })); this.notify.ok('Productos en caja guardados.'); await this.load(); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }
}
