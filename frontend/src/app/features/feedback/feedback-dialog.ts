import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { FeedbackLauncher } from '../../core/feedback-launcher';
import { Notify } from '../../core/notify';
import { RouteInfo } from '../../core/route-info';
import { FEEDBACK_KIND_HINT, optsFeedback } from '../../shared/labels';
import { ErrorNotice, Modal } from '../../shared/ui';

const MAX = 2000;

/**
 * "Enviar comentario": se abre desde la barra superior en cualquier pantalla. La pantalla desde la que se envía
 * (ruta) se adjunta sola; el navegador lo toma el servidor. El texto se guarda tal cual y se muestra siempre escapado.
 */
@Component({
  selector: 'app-feedback-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, ErrorNotice],
  template: `
    <app-modal [open]="open()" title="Enviar comentario" width="560px" (closed)="closed.emit()">
      <p class="sub">Cuéntanos qué te pasó o qué te gustaría. Lo lee una persona del equipo.</p>
      <fieldset class="kinds">
        <legend class="label">¿Qué pasó?</legend>
        @for (o of kinds; track o.value) {
          <label class="kind" [class.sel]="kind() === o.value">
            <input type="radio" name="fb-kind" [value]="o.value" [checked]="kind() === o.value" (change)="kind.set(o.value)" />
            <span><strong>{{ o.label }}</strong><small>{{ hints[o.value] }}</small></span>
          </label>
        }
      </fieldset>
      <div class="field" style="margin-top:14px">
        <label for="fb-msg">Cuéntanos</label>
        <textarea id="fb-msg" class="textarea" rows="6" [attr.maxlength]="max" [value]="message()" (input)="message.set($any($event.target).value)"
          placeholder="Por ejemplo: Quería crear un cliente y no encontré dónde"></textarea>
        <span class="count" [class.near]="message().length > max - 100" aria-live="polite">{{ message().length }} de {{ max }} caracteres</span>
      </div>
      <p class="hint">Con tu comentario se envía solo la pantalla en la que estás ({{ route() }}). No escribas claves.</p>
      @if (error()) { <app-error-notice style="display:block;margin-top:12px" [error]="error()" /> }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
        <button type="button" class="btn btn-primary" [disabled]="sending() || !message().trim()" (click)="send()">{{ sending() ? 'Enviando…' : 'Enviar comentario' }}</button>
      </ng-container>
    </app-modal>
  `,
  styles: `
    .sub { color: var(--text-dim); margin: 0 0 12px; }
    .kinds { border: 0; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .kind { display: flex; gap: 10px; align-items: flex-start; padding: 10px 12px; border: 1px solid var(--line-strong); border-radius: var(--radius); cursor: pointer; }
    .kind:hover { border-color: var(--text-faint); }
    .kind.sel { border-color: var(--primary); background: var(--surface-2); }
    .kind input { margin-top: 3px; }
    .kind span { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .kind small { color: var(--text-dim); }
    .count { align-self: flex-end; font-size: 12px; color: var(--text-dim); }
    .count.near { color: var(--warn); font-weight: 600; }
    .hint { margin: 10px 0 0; font-size: 12px; color: var(--text-dim); overflow-wrap: anywhere; }
  `,
})
export class FeedbackDialog {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly info = inject(RouteInfo);
  private readonly launcher = inject(FeedbackLauncher);

  readonly open = input(false);
  readonly closed = output<void>();

  protected readonly max = MAX;
  protected readonly kinds = optsFeedback.kind;
  protected readonly hints = FEEDBACK_KIND_HINT;
  protected readonly kind = signal<string>('CONFUSING');
  protected readonly message = signal('');
  protected readonly sending = signal(false);
  protected readonly error = signal<unknown>('');
  /** Pantalla actual (sin parámetros de consulta); es lo que se adjunta. */
  protected readonly route = () => this.info.state().url.slice(0, 200) || '/';

  constructor() {
    // Cada vez que se abre, queda limpio (si el envío falló, se conserva lo escrito mientras siga abierto).
    effect(() => {
      if (!this.open()) return;
      untracked(() => { this.kind.set('CONFUSING'); this.message.set(''); this.error.set(''); this.sending.set(false); });
    });
  }

  protected async send(): Promise<void> {
    if (this.sending() || !this.message().trim()) return;
    this.sending.set(true);
    this.error.set('');
    try {
      await firstValueFrom(this.api.post('/feedback', { kind: this.kind(), message: this.message(), route: this.route() }));
      this.notify.ok('Gracias. Tu comentario llegó al equipo');
      this.launcher.sent.update((n) => n + 1);
      this.closed.emit();
    } catch (e) {
      // El tope de 20 por hora responde 429 con un mensaje claro del servidor: se muestra tal cual.
      const body = e instanceof HttpErrorResponse && e.status === 429 ? (e.error as { message?: string } | null)?.message : null;
      this.error.set(typeof body === 'string' && body ? body : e);
    }
    this.sending.set(false);
  }
}
