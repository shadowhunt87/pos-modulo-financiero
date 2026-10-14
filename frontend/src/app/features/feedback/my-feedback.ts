import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { Api, Page } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { FeedbackLauncher } from '../../core/feedback-launcher';
import { FEEDBACK_KIND } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { FeedbackStatusBadge } from './feedback-badge';
import { FeedbackMine } from './feedback-types';

/** "Mis comentarios": lo que envié yo, con su estado y la respuesta del equipo. Tarjetas (se leen bien en el celular). */
@Component({
  selector: 'app-my-feedback',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FeedbackStatusBadge, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Mis comentarios</h1><p class="sub">Lo que le has contado al equipo y lo que respondió.</p></div>
        <button type="button" class="btn btn-primary" (click)="launcher.open()">Enviar comentario</button>
      </div>

      <app-error-notice [error]="error()" />
      @if (loading()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
      @else if (!rows().length && !error()) {
        <div class="panel empty">
          <h3>Todavía no has enviado comentarios</h3>
          <p>Si algo no se entiende o no funciona, usa “Enviar comentario” arriba. Tu respuesta aparecerá aquí.</p>
          <button type="button" class="btn btn-primary" style="margin-top:12px" (click)="launcher.open()">Enviar mi primer comentario</button>
        </div>
      } @else {
        <ul class="list">
          @for (f of rows(); track f.id) {
            <li class="panel item">
              <div class="top">
                <strong>{{ KIND[f.kind] ?? f.kind }}</strong>
                <app-feedback-status [value]="f.status" />
                <span class="dim when">{{ f.createdAt | fdatetime }}</span>
              </div>
              <p class="msg">{{ f.message }}</p>
              <p class="dim where">Desde la pantalla: <span class="mono">{{ f.route }}</span></p>
              @if (f.response) {
                <div class="notice info reply"><div><strong>Respuesta del equipo</strong><p class="msg">{{ f.response }}</p></div></div>
              } @else if (f.status === 'NEW') {
                <p class="dim">Todavía no tiene respuesta. El equipo revisa los comentarios cada semana.</p>
              }
              @if (f.taskRef) { <p class="dim">Referencia: <span class="mono">{{ f.taskRef }}</span></p> }
            </li>
          }
        </ul>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      }
    </div>
  `,
  styles: `
    .list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 12px; }
    .item { padding: 14px 16px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .top { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 10px; }
    .when { margin-left: auto; }
    .msg { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
    .where { margin: 0; font-size: 12px; overflow-wrap: anywhere; }
    .reply { color: var(--text); }
    .reply p { margin-top: 4px; }
  `,
})
export class MyFeedback {
  private readonly api = inject(Api);
  protected readonly launcher = inject(FeedbackLauncher);
  protected readonly KIND = FEEDBACK_KIND;
  protected readonly limit = 20;
  protected readonly rows = signal<FeedbackMine[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');

  constructor() {
    // Carga al entrar y de nuevo cada vez que se envía un comentario nuevo desde el diálogo.
    effect(() => { this.launcher.sent(); untracked(() => { this.page.set(1); void this.load(); }); });
  }

  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await this.api.getP<Page<FeedbackMine>>('/feedback/mine', { page: this.page(), limit: this.limit });
      this.rows.set(res.data);
      this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
}
