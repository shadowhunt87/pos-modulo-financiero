import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api, Page } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { FEEDBACK_KIND, optsFeedback, ROLE } from '../../shared/labels';
import { ErrorNotice, UI } from '../../shared/ui';
import { FeedbackStatusBadge } from './feedback-badge';
import { FeedbackAdminRow } from './feedback-types';

/** "Comentarios recibidos" (solo ADMIN): lista con filtros y un detalle donde se cambia el estado, se responde y se anota la tarea. */
@Component({
  selector: 'app-feedback-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FeedbackStatusBadge, ErrorNotice, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Comentarios recibidos</h1><p class="sub">Lo que las personas de tu empresa le cuentan al equipo. Responde para que lo vean en “Mis comentarios”.</p></div>
      </div>

      <div class="toolbar">
        <div class="field"><label for="fs">Estado</label>
          <select id="fs" class="select" (change)="setFilter('status', $any($event.target).value)">
            <option value="">Todos</option>@for (o of statusOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
        <div class="field"><label for="fk">Tipo</label>
          <select id="fk" class="select" (change)="setFilter('kind', $any($event.target).value)">
            <option value="">Todos</option>@for (o of kindOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
      </div>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Fecha</th><th>Quién</th><th>Tipo</th><th>Comentario</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="6"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (f of rows(); track f.id) {
                <tr class="clickable" (click)="openDetail(f)">
                  <td class="nowrap">{{ f.createdAt | fdatetime }}</td>
                  <td>{{ f.user?.name ?? 'Usuario eliminado' }}@if (f.user) { <div class="dim">{{ ROLE[f.user.role] ?? f.user.role }}</div> }</td>
                  <td>{{ KIND[f.kind] ?? f.kind }}</td>
                  <td class="snippet">{{ f.message }}</td>
                  <td><app-feedback-status [value]="f.status" />@if (f.response) { <div class="dim">Con respuesta</div> }</td>
                  <td class="actions"><button type="button" class="btn btn-sm" (click)="openDetail(f); $event.stopPropagation()">Ver y responder</button></td>
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr><td colspan="6" class="table-empty">
                    @if (hasFilters()) { No hay comentarios con esos filtros. Prueba con “Todos”. }
                    @else { Todavía no hay comentarios. Cuando alguien use “Enviar comentario”, aparecerá aquí. }
                  </td></tr>
                }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>
    </div>

    <app-modal [open]="current() !== null" title="Comentario" width="640px" (closed)="close()">
      @if (current(); as c) {
        <div class="head">
          <strong>{{ KIND[c.kind] ?? c.kind }}</strong>
          <app-feedback-status [value]="c.status" />
        </div>
        <p class="dim meta">
          {{ c.user?.name ?? 'Usuario eliminado' }}@if (c.user) { · {{ c.user.email }} · {{ ROLE[c.user.role] ?? c.user.role }} }
          · {{ c.createdAt | fdatetime }}
        </p>
        <p class="msg">{{ c.message }}</p>
        <p class="dim meta">Pantalla: <span class="mono">{{ c.route }}</span></p>
        @if (c.userAgent) { <p class="dim meta">Navegador: {{ c.userAgent }}</p> }

        <hr class="sep" />
        <div class="stack">
          <div class="field"><label for="d-status">Estado</label>
            <select id="d-status" class="select" [value]="status()" (change)="status.set($any($event.target).value)">
              @for (o of statusOptions; track o.value) { <option [value]="o.value" [selected]="o.value === status()">{{ o.label }}</option> }
            </select></div>
          <div class="field"><label for="d-resp">Respuesta para quien lo envió</label>
            <textarea id="d-resp" class="textarea" rows="4" maxlength="1000" [value]="response()" (input)="response.set($any($event.target).value)"
              placeholder="Por ejemplo: Ya lo corregimos, lo verás en la próxima actualización."></textarea>
            <span class="count" [class.near]="response().length > 900">{{ response().length }} de 1000 caracteres</span></div>
          <div class="field"><label for="d-ref">Referencia de la tarea</label>
            <input id="d-ref" class="input" maxlength="100" [value]="taskRef()" (input)="taskRef.set($any($event.target).value)" placeholder="Por ejemplo: #42" />
            <span class="hint">Opcional. El número del issue donde se atiende.</span></div>
        </div>
        @if (formError()) { <app-error-notice style="display:block;margin-top:12px" [error]="formError()" /> }
      }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="close()">Cancelar</button>
        <button type="button" class="btn btn-primary" [disabled]="saving()" (click)="save()">{{ saving() ? 'Guardando…' : 'Guardar cambios' }}</button>
      </ng-container>
    </app-modal>
  `,
  styles: `
    .nowrap { white-space: nowrap; }
    .snippet { max-width: 360px; min-width: 200px; overflow-wrap: anywhere; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .head { display: flex; flex-wrap: wrap; gap: 8px 10px; align-items: center; }
    .meta { margin: 6px 0 0; font-size: 12px; overflow-wrap: anywhere; }
    .msg { margin: 12px 0 8px; white-space: pre-wrap; overflow-wrap: anywhere; }
    .sep { border: 0; border-top: 1px solid var(--line); margin: 14px 0; }
    .stack { display: flex; flex-direction: column; gap: 14px; }
    .count { align-self: flex-end; font-size: 12px; color: var(--text-dim); }
    .count.near { color: var(--warn); font-weight: 600; }
  `,
})
export class FeedbackInbox {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly ROLE: Record<string, string> = ROLE;
  protected readonly KIND = FEEDBACK_KIND;
  protected readonly statusOptions = optsFeedback.status;
  protected readonly kindOptions = optsFeedback.kind;
  protected readonly limit = 25;

  protected readonly rows = signal<FeedbackAdminRow[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private filters: Record<string, string> = {};
  protected readonly hasFilters = signal(false);

  protected readonly current = signal<FeedbackAdminRow | null>(null);
  protected readonly status = signal('NEW');
  protected readonly response = signal('');
  protected readonly taskRef = signal('');
  protected readonly saving = signal(false);
  protected readonly formError = signal<unknown>('');

  constructor() { void this.load(); }

  protected setFilter(key: string, value: string): void {
    this.filters = { ...this.filters, [key]: value };
    this.hasFilters.set(Object.values(this.filters).some((v) => v !== ''));
    this.page.set(1);
    void this.load();
  }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await this.api.getP<Page<FeedbackAdminRow>>('/feedback', { ...this.filters, page: this.page(), limit: this.limit });
      this.rows.set(res.data);
      this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openDetail(f: FeedbackAdminRow): void {
    this.status.set(f.status);
    this.response.set(f.response ?? '');
    this.taskRef.set(f.taskRef ?? '');
    this.formError.set('');
    this.saving.set(false);
    this.current.set(f);
  }
  protected close(): void { this.current.set(null); }

  protected async save(): Promise<void> {
    const c = this.current();
    if (!c || this.saving()) return;
    this.saving.set(true);
    this.formError.set('');
    try {
      // "" borra la respuesta o la referencia (así lo pide el servidor)
      await firstValueFrom(this.api.patch(`/feedback/${c.id}`, { status: this.status(), response: this.response().trim(), taskRef: this.taskRef().trim() }));
      this.notify.ok('Cambios guardados.');
      this.current.set(null);
      await this.load();
    } catch (e) { this.formError.set(e); }
    this.saving.set(false);
  }
}
