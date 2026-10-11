import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { clean, isoDate } from '../../shared/format';
import { NCF_TYPE, Option } from '../../shared/labels';
import { UI } from '../../shared/ui';

interface NcfSeq {
  id: string; ncfType: string; rangeStart: number; rangeEnd: number; currentNumber: number; expirationDate: string | null;
  warningThreshold: number; active: boolean; remaining: number; nextNcf: string | null; expired: boolean; exhausted: boolean; lowStock: boolean;
}
interface NcfCatalog { code: string; name: string }

@Component({
  selector: 'app-ncf',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Comprobantes fiscales (NCF)</h1><p class="sub">Rangos autorizados por la DGII para cada tipo de comprobante.</p></div>
        @if (canEdit) { <button type="button" class="btn btn-primary" (click)="openNew()">Nueva secuencia</button> }
      </div>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      @for (a of alerts(); track a.id) {
        <div class="notice warn" role="status"><strong>{{ a.ncfType }}</strong> · {{ alertText(a) }}</div>
      }
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Tipo</th><th>Rango autorizado</th><th>Último usado</th><th>Siguiente NCF</th><th class="num">Disponibles</th><th>Vence</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="8"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (s of rows(); track s.id) {
                <tr>
                  <td><strong class="mono">{{ s.ncfType }}</strong><div class="dim">{{ s.ncfType | lbl: NCF_TYPE }}</div></td>
                  <td class="mono">{{ s.rangeStart }} – {{ s.rangeEnd }}</td>
                  <td class="mono">{{ s.currentNumber }}</td>
                  <td class="mono">{{ s.nextNcf ?? '—' }}</td>
                  <td class="num">{{ s.remaining }}</td>
                  <td>{{ s.expirationDate | fdate }}</td>
                  <td>
                    @if (!s.active) { <span class="badge">Inactiva</span> }
                    @else if (s.exhausted) { <span class="badge neg">Agotada</span> }
                    @else if (s.expired) { <span class="badge neg">Vencida</span> }
                    @else if (s.lowStock) { <span class="badge warn">Por agotarse</span> }
                    @else { <span class="badge pos">Vigente</span> }
                  </td>
                  <td class="actions">
                    @if (canEdit) {
                      <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(s)">Editar</button>
                      @if (s.exhausted || s.expired) { <button type="button" class="btn btn-ghost btn-sm" (click)="openRenew(s)">Renovar</button> }
                    }
                  </td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="8" class="table-empty">Aún no hay secuencias. Crea una con el rango que te autorizó la DGII.</td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="modalOpen()" [title]="title()" width="620px" (closed)="modalOpen.set(false)">
      <form id="ncf-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          @if (mode() === 'new') {
            <div class="field span-2"><label for="f-type">Tipo de comprobante</label>
              <select id="f-type" class="select" formControlName="ncfType">
                <option value="">Selecciona un tipo</option>@for (o of typeChoices(); track o.value) { <option [value]="o.value">{{ o.value }} · {{ o.label }}</option> }
              </select>
              @if (form.controls.ncfType.touched && form.controls.ncfType.invalid) { <span class="error-text">Elige el tipo de comprobante.</span> }</div>
          }
          @if (mode() === 'new' || mode() === 'renew') {
            <div class="field"><label for="f-from">Desde el número</label><input id="f-from" class="input num" type="number" min="1" formControlName="rangeStart" /></div>
          }
          <div class="field"><label for="f-to">Hasta el número</label><input id="f-to" class="input num" type="number" min="1" formControlName="rangeEnd" />
            @if (mode() === 'edit') { <span class="hint">Solo se puede ampliar el rango, no reducirlo.</span> }</div>
          @if (mode() === 'new') {
            <div class="field"><label for="f-last">Último número ya usado</label><input id="f-last" class="input num" type="number" min="0" formControlName="lastUsedNumber" />
              <span class="hint">Déjalo vacío si el rango está sin estrenar.</span></div>
          }
          <div class="field"><label for="f-exp">Fecha de vencimiento</label><input id="f-exp" class="input" type="date" formControlName="expirationDate" /></div>
          @if (mode() !== 'renew') {
            <div class="field"><label for="f-warn">Avisar cuando queden</label><input id="f-warn" class="input num" type="number" min="0" formControlName="warningThreshold" />
              <span class="hint">Comprobantes disponibles.</span></div>
          }
          @if (mode() === 'edit') { <label class="check span-all"><input type="checkbox" formControlName="active" /> Secuencia activa</label> }
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="ncf-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class Ncf {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);

  protected readonly NCF_TYPE = NCF_TYPE;
  protected readonly canEdit = inject(Auth).has('ADMIN');

  protected readonly rows = signal<NcfSeq[]>([]);
  protected readonly catalog = signal<NcfCatalog[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly alerts = computed(() => this.rows().filter((s) => s.active && (s.exhausted || s.expired || s.lowStock)));
  protected readonly typeChoices = computed<Option[]>(() => {
    const used = new Set(this.rows().map((r) => r.ncfType));
    const base = this.catalog().length ? this.catalog().map((c) => ({ value: c.code, label: c.name })) : Object.entries(NCF_TYPE).map(([value, label]) => ({ value, label }));
    return base.filter((o) => !used.has(o.value));
  });

  protected readonly modalOpen = signal(false);
  protected readonly mode = signal<'new' | 'edit' | 'renew'>('new');
  protected readonly editing = signal<NcfSeq | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly title = computed(() => {
    const m = this.mode(), s = this.editing();
    return m === 'new' ? 'Nueva secuencia de NCF' : m === 'edit' ? `Editar secuencia ${s?.ncfType ?? ''}` : `Renovar secuencia ${s?.ncfType ?? ''}`;
  });
  protected readonly form = this.fb.nonNullable.group({
    ncfType: ['', [Validators.required, Validators.pattern(/^[BE]\d{2}$/)]],
    rangeStart: [1 as number | null, [Validators.required, Validators.min(1)]],
    rangeEnd: [null as number | null, [Validators.required, Validators.min(1)]],
    lastUsedNumber: [null as number | null], expirationDate: [''], warningThreshold: [20 as number | null], active: [true],
  });

  constructor() {
    void this.load();
    this.api.get<NcfCatalog[]>('/ncf/types').subscribe({ next: (c) => this.catalog.set(c), error: () => undefined });
  }

  protected alertText(s: NcfSeq): string {
    if (s.exhausted) return 'Se agotó el rango. Pide uno nuevo a la DGII y renueva la secuencia para seguir facturando.';
    if (s.expired) return 'El rango venció. Renueva la secuencia con el nuevo rango autorizado.';
    return `Quedan ${s.remaining} comprobantes. Solicita un nuevo rango antes de que se agoten.`;
  }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.rows.set(await this.api.getP<NcfSeq[]>('/ncf/sequences')); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  private setRangeValidators(mode: 'new' | 'edit' | 'renew'): void {
    const c = this.form.controls;
    const need = mode !== 'edit';
    c.ncfType.setValidators(mode === 'new' ? [Validators.required, Validators.pattern(/^[BE]\d{2}$/)] : []);
    c.rangeStart.setValidators(need ? [Validators.required, Validators.min(1)] : []);
    c.ncfType.updateValueAndValidity(); c.rangeStart.updateValueAndValidity();
  }

  protected openNew(): void {
    this.mode.set('new'); this.editing.set(null); this.formError.set('');
    this.setRangeValidators('new');
    this.form.reset({ ncfType: '', rangeStart: 1, rangeEnd: null, lastUsedNumber: null, expirationDate: '', warningThreshold: 20, active: true });
    this.modalOpen.set(true);
  }
  protected openEdit(s: NcfSeq): void {
    this.mode.set('edit'); this.editing.set(s); this.formError.set('');
    this.setRangeValidators('edit');
    this.form.reset({ ncfType: s.ncfType, rangeStart: s.rangeStart, rangeEnd: s.rangeEnd, lastUsedNumber: null, expirationDate: isoDate(s.expirationDate), warningThreshold: s.warningThreshold, active: s.active });
    this.modalOpen.set(true);
  }
  protected openRenew(s: NcfSeq): void {
    this.mode.set('renew'); this.editing.set(s); this.formError.set('');
    this.setRangeValidators('renew');
    this.form.reset({ ncfType: s.ncfType, rangeStart: s.rangeEnd + 1, rangeEnd: null, lastUsedNumber: null, expirationDate: '', warningThreshold: s.warningThreshold, active: true });
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    const v = this.form.getRawValue();
    const mode = this.mode(), cur = this.editing();
    if (mode !== 'edit' && Number(v.rangeEnd) < Number(v.rangeStart)) { this.formError.set('El número final no puede ser menor que el inicial.'); return; }
    this.saving.set(true); this.formError.set('');
    try {
      if (mode === 'new') {
        await firstValueFrom(this.api.post('/ncf/sequences', clean({
          ncfType: v.ncfType, rangeStart: Number(v.rangeStart), rangeEnd: Number(v.rangeEnd),
          lastUsedNumber: v.lastUsedNumber === null ? '' : Number(v.lastUsedNumber), expirationDate: v.expirationDate,
          warningThreshold: v.warningThreshold === null ? '' : Number(v.warningThreshold),
        })));
        this.notify.ok('Secuencia creada.');
      } else if (mode === 'renew' && cur) {
        await firstValueFrom(this.api.post(`/ncf/sequences/${cur.id}/renew`, clean({ rangeStart: Number(v.rangeStart), rangeEnd: Number(v.rangeEnd), expirationDate: v.expirationDate })));
        this.notify.ok('Secuencia renovada.');
      } else if (cur) {
        await firstValueFrom(this.api.patch(`/ncf/sequences/${cur.id}`, clean({
          rangeEnd: Number(v.rangeEnd), expirationDate: v.expirationDate,
          warningThreshold: v.warningThreshold === null ? '' : Number(v.warningThreshold), active: v.active,
        })));
        this.notify.ok('Secuencia actualizada.');
      }
      this.modalOpen.set(false);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }
}
