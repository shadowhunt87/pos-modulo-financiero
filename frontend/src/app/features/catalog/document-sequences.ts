import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { DOC_TYPE } from '../../shared/labels';
import { UI } from '../../shared/ui';

interface DocSeq { docType: string; prefix: string; padding: number; nextNumber: number; persisted: boolean }

@Component({
  selector: 'app-document-sequences',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Numeración de documentos</h1><p class="sub">Prefijo y correlativo de facturas, notas, cobros y pagos.</p></div>
      </div>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Documento</th><th>Prefijo</th><th class="num">Dígitos</th><th class="num">Próximo número</th><th>Se verá así</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="6"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (s of rows(); track s.docType) {
                <tr>
                  <td><strong>{{ s.docType | lbl: DOC_TYPE }}</strong></td>
                  <td class="mono">{{ s.prefix }}</td>
                  <td class="num">{{ s.padding }}</td>
                  <td class="num">{{ s.nextNumber }}</td>
                  <td class="mono">{{ sample(s) }}</td>
                  <td class="actions">@if (canEdit) { <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(s)">Editar</button> }</td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="6"><app-empty-state title="No hay numeraciones." /></td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="modalOpen()" [title]="'Editar numeración: ' + (editing()?.docType | lbl: DOC_TYPE)" width="520px" (closed)="modalOpen.set(false)">
      <form id="seq-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field"><label for="f-prefix">Prefijo</label><input id="f-prefix" class="input mono" formControlName="prefix" maxlength="10" />
            @if (form.controls.prefix.invalid) { <span class="error-text">Solo mayúsculas, números y guion (máx. 10).</span> }</div>
          <div class="field"><label for="f-pad">Dígitos</label><input id="f-pad" class="input num" type="number" min="1" max="12" formControlName="padding" />
            @if (form.controls.padding.invalid) { <span class="error-text">Entre 1 y 12.</span> }</div>
          <div class="field span-2"><label for="f-next">Próximo número</label><input id="f-next" class="input num" type="number" min="1" formControlName="nextNumber" />
            <span class="hint">Solo puede subir: no se reutilizan números ya emitidos.</span></div>
          <div class="field span-2"><span class="dim">Vista previa</span>{{ ' ' }}<strong class="mono">{{ preview() }}</strong></div>
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="seq-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class DocumentSequences {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);

  protected readonly DOC_TYPE = DOC_TYPE;
  protected readonly canEdit = inject(Auth).has('ADMIN');

  protected readonly rows = signal<DocSeq[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<DocSeq | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly previewText = signal('');
  protected readonly form = this.fb.nonNullable.group({
    prefix: ['', Validators.pattern(/^[A-Z0-9-]{0,10}$/)],
    padding: [6 as number | null, [Validators.required, Validators.min(1), Validators.max(12)]],
    nextNumber: [1 as number | null, [Validators.required, Validators.min(1)]],
  });

  constructor() {
    void this.load();
    this.form.valueChanges.subscribe(() => this.previewText.set(this.buildPreview()));
  }

  protected preview(): string { return this.previewText(); }
  private buildPreview(): string {
    const v = this.form.getRawValue();
    return v.prefix + String(v.nextNumber ?? 1).padStart(Number(v.padding ?? 6), '0');
  }
  protected sample(s: DocSeq): string { return s.prefix + String(s.nextNumber).padStart(s.padding, '0'); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.rows.set(await this.api.getP<DocSeq[]>('/document-sequences')); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openEdit(s: DocSeq): void {
    this.editing.set(s); this.formError.set('');
    this.form.reset({ prefix: s.prefix, padding: s.padding, nextNumber: s.nextNumber });
    this.form.controls.nextNumber.setValidators([Validators.required, Validators.min(s.nextNumber)]);
    this.form.controls.nextNumber.updateValueAndValidity();
    this.previewText.set(this.buildPreview());
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    const cur = this.editing();
    if (!cur || this.saving()) return;
    if (this.form.invalid) { this.formError.set(`Revisa los campos. El próximo número no puede ser menor que ${cur.nextNumber}.`); return; }
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    try {
      await firstValueFrom(this.api.patch(`/document-sequences/${cur.docType}`, { prefix: v.prefix, padding: Number(v.padding), nextNumber: Number(v.nextNumber) }));
      this.notify.ok('Numeración actualizada.');
      this.modalOpen.set(false);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }
}
