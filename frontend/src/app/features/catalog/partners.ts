import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Partner } from '../../core/models';
import { Notify } from '../../core/notify';
import { clean } from '../../shared/format';
import { opts, PARTNER_TYPE, TAX_ID_TYPE } from '../../shared/labels';
import { UI } from '../../shared/ui';

/**
 * PANTALLA DE REFERENCIA: listado con filtros y paginación + alta/edición en un modal.
 * Las demás pantallas siguen este mismo esquema (señales, formularios reactivos, avisos, confirmaciones).
 */
@Component({
  selector: 'app-partners',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Clientes y proveedores</h1><p class="sub">Terceros con los que facturas, cobras y pagas.</p></div>
        @if (canEdit) { <button type="button" class="btn btn-primary" (click)="openNew()">Nuevo tercero</button> }
      </div>

      <div class="toolbar">
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
                @if (!loading()) { <tr><td colspan="7" class="table-empty">No hay terceros con esos filtros.</td></tr> }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>
    </div>

    <app-modal [open]="modalOpen()" [title]="editing() ? 'Editar tercero' : 'Nuevo tercero'" width="720px" (closed)="modalOpen.set(false)">
      <form id="partner-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field"><label for="f-type">Tipo</label>
            <select id="f-type" class="select" formControlName="type">@for (o of typeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
          <div class="field span-2"><label for="f-name">Nombre o razón social</label><input id="f-name" class="input" formControlName="name" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe el nombre.</span> }</div>
          <div class="field"><label for="f-trade">Nombre comercial</label><input id="f-trade" class="input" formControlName="tradeName" /></div>
          <div class="field"><label for="f-idt">Tipo de documento</label>
            <select id="f-idt" class="select" formControlName="taxIdType"><option value="">—</option>@for (o of idOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
          <div class="field"><label for="f-tax">RNC o cédula</label><input id="f-tax" class="input mono" formControlName="taxId" placeholder="Solo números" />
            <span class="hint">RNC de 9 dígitos o cédula de 11.</span></div>
          <div class="field"><label for="f-mail">Correo</label><input id="f-mail" class="input" type="email" formControlName="email" />
            @if (form.controls.email.touched && form.controls.email.invalid) { <span class="error-text">Correo no válido.</span> }</div>
          <div class="field"><label for="f-phone">Teléfono</label><input id="f-phone" class="input" formControlName="phone" /></div>
          <div class="field span-2"><label for="f-addr">Dirección</label><input id="f-addr" class="input" formControlName="address" /></div>
          <div class="field"><label for="f-city">Ciudad</label><input id="f-city" class="input" formControlName="city" /></div>
          <div class="field"><label for="f-credit">Límite de crédito</label><input id="f-credit" class="input num" type="number" min="0" step="0.01" formControlName="creditLimit" /></div>
          <div class="field"><label for="f-days">Días de crédito</label><input id="f-days" class="input num" type="number" min="0" max="365" formControlName="paymentTermsDays" /></div>
          <div class="field"><label for="f-ncf">NCF por defecto</label><input id="f-ncf" class="input mono" formControlName="defaultNcfType" placeholder="B01" maxlength="3" /></div>
          <label class="check span-all"><input type="checkbox" formControlName="isWithholdingAgent" /> Es agente de retención</label>
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="partner-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class Partners {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly PARTNER_TYPE = PARTNER_TYPE;
  protected readonly typeOptions = opts.partnerType;
  protected readonly idOptions = opts.taxIdType.filter((o) => o.value in TAX_ID_TYPE);
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');
  protected readonly limit = 25;

  protected readonly rows = signal<Partner[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private filters: Record<string, string> = {};
  protected readonly search$ = new Subject<string>();

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Partner | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    type: ['CUSTOMER', Validators.required], name: ['', [Validators.required, Validators.maxLength(200)]], tradeName: [''],
    taxIdType: [''], taxId: [''], email: ['', Validators.email], phone: [''], address: [''], city: [''],
    creditLimit: [null as number | null], paymentTermsDays: [0], defaultNcfType: [''], isWithholdingAgent: [false],
  });

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((q) => this.setFilter('q', q));
    void this.load();
  }

  protected setFilter(key: string, value: string): void { this.filters = { ...this.filters, [key]: value }; this.page.set(1); void this.load(); }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    this.error.set('');
    try {
      const res = await this.api.getP<Page<Partner>>('/partners', { ...this.filters, page: this.page(), limit: this.limit });
      this.rows.set(res.data);
      this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openNew(): void {
    this.editing.set(null); this.formError.set('');
    this.form.reset({ type: 'CUSTOMER', paymentTermsDays: 0, isWithholdingAgent: false });
    this.modalOpen.set(true);
  }
  protected openEdit(p: Partner): void {
    this.editing.set(p); this.formError.set('');
    this.form.reset({
      type: p.type, name: p.name, tradeName: p.tradeName ?? '', taxIdType: p.taxIdType ?? '', taxId: p.taxId ?? '', email: p.email ?? '',
      phone: p.phone ?? '', address: p.address ?? '', city: p.city ?? '', creditLimit: p.creditLimit === null ? null : Number(p.creditLimit),
      paymentTermsDays: p.paymentTermsDays, defaultNcfType: p.defaultNcfType ?? '', isWithholdingAgent: p.isWithholdingAgent,
    });
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const body = clean({ ...v, creditLimit: v.creditLimit === null ? '' : Number(v.creditLimit), paymentTermsDays: Number(v.paymentTermsDays ?? 0) });
    try {
      const cur = this.editing();
      await new Promise<void>((ok, bad) => (cur ? this.api.patch(`/partners/${cur.id}`, body) : this.api.post('/partners', body)).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok(cur ? 'Tercero actualizado.' : 'Tercero creado.');
      this.modalOpen.set(false);
      void this.lookups.ensurePartners(true);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async toggle(p: Partner): Promise<void> {
    const to = !p.active;
    if (!(await this.confirm.ask({ title: to ? 'Activar tercero' : 'Desactivar tercero', message: to ? `${p.name} volverá a aparecer en los selectores.` : `${p.name} dejará de aparecer en los selectores. Sus documentos no cambian.`, confirmText: to ? 'Activar' : 'Desactivar', danger: !to }))) return;
    try {
      await new Promise<void>((ok, bad) => this.api.patch(`/partners/${p.id}`, { active: to }).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok(to ? 'Tercero activado.' : 'Tercero desactivado.');
      void this.lookups.ensurePartners(true);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
