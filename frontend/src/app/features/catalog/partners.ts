import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { Subject, debounceTime } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Partner } from '../../core/models';
import { PartnerDialog } from './partner-dialog';
import { Notify } from '../../core/notify';
import { opts, PARTNER_TYPE } from '../../shared/labels';
import { EmptyState, UI } from '../../shared/ui';
import { resetFilterControls } from '../../shared/ui/empty-state';

/**
 * PANTALLA DE REFERENCIA: listado con filtros y paginación + alta/edición en un modal.
 * Las demás pantallas siguen este mismo esquema (señales, formularios reactivos, avisos, confirmaciones).
 */
@Component({
  selector: 'app-partners',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [PartnerDialog, EmptyState, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Clientes y proveedores</h1><p class="sub">Las personas y empresas a las que les vendes o les compras.</p></div>
        @if (canEdit) { <button type="button" class="btn btn-primary" (click)="openNew()">Nuevo cliente / proveedor</button> }
      </div>

      <div class="toolbar" #bar>
        <div class="field wide"><label for="q">Buscar</label><input id="q" class="input" placeholder="Nombre, nombre comercial o RNC" (input)="search$.next($any($event.target).value)" /></div>
        <div class="field"><label for="type">Tipo</label>
          <select id="type" class="select" (change)="setFilter('type', $any($event.target).value)">
            <option value="">Todos</option>@for (o of typeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
        <div class="field"><label for="act">Estado</label>
          <select id="act" class="select" (change)="setFilter('active', $any($event.target).value)">
            <option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option>
          </select></div>
      </div>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Tipo</th><th>RNC / cédula</th><th>Contacto</th><th class="num">Crédito (días)</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (p of rows(); track p.id) {
                <tr>
                  <td><strong>{{ p.name }}</strong>@if (p.tradeName) { <div class="dim">{{ p.tradeName }}</div> }</td>
                  <td>{{ p.type | lbl: PARTNER_TYPE }}</td>
                  <td class="mono">{{ p.taxId }}</td>
                  <td>{{ p.email }}<div class="dim">{{ p.phone }}</div></td>
                  <td class="num">{{ p.paymentTermsDays }}</td>
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
                  <tr><td colspan="7">
                    <app-empty-state [filtered]="hasFilters()" (clear)="clearFilters(bar)" (action)="openNew()"
                      [title]="hasFilters() ? 'No hay clientes ni proveedores con esos filtros' : 'Aún no tienes clientes ni proveedores'"
                      text="Registra a quién le vendes o le compras para poder hacerle facturas, cobros y pagos."
                      actionLabel="Nuevo cliente / proveedor" [canAct]="canEdit" />
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>
    </div>

    <app-partner-dialog [open]="modalOpen()" [partner]="editing()" defaultType="CUSTOMER" (saved)="onSaved()" (closed)="modalOpen.set(false)" />
  `,
})
export class Partners {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly PARTNER_TYPE = PARTNER_TYPE;
  protected readonly typeOptions = opts.partnerType;
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly limit = 25;

  protected readonly rows = signal<Partner[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly hasFilters = signal(false);
  private filters: Record<string, string> = {};
  protected readonly search$ = new Subject<string>();

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Partner | null>(null);

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((q) => this.setFilter('q', q));
    void this.load();
  }

  protected setFilter(key: string, value: string): void { this.filters = { ...this.filters, [key]: value }; this.page.set(1); void this.load(); }
  protected clearFilters(bar: HTMLElement): void {
    resetFilterControls(bar);
    this.filters = {};
    this.page.set(1); void this.load();
  }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    this.hasFilters.set(Object.values(this.filters).some((v) => !!v));
    try {
      const res = await this.api.getP<Page<Partner>>('/partners', { ...this.filters, page: this.page(), limit: this.limit });
      this.rows.set(res.data);
      this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void { this.editing.set(null); this.modalOpen.set(true); }
  protected openEdit(p: Partner): void { this.editing.set(p); this.modalOpen.set(true); }
  protected onSaved(): void { this.modalOpen.set(false); void this.load(); }

  protected async toggle(p: Partner): Promise<void> {
    const to = !p.active;
    if (!(await this.confirm.ask({ title: to ? 'Activar cliente / proveedor' : 'Desactivar cliente / proveedor', message: to ? `${p.name} volverá a aparecer en los selectores.` : `${p.name} dejará de aparecer en los selectores. Sus documentos no cambian.`, confirmText: to ? 'Activar' : 'Desactivar', danger: !to }))) return;
    try {
      await new Promise<void>((ok, bad) => this.api.patch(`/partners/${p.id}`, { active: to }).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok(to ? 'Cliente / proveedor activado.' : 'Cliente / proveedor desactivado.');
      void this.lookups.ensurePartners(true);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
