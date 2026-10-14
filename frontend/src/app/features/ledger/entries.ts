import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { ENTRY_STATUS, ENTRY_TYPE, opts } from '../../shared/labels';
import { sumDec } from '../../shared/format';
import { UI } from '../../shared/ui';
import { Entry } from './ledger-shared';

/** Libro diario: asientos con filtros por estado, tipo, diario, fechas y búsqueda. */
@Component({
  selector: 'app-entries',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Asientos contables</h1><p class="sub">Movimientos del libro diario, con su estado de aprobación.</p></div>
        @if (canCreate) { <a class="btn btn-primary" routerLink="/entries/new">Nuevo asiento</a> }
      </div>

      <div class="toolbar">
        <div class="field wide"><label for="q">Buscar</label><input id="q" class="input" placeholder="Número, descripción o referencia" (input)="search$.next($any($event.target).value)" /></div>
        <div class="field"><label for="st">Estado</label>
          <select id="st" class="select" (change)="setStatus($any($event.target).value)">
            <option value="">Todos</option>@for (o of statusOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
            <option value="REVERSED">Reversados</option>
          </select></div>
        <div class="field"><label for="ty">Tipo</label>
          <select id="ty" class="select" (change)="setType($any($event.target).value)">
            <option value="">Todos</option>@for (o of typeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
        <div class="field"><label for="jr">Diario</label>
          <select id="jr" class="select" (change)="setJournal($any($event.target).value)">
            <option value="">Todos</option>@for (j of lookups.journals(); track j.id) { <option [value]="j.id">{{ j.code }} · {{ j.name }}</option> }
          </select></div>
        <div class="field"><label for="fr">Desde</label><input id="fr" type="date" class="input" (change)="setServer('from', $any($event.target).value)" /></div>
        <div class="field"><label for="to">Hasta</label><input id="to" type="date" class="input" (change)="setServer('to', $any($event.target).value)" /></div>
      </div>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Fecha</th><th>Número</th><th>Descripción</th><th>Tipo</th><th>Diario</th><th>Estado</th><th class="num">Total</th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (e of shown(); track e.id) {
                <tr>
                  <td class="nowrap">{{ e.date | fdate }}</td>
                  <td class="mono"><a [routerLink]="['/entries', e.id]">{{ e.number || 'Sin número' }}</a></td>
                  <td><a [routerLink]="['/entries', e.id]"><strong>{{ e.description }}</strong></a>@if (e.reference) { <div class="dim">Ref. {{ e.reference }}</div> }</td>
                  <td>{{ e.type | lbl: ENTRY_TYPE }}</td>
                  <td>{{ journalName(e.journalId) }}</td>
                  <td><app-status [value]="e.status" [map]="ENTRY_STATUS" />@if (e.reversedBy) { <span class="badge warn" [title]="'Reversado por ' + (e.reversedBy.number ?? '')">↺ Reversado</span> }</td>
                  <td class="num">{{ total(e) | money }}</td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="7" class="table-empty">No hay asientos con esos filtros.</td></tr> }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="count()" (pageChange)="goTo($event)" />
      </section>
      @if (clientActive()) { <p class="hint">Con filtros de tipo, diario o búsqueda se revisan todos los asientos del rango de fechas elegido.</p> }
    </div>
  `,
})
export class Entries {
  private readonly api = inject(Api);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly lookups = inject(Lookups);

  protected readonly ENTRY_STATUS = ENTRY_STATUS;
  protected readonly ENTRY_TYPE = ENTRY_TYPE;
  protected readonly statusOptions = opts.entryStatus;
  protected readonly typeOptions = Object.entries(ENTRY_TYPE).map(([value, label]) => ({ value, label }));
  protected readonly canCreate = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly limit = 25;

  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly page = signal(1);
  protected readonly search$ = new Subject<string>();

  // El backend filtra por estado y fechas; tipo, diario y búsqueda se aplican aquí sobre todo el rango.
  private server: Record<string, string> = {};
  private readonly typeF = signal('');
  private readonly journalF = signal('');
  private readonly qF = signal('');
  protected readonly clientActive = computed(() => !!(this.typeF() || this.journalF() || this.qF()));

  private readonly pageRows = signal<Entry[]>([]);
  private readonly pageTotal = signal(0);
  private readonly allRows = signal<Entry[] | null>(null);

  private readonly filtered = computed(() => {
    const all = this.allRows();
    if (!all) return [];
    const t = this.typeF(), j = this.journalF(), q = this.qF().trim().toLowerCase();
    return all.filter((e) =>
      (!t || e.type === t) && (!j || e.journalId === j) &&
      (!q || `${e.number ?? ''} ${e.description} ${e.reference ?? ''}`.toLowerCase().includes(q)));
  });
  protected readonly shown = computed(() => {
    if (!this.clientActive()) return this.pageRows();
    const from = (this.page() - 1) * this.limit;
    return this.filtered().slice(from, from + this.limit);
  });
  protected readonly count = computed(() => (this.clientActive() ? this.filtered().length : this.pageTotal()));

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((q) => { this.qF.set(q); this.page.set(1); void this.refresh(); });
    void this.lookups.ensureJournals().catch(() => undefined);
    void this.refresh();
  }

  protected journalName(id: string | null): string {
    const j = this.lookups.journals().find((x) => x.id === id);
    return j ? `${j.code} · ${j.name}` : '';
  }
  protected total(e: Entry): string { return sumDec(e.lines.map((l) => l.debit)).toString(); }

  protected setServer(key: string, value: string): void { this.server = { ...this.server, [key]: value }; this.allRows.set(null); this.page.set(1); void this.refresh(); }
  /** «Reversados» no es un estado: es `?reversed=true` (siguen POSTED y tienen su reverso). */
  protected setStatus(v: string): void {
    const { status: _s, reversed: _r, ...rest } = this.server;
    this.server = v === 'REVERSED' ? { ...rest, reversed: 'true' } : { ...rest, ...(v ? { status: v } : {}) };
    this.allRows.set(null); this.page.set(1); void this.refresh();
  }
  protected setType(v: string): void { this.typeF.set(v); this.page.set(1); void this.refresh(); }
  protected setJournal(v: string): void { this.journalF.set(v); this.page.set(1); void this.refresh(); }
  protected goTo(p: number): void { this.page.set(p); if (!this.clientActive()) void this.refresh(); }

  private async refresh(): Promise<void> {
    if (this.clientActive() && this.allRows()) return; // ya está todo en memoria
    this.loading.set(true);
    this.error.set('');
    try {
      if (this.clientActive()) {
        this.allRows.set(await this.api.getAll<Entry>('/accounting/journal-entries', this.server));
      } else {
        const res = await this.api.getP<Page<Entry>>('/accounting/journal-entries', { ...this.server, page: this.page(), limit: this.limit });
        this.pageRows.set(res.data);
        this.pageTotal.set(res.total);
      }
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
}
