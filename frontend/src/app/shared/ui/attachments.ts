import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Api } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { Confirm } from '../../core/confirm';
import { PIPES } from '../pipes/pipes';

export type AttachmentParent = 'invoiceId' | 'paymentId' | 'journalEntryId' | 'reconciliationId';
interface AttachmentRow { id: string; fileName: string; mimeType: string; sizeBytes: number | null; uploadedAt: string }

/** Soportes (PDF, imágenes, Excel…) de una factura, pago, asiento o conciliación. */
@Component({
  selector: 'app-attachments',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...PIPES],
  template: `
    <section class="panel">
      <div class="panel-head">
        <h2>Soportes</h2>
        @if (canEdit()) {
          <label class="btn btn-sm" [attr.aria-disabled]="busy()">
            {{ busy() ? 'Subiendo…' : 'Agregar archivo' }}
            <input type="file" class="sr-only" [disabled]="busy()" accept=".pdf,.png,.jpg,.jpeg,.webp,.xlsx,.docx,.csv,.txt" (change)="pick($event)" />
          </label>
        }
      </div>
      @if (rows().length) {
        <ul class="list">
          @for (a of rows(); track a.id) {
            <li>
              <button type="button" class="link" (click)="download(a)">{{ a.fileName }}</button>
              <span class="faint">{{ size(a.sizeBytes) }} · {{ a.uploadedAt | fdate }}</span>
              @if (canEdit()) { <button type="button" class="btn btn-ghost btn-sm" (click)="remove(a)">Quitar</button> }
            </li>
          }
        </ul>
      } @else {
        <p class="dim pad">{{ loaded() ? 'Todavía no hay soportes adjuntos.' : 'Cargando…' }}</p>
      }
    </section>
  `,
  styles: `
    .list { list-style: none; margin: 0; padding: 4px 20px 8px; }
    li { display: flex; gap: 12px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--line); } li:last-child { border: 0; }
    .link { background: none; border: 0; padding: 0; color: var(--primary); cursor: pointer; font-weight: 500; text-align: left; flex: 1; }
    .link:hover { text-decoration: underline; } .pad { padding: 14px 20px; }
    label.btn { position: relative; cursor: pointer; }
  `,
})
export class AttachmentsPanel {
  readonly parent = input.required<AttachmentParent>();
  readonly parentId = input.required<string>();
  /** Si es false (p. ej. período cerrado o rol de solo lectura) oculta subir y quitar. */
  readonly canEdit = input(true);

  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  protected readonly rows = signal<AttachmentRow[]>([]);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);

  constructor() {
    effect(() => { const id = this.parentId(); if (id) void this.load(); });
  }

  protected size(b: number | null): string {
    if (!b) return '';
    return b < 1024 * 1024 ? `${Math.max(1, Math.round(b / 1024))} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
  }
  private async load(): Promise<void> {
    try {
      this.rows.set(await this.api.getP<AttachmentRow[]>('/attachments', { [this.parent()]: this.parentId() }));
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.loaded.set(true);
  }
  protected async pick(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.busy.set(true);
    try {
      await new Promise<void>((resolve, reject) =>
        this.api.upload('/attachments', file, { [this.parent()]: this.parentId() }).subscribe({ next: () => resolve(), error: reject }));
      this.notify.ok('Archivo adjuntado.');
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }
  protected async download(a: AttachmentRow): Promise<void> {
    try { await this.api.download(`/attachments/${a.id}/download`, undefined, a.fileName); }
    catch (e) { this.notify.error(errorMessage(e)); }
  }
  protected async remove(a: AttachmentRow): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Quitar soporte', message: `Se eliminará “${a.fileName}”.`, confirmText: 'Quitar', danger: true }))) return;
    try {
      await new Promise<void>((resolve, reject) => this.api.delete(`/attachments/${a.id}`).subscribe({ next: () => resolve(), error: reject }));
      this.notify.ok('Soporte eliminado.');
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
