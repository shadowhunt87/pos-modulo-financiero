import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Notify } from '../../core/notify';
import { isoDate, today } from '../../shared/format';
import { ErrorNotice, FieldHelp, UI } from '../../shared/ui';
import { Department, Employee } from './types';

/** Alta y edición de un empleado (P3). POST /hr/employees y PATCH /hr/employees/:id. */
@Component({
  selector: 'app-employee-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ErrorNotice, FieldHelp, ...UI],
  template: `
    <app-modal [open]="open()" [title]="employee() ? 'Editar empleado' : 'Nuevo empleado'" width="780px" (closed)="closed.emit()">
      <form id="employee-form" [formGroup]="form" (ngSubmit)="save()" (submit)="$event.stopPropagation()" novalidate>
        <h3 class="form-section">Datos personales</h3>
        <div class="form-grid">
          <div class="field"><label for="e-code">Código</label><input id="e-code" class="input mono" formControlName="code" placeholder="E001" />
            @if (form.controls.code.touched && form.controls.code.invalid) { <span class="error-text">Hasta 20 letras o números, sin espacios.</span> }</div>
          <div class="field"><label for="e-fn">Nombres</label><input id="e-fn" class="input" formControlName="firstName" />
            @if (form.controls.firstName.touched && form.controls.firstName.invalid) { <span class="error-text">Escribe los nombres.</span> }</div>
          <div class="field"><label for="e-ln">Apellidos</label><input id="e-ln" class="input" formControlName="lastName" />
            @if (form.controls.lastName.touched && form.controls.lastName.invalid) { <span class="error-text">Escribe los apellidos.</span> }</div>
          <div class="field"><label for="e-dt">Documento</label>
            <select id="e-dt" class="select" formControlName="documentType"><option value="CEDULA">Cédula</option><option value="PASSPORT">Pasaporte</option></select></div>
          <div class="field"><label for="e-dn">Número</label><input id="e-dn" class="input mono" formControlName="documentNumber" placeholder="001-1234567-8" />
            @if (form.controls.documentNumber.touched && form.controls.documentNumber.invalid) { <span class="error-text">Escribe el número de documento.</span> }</div>
          <div class="field"><label for="e-nss">NSS <app-field-help key="empleado.nss" text="Número de Seguridad Social del empleado en la TSS. Lo necesitas para la autodeterminación mensual." /></label><input id="e-nss" class="input mono" formControlName="nss" /></div>
          <div class="field"><label for="e-sex">Sexo</label>
            <select id="e-sex" class="select" formControlName="sex"><option value="">—</option><option value="F">Femenino</option><option value="M">Masculino</option></select></div>
          <div class="field"><label for="e-bd">Fecha de nacimiento</label><app-date-input id="e-bd" formControlName="birthDate" /></div>
          <div class="field"><label for="e-mail">Correo</label><input id="e-mail" class="input" type="email" formControlName="email" /></div>
          <div class="field"><label for="e-ph">Teléfono</label><input id="e-ph" class="input" formControlName="phone" /></div>
          <div class="field span-2"><label for="e-addr">Dirección</label><input id="e-addr" class="input" formControlName="address" /></div>
        </div>

        <h3 class="form-section">Trabajo y salario</h3>
        <div class="form-grid">
          <div class="field"><label for="e-hire">Fecha de ingreso</label><app-date-input id="e-hire" formControlName="hireDate" /></div>
          <div class="field"><label for="e-dep">Departamento</label>
            <select id="e-dep" class="select" formControlName="departmentId"><option value="">—</option>
              @for (d of departments(); track d.id) { @if (d.active || d.id === form.controls.departmentId.value) { <option [value]="d.id">{{ d.name }}</option> } }</select></div>
          <div class="field"><label for="e-pos">Cargo</label><input id="e-pos" class="input" formControlName="position" /></div>
          <div class="field"><label for="e-sal">Salario mensual</label><input id="e-sal" class="input num" type="number" min="0.01" step="0.01" formControlName="baseSalary" />
            @if (form.controls.baseSalary.touched && form.controls.baseSalary.invalid) { <span class="error-text">Escribe el salario mensual.</span> }</div>
          <div class="field"><label for="e-freq">Frecuencia de pago <app-field-help key="empleado.frecuencia" text="Cada cuánto cobra. El salario siempre se escribe mensual: la nómina quincenal paga la mitad y la semanal, 12/52 del mensual." /></label>
            <select id="e-freq" class="select" formControlName="payFrequency"><option value="MONTHLY">Mensual</option><option value="BIWEEKLY">Quincenal</option><option value="WEEKLY">Semanal</option></select></div>
          <div class="field"><label for="e-pm">Forma de pago</label>
            <select id="e-pm" class="select" formControlName="paymentMethod"><option value="TRANSFER">Transferencia</option><option value="CHECK">Cheque</option><option value="CASH">Efectivo</option></select></div>
          <div class="field"><label for="e-bank">Banco</label><input id="e-bank" class="input" formControlName="bankName" /></div>
          <div class="field"><label for="e-acct">Número de cuenta</label><input id="e-acct" class="input mono" formControlName="bankAccountNumber" /></div>
        </div>
        @if (formError()) { <app-error-notice style="display:block;margin-top:14px" [error]="formError()" /> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
        <button type="submit" form="employee-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
  styles: `.form-section { font-size: 14px; margin: 4px 0 10px; color: var(--text-dim); } .form-grid + .form-section { margin-top: 18px; }`,
})
export class EmployeeDialog {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);

  readonly open = input(false);
  readonly employee = input<Employee | null>(null);
  readonly departments = input<Department[]>([]);
  readonly saved = output<Employee>();
  readonly closed = output<void>();

  protected readonly saving = signal(false);
  protected readonly formError = signal<unknown>('');
  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[A-Za-z0-9._-]{1,20}$/)]],
    firstName: ['', [Validators.required, Validators.maxLength(100)]], lastName: ['', [Validators.required, Validators.maxLength(100)]],
    documentType: ['CEDULA'], documentNumber: ['', [Validators.required, Validators.maxLength(20)]], nss: [''], sex: [''], birthDate: [''],
    email: ['', Validators.email], phone: [''], address: [''],
    hireDate: [today(), Validators.required], departmentId: [''], position: [''],
    baseSalary: [null as number | null, [Validators.required, Validators.min(0.01)]], payFrequency: ['MONTHLY'], paymentMethod: ['TRANSFER'],
    bankName: [''], bankAccountNumber: [''],
  });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const e = this.employee();
      untracked(() => this.fill(e));
    });
  }

  private fill(e: Employee | null): void {
    this.formError.set('');
    if (!e) { this.form.reset({ documentType: 'CEDULA', hireDate: today(), payFrequency: 'MONTHLY', paymentMethod: 'TRANSFER' }); return; }
    this.form.reset({
      code: e.code, firstName: e.firstName, lastName: e.lastName, documentType: e.documentType, documentNumber: e.documentNumber, nss: e.nss ?? '',
      sex: e.sex ?? '', birthDate: isoDate(e.birthDate), email: e.email ?? '', phone: e.phone ?? '', address: e.address ?? '',
      hireDate: isoDate(e.hireDate), departmentId: e.departmentId ?? '', position: e.position ?? '', baseSalary: Number(e.baseSalary),
      payFrequency: e.payFrequency, paymentMethod: e.paymentMethod, bankName: e.bankName ?? '', bankAccountNumber: e.bankAccountNumber ?? '',
    });
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const cur = this.employee();
    // Vacíos: al crear se omiten; al editar, null quita el valor guardado
    const opt = (x: string) => (x.trim() ? x.trim() : cur ? null : undefined);
    const body: Record<string, unknown> = {
      code: v.code.trim(), firstName: v.firstName.trim(), lastName: v.lastName.trim(), documentType: v.documentType, documentNumber: v.documentNumber.trim(),
      nss: opt(v.nss), sex: opt(v.sex), birthDate: opt(v.birthDate), email: opt(v.email), phone: opt(v.phone), address: opt(v.address),
      hireDate: v.hireDate, departmentId: opt(v.departmentId), position: opt(v.position), baseSalary: Number(v.baseSalary),
      payFrequency: v.payFrequency, paymentMethod: v.paymentMethod, bankName: opt(v.bankName), bankAccountNumber: opt(v.bankAccountNumber),
    };
    for (const k of Object.keys(body)) if (body[k] === undefined) delete body[k];
    try {
      const res = await firstValueFrom(cur ? this.api.patch<Employee>(`/hr/employees/${cur.id}`, body) : this.api.post<Employee>('/hr/employees', body));
      this.notify.ok(cur ? 'Empleado actualizado.' : 'Empleado registrado.');
      this.saved.emit(res);
    } catch (e) { this.formError.set(e); }
    this.saving.set(false);
  }
}
