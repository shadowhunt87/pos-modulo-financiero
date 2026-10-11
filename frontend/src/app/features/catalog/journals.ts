import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Journal } from '../../core/models';
import { Notify } from '../../core/notify';
import { JOURNAL_TYPE, opts } from '../../shared/labels';
import { UI } from '../../shared/ui';

@Component({
  selector: 'app-journals',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Diarios</h1><p class="sub">Libros donde se agrupan los asientos (ventas, compras, bancos…).</p></div>
        @if (canEdit) {
          <div class="btn-row">
            <button type="button" class="btn" (click)="createDefaults()" [disabled]="busy()">Crear diarios estándar</button>
            <button type="button" class="btn btn-primary" (click)="openNew()">Nuevo diario</button>
          </div>
        }
      </div>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th class="num">Próximo número</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="6"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (j of rows(); track j.id) {
                <tr>
                  <td class="mono"><strong>{{ j.code }}</strong></td>
                  <td>{{ j.name }}</td>
                  <td>{{ j.type | lbl: JOURNAL_TYPE }}</td>
                  <td class="num mono">{{ j.code }}-{{ pad(j.nextNumber) }}</td>
                  <td><span class="badge" [class.pos]="j.active">{{ j.active ? 'Activo' : 'Inactivo' }}</span></td>
                  <td class="actions">
                    @if (canEdit) {
                      <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(j)">Editar</button>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(j)">{{ j.active ? 'Desactivar' : 'Activar' }}</button>
                    }
                  </td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="6" class="table-empty">No hay diarios. Usa «Crear diarios estándar» para empezar.</td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="modalOpen()" [title]="editing() ? 'Editar diario' : 'Nuevo diario'" width="520px" (closed)="modalOpen.set(false)">
      <form id="journal-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field"><label for="f-code">Código</label><input id="f-code" class="input mono" formControlName="code" maxlength="6" />
            @if (form.controls.code.touched && form.controls.code.invalid) { <span class="error-text">De 1 a 6 caracteres: letras mayúsculas o números.</span> }
            @if (editing()) { <span class="hint">El código no se puede cambiar.</span> }</div>
          <div class="field"><label for="f-type">Tipo</label>
            <select id="f-type" class="select" formControlName="type">@for (o of typeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select>
            @if (editing()) { <span class="hint">El tipo no se puede cambiar.</span> }</div>
          <div class="field span-2"><label for="f-name">Nombre</label><input id="f-name" class="input" formControlName="name" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe el nombre.</span> }</div>
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="journal-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class Journals {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);

  protected readonly JOURNAL_TYPE = JOURNAL_TYPE;
  protected readonly typeOptions = opts.journalType;
  protected readonly canEdit = inject(Auth).has('ADMIN');

  protected readonly rows = signal<Journal[]>([]);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Journal | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Z0-9]{1,6}$/)]],
    name: ['', [Validators.required, Validators.maxLength(100)]],
    type: ['GENERAL', Validators.required],
  });

  constructor() { void this.load(); }

  protected pad(n: number): string { return String(n).padStart(6, '0'); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.rows.set(await this.api.getP<Journal[]>('/journals')); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.editing.set(null); this.formError.set('');
    this.form.reset({ code: '', name: '', type: 'GENERAL' });
    this.form.controls.code.enable(); this.form.controls.type.enable();
    this.modalOpen.set(true);
  }
  protected openEdit(j: Journal): void {
    this.editing.set(j); this.formError.set('');
    this.form.reset({ code: j.code, name: j.name, type: j.type });
    this.form.controls.code.disable(); this.form.controls.type.disable();
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    try {
      const cur = this.editing();
      if (cur) await firstValueFrom(this.api.patch(`/journals/${cur.id}`, { name: v.name.trim() }));
      else await firstValueFrom(this.api.post('/journals', { code: v.code.trim(), name: v.name.trim(), type: v.type }));
      this.notify.ok(cur ? 'Diario actualizado.' : 'Diario creado.');
      this.modalOpen.set(false);
      void this.lookups.ensureJournals(true);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async toggle(j: Journal): Promise<void> {
    const to = !j.active;
    if (!(await this.confirm.ask({
      title: to ? 'Activar diario' : 'Desactivar diario',
      message: to ? `${j.name} volverá a estar disponible.` : `${j.name} dejará de estar disponible para asientos nuevos. Los asientos existentes no cambian.`,
      confirmText: to ? 'Activar' : 'Desactivar', danger: !to,
    }))) return;
    try {
      await firstValueFrom(this.api.patch(`/journals/${j.id}`, { active: to }));
      this.notify.ok(to ? 'Diario activado.' : 'Diario desactivado.');
      void this.lookups.ensureJournals(true);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

  protected async createDefaults(): Promise<void> {
    this.busy.set(true);
    try {
      const res = await firstValueFrom(this.api.post<{ created: number }>('/journals/defaults'));
      this.notify.ok(res.created ? `Se crearon ${res.created} diarios estándar.` : 'Ya tenías todos los diarios estándar.');
      void this.lookups.ensureJournals(true);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }
}
