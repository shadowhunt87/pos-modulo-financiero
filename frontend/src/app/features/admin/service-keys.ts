import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { ErrorNotice, FieldHelp, UI } from '../../shared/ui';

interface ServiceKey {
  id: string; name: string; prefix: string; sourceModule: string; lastUsedAt: string | null; revokedAt: string | null; createdAt: string;
}
interface CreatedKey extends ServiceKey { key: string; warning: string }

/**
 * Conexiones con otros sistemas (llaves de servicio, INTEGRACION-TALLER §4.7). Solo ADMIN.
 * GET/POST /service-keys, POST /service-keys/:id/revoke.
 */
@Component({
  selector: 'app-service-keys',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Conexiones con otros sistemas</h1>
          <p class="sub">Llaves para que otro sistema (por ejemplo, el del taller) registre aquí sus facturas y cobros. Cada llave solo puede crear clientes, facturas de venta y cobros, y leer lo que ella misma creó.</p></div>
        <button type="button" class="btn btn-primary" (click)="openNew()">Nueva conexión</button>
      </div>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Llave</th><th>Origen de sus facturas</th><th>Último uso</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="6"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (k of rows(); track k.id) {
                <tr>
                  <td>{{ k.name }}<div class="dim">Creada el {{ k.createdAt | fdate }}</div></td>
                  <td class="mono">fsk_{{ k.prefix }}_…</td>
                  <td class="mono">{{ k.sourceModule }}</td>
                  <td>{{ k.lastUsedAt ? (k.lastUsedAt | fdatetime) : 'Nunca' }}</td>
                  <td>@if (k.revokedAt) { <span class="badge neg">Revocada</span> } @else { <span class="badge pos">Activa</span> }</td>
                  <td class="actions">@if (!k.revokedAt) { <button type="button" class="btn btn-ghost btn-sm" (click)="revoke(k)">Revocar</button> }</td>
                </tr>
              } @empty {
                @if (!loading()) {
                  <tr><td colspan="6" class="table-empty">Todavía no hay conexiones. Crea una cuando otro sistema vaya a enviar sus facturas aquí.
                    <div style="margin-top:10px"><button type="button" class="btn btn-primary btn-sm" (click)="openNew()">Crear la primera conexión</button></div></td></tr>
                }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="modalOpen()" [title]="created() ? 'Copia la llave ahora' : 'Nueva conexión'" width="560px" (closed)="close()">
      @if (created(); as c) {
        <div class="notice warn" role="alert" style="margin-bottom:12px">{{ c.warning }}</div>
        <div class="field"><label for="k-val">Llave de «{{ c.name }}»</label>
          <input id="k-val" class="input mono" [value]="c.key" readonly (focus)="$any($event.target).select()" /></div>
        <div class="btn-row" style="margin-top:10px"><button type="button" class="btn" (click)="copy(c.key)">Copiar</button></div>
      } @else {
        <form id="sk-form" [formGroup]="form" (ngSubmit)="create()" novalidate>
          <div class="form-grid">
            <div class="field span-all"><label for="sk-name">Nombre</label>
              <input id="sk-name" class="input" formControlName="name" maxlength="100" placeholder="Taller Sirtech" />
              @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe un nombre para reconocerla.</span> }</div>
            <div class="field span-all"><label for="sk-src">Origen de sus facturas <app-field-help key="conexiones.origen" text="Identifica de dónde vienen las facturas de este sistema, como taller.orden. Te lo da quien instala la conexión; no se puede cambiar después." /></label>
              <input id="sk-src" class="input mono" formControlName="sourceModule" maxlength="70" placeholder="taller.orden" />
              @if (form.controls.sourceModule.touched && form.controls.sourceModule.invalid) { <span class="error-text">Usa el formato sistema.documento, en minúsculas (ej: taller.orden).</span> }</div>
          </div>
          <app-error-notice [error]="formError()" />
        </form>
      }
      <ng-container modal-actions>
        @if (created()) { <button type="button" class="btn btn-primary" (click)="close()">Ya la copié</button> }
        @else {
          <button type="button" class="btn" (click)="close()">Cancelar</button>
          <button type="submit" form="sk-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Creando…' : 'Crear conexión' }}</button>
        }
      </ng-container>
    </app-modal>
  `,
})
export class ServiceKeys {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);

  protected readonly rows = signal<ServiceKey[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly modalOpen = signal(false);
  protected readonly saving = signal(false);
  protected readonly formError = signal<unknown>(null);
  protected readonly created = signal<CreatedKey | null>(null);
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(100)]],
    sourceModule: ['', [Validators.required, Validators.pattern(/^[a-z][a-z0-9-]{1,29}\.[a-z][a-z0-9-]{1,39}$/)]],
  });

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.rows.set(await this.api.getP<ServiceKey[]>('/service-keys')); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.form.reset({ name: '', sourceModule: '' });
    this.formError.set(null); this.created.set(null); this.modalOpen.set(true);
  }
  protected close(): void { this.modalOpen.set(false); this.created.set(null); }

  protected async create(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set(null);
    try {
      const c = await firstValueFrom(this.api.post<CreatedKey>('/service-keys', this.form.getRawValue()));
      this.created.set(c);
      await this.load();
    } catch (e) { this.formError.set(e); }
    this.saving.set(false);
  }

  protected async copy(text: string): Promise<void> {
    try { await navigator.clipboard.writeText(text); this.notify.ok('Llave copiada.'); }
    catch { this.notify.error('No se pudo copiar: selecciona el texto y cópialo a mano.'); }
  }

  protected async revoke(k: ServiceKey): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Revocar conexión', message: `«${k.name}» dejará de funcionar en el acto. Lo que ya registró se queda.`, confirmText: 'Revocar', danger: true }))) return;
    try {
      await firstValueFrom(this.api.post(`/service-keys/${k.id}/revoke`));
      this.notify.ok('Conexión revocada.');
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
