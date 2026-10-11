import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Company as CompanyModel } from '../../core/models';
import { Notify } from '../../core/notify';
import { UI } from '../../shared/ui';

const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

@Component({
  selector: 'app-company',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Empresa</h1><p class="sub">Datos generales y fiscales de la empresa.</p></div></div>
      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      @if (!canEdit) { <div class="notice info" role="status">Solo un administrador puede editar estos datos.</div> }
      @if (loading()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
      @else {
        <form class="panel" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="panel-pad">
            <div class="form-grid">
              <div class="field span-2"><label for="c-name">Nombre comercial</label><input id="c-name" class="input" formControlName="name" />
                @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe el nombre de la empresa.</span> }</div>
              <div class="field span-2"><label for="c-legal">Razón social</label><input id="c-legal" class="input" formControlName="legalName" /></div>
              <div class="field"><label for="c-tax">RNC o cédula</label><input id="c-tax" class="input mono" formControlName="taxId" inputmode="numeric" />
                @if (form.controls.taxId.touched && form.controls.taxId.invalid) { <span class="error-text">RNC de 9 dígitos o cédula de 11.</span> }</div>
              <div class="field"><label for="c-cur">Moneda base</label><input id="c-cur" class="input mono" formControlName="baseCurrency" maxlength="3" />
                @if (form.controls.baseCurrency.touched && form.controls.baseCurrency.invalid) { <span class="error-text">Código de 3 letras, por ejemplo DOP.</span> }
                <span class="hint">No se puede cambiar si ya hay asientos.</span></div>
              <div class="field"><label for="c-fy">Mes de inicio del año fiscal</label>
                <select id="c-fy" class="select" formControlName="fiscalYearStartMonth">@for (m of months; track $index) { <option [value]="$index + 1">{{ m }}</option> }</select>
                <span class="hint">No se puede cambiar si ya hay años fiscales.</span></div>
              <div class="field"><label for="c-phone">Teléfono</label><input id="c-phone" class="input" formControlName="phone" /></div>
              <div class="field"><label for="c-mail">Correo</label><input id="c-mail" class="input" type="email" formControlName="email" />
                @if (form.controls.email.touched && form.controls.email.invalid) { <span class="error-text">Correo no válido.</span> }</div>
              <div class="field span-2"><label for="c-addr">Dirección</label><input id="c-addr" class="input" formControlName="address" /></div>
              <div class="field span-2"><label for="c-logo">URL del logo</label><input id="c-logo" class="input" formControlName="logoUrl" placeholder="https://…" />
                @if (form.controls.logoUrl.touched && form.controls.logoUrl.invalid) { <span class="error-text">Debe empezar con http:// o https://.</span> }</div>
            </div>
            @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
            @if (canEdit) {
              <div class="btn-row" style="margin-top:16px"><button type="submit" class="btn btn-primary" [disabled]="saving() || form.pristine">{{ saving() ? 'Guardando…' : 'Guardar cambios' }}</button></div>
            }
          </div>
        </form>
      }
    </div>
  `,
})
export class Company {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);

  protected readonly months = MONTHS;
  protected readonly canEdit = inject(Auth).has('ADMIN');
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal('');
  protected readonly formError = signal('');

  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]], legalName: [''],
    taxId: ['', [Validators.required, Validators.pattern(/^(\d{9}|\d{11})$/)]],
    baseCurrency: ['DOP', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]],
    fiscalYearStartMonth: [1, Validators.required],
    phone: [''], email: ['', Validators.email], address: [''], logoUrl: ['', Validators.pattern(/^https?:\/\/\S+$/)],
  });

  constructor() {
    if (!this.canEdit) this.form.disable();
    void this.load();
  }

  private fill(c: CompanyModel): void {
    this.form.reset({
      name: c.name, legalName: c.legalName ?? '', taxId: c.taxId, baseCurrency: c.baseCurrency, fiscalYearStartMonth: c.fiscalYearStartMonth,
      phone: c.phone ?? '', email: c.email ?? '', address: c.address ?? '', logoUrl: c.logoUrl ?? '',
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.fill(await this.api.getP<CompanyModel>('/company')); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving() || !this.canEdit) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const nullable = (s: string): string | null => (s.trim() === '' ? null : s.trim());
    try {
      const res = await firstValueFrom(this.api.patch<CompanyModel>('/company', {
        name: v.name.trim(), legalName: nullable(v.legalName), taxId: v.taxId.replace(/\D/g, ''), baseCurrency: v.baseCurrency,
        fiscalYearStartMonth: Number(v.fiscalYearStartMonth), phone: nullable(v.phone), email: nullable(v.email),
        address: nullable(v.address), logoUrl: nullable(v.logoUrl),
      }));
      this.fill(res);
      this.notify.ok('Datos de la empresa actualizados.');
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }
}
