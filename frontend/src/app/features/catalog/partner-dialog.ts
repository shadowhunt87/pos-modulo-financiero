import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Lookups } from '../../core/lookups';
import { Partner } from '../../core/models';
import { Notify } from '../../core/notify';
import { clean } from '../../shared/format';
import { opts, TAX_ID_TYPE } from '../../shared/labels';
import { ErrorNotice, FieldHelp, UI } from '../../shared/ui';

/**
 * Alta y edición de cliente / proveedor en un modal. Lo usan Clientes y proveedores, la factura y los cobros/pagos
 * (así se crea lo que falta sin salir de la pantalla). Al guardar emite `saved` con el registro que devolvió la API.
 */
@Component({
  selector: 'app-partner-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ErrorNotice, FieldHelp, ...UI],
  template: `
    <app-modal [open]="open()" [title]="partner() ? 'Editar cliente / proveedor' : 'Nuevo cliente / proveedor'" width="720px" (closed)="closed.emit()">
      <form id="partner-form" [formGroup]="form" (ngSubmit)="save()" (submit)="$event.stopPropagation()" novalidate>
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
          <div class="field"><label for="f-days">Días de crédito <app-field-help key="cliente.diasCredito" text="Cuántos días tiene este cliente o proveedor para pagar. La fecha de vencimiento de cada factura se calcula con estos días." /></label><input id="f-days" class="input num" type="number" min="0" max="365" formControlName="paymentTermsDays" /></div>
          <div class="field"><label for="f-ncf">NCF por defecto <app-field-help key="cliente.ncfPorDefecto" text="El tipo de comprobante fiscal que se usará en las facturas de este cliente si no eliges otro. Por ejemplo, B01 para quien pide crédito fiscal y B02 para consumidor final." /></label><input id="f-ncf" class="input mono" formControlName="defaultNcfType" placeholder="B01" maxlength="3" /></div>
          <label class="check span-all"><input type="checkbox" formControlName="isWithholdingAgent" /> Es agente de retención <app-field-help key="cliente.agenteRetencion" text="Márcalo si esta empresa (por ejemplo, una entidad del Estado o una empresa grande) te retiene parte del impuesto al pagarte. Al facturarle podrás agregar la retención." /></label>
        </div>
        @if (formError()) { <app-error-notice style="display:block;margin-top:14px" [error]="formError()" /> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
        <button type="submit" form="partner-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class PartnerDialog {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);

  /** Abierto o cerrado; lo controla quien lo usa. */
  readonly open = input(false);
  /** Registro a editar; sin valor, crea uno nuevo. */
  readonly partner = input<Partner | null>(null);
  /** Tipo preseleccionado al crear: CUSTOMER, SUPPLIER o BOTH. */
  readonly defaultType = input('CUSTOMER');
  readonly saved = output<Partner>();
  readonly closed = output<void>();

  protected readonly typeOptions = opts.partnerType;
  protected readonly idOptions = opts.taxIdType.filter((o) => o.value in TAX_ID_TYPE);
  protected readonly saving = signal(false);
  protected readonly formError = signal<unknown>('');
  protected readonly form = this.fb.nonNullable.group({
    type: ['CUSTOMER', Validators.required], name: ['', [Validators.required, Validators.maxLength(200)]], tradeName: [''],
    taxIdType: [''], taxId: [''], email: ['', Validators.email], phone: [''], address: [''], city: [''],
    creditLimit: [null as number | null], paymentTermsDays: [0], defaultNcfType: [''], isWithholdingAgent: [false],
  });

  constructor() {
    // Cada vez que se abre, el formulario se llena con el registro a editar o se deja limpio.
    effect(() => {
      if (!this.open()) return;
      const p = this.partner();
      const type = this.defaultType();
      untracked(() => this.fill(p, type));
    });
  }

  private fill(p: Partner | null, type: string): void {
    this.formError.set('');
    if (!p) {
      this.form.reset({ type, paymentTermsDays: 0, isWithholdingAgent: false });
      return;
    }
    this.form.reset({
      type: p.type, name: p.name, tradeName: p.tradeName ?? '', taxIdType: p.taxIdType ?? '', taxId: p.taxId ?? '', email: p.email ?? '',
      phone: p.phone ?? '', address: p.address ?? '', city: p.city ?? '', creditLimit: p.creditLimit === null ? null : Number(p.creditLimit),
      paymentTermsDays: p.paymentTermsDays, defaultNcfType: p.defaultNcfType ?? '', isWithholdingAgent: p.isWithholdingAgent,
    });
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const body = clean({ ...v, creditLimit: v.creditLimit === null ? '' : Number(v.creditLimit), paymentTermsDays: Number(v.paymentTermsDays ?? 0) });
    try {
      const cur = this.partner();
      const res = await firstValueFrom(cur ? this.api.patch<Partner>(`/partners/${cur.id}`, body) : this.api.post<Partner>('/partners', body));
      this.notify.ok(cur ? 'Cliente / proveedor actualizado.' : 'Cliente / proveedor creado.');
      // La lista compartida se refresca antes de avisar, para que el nuevo ya exista en los selectores.
      await this.lookups.ensurePartners(true);
      this.saved.emit(res);
    } catch (e) { this.formError.set(e); }
    this.saving.set(false);
  }
}
