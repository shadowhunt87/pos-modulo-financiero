import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Notify } from '../../core/notify';
import { clean, isoDate } from '../../shared/format';
import { ACCOUNTING_FRAMEWORK, DGII_CLASSIFICATION, LEGAL_FORM, TAX_REGIME } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { ErrorNotice } from '../../shared/ui/error-notice';
import { FieldHelp } from '../../shared/ui/field-help';
import type { FiscalProfile } from './fiscal-types';

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const entries = (m: Record<string, string>) => Object.entries(m).map(([value, label]) => ({ value, label }));

/** Datos fiscales de la empresa (PLAN-v0.3 §6): de esto depende qué declaraciones y comprobantes le tocan. */
@Component({
  selector: 'app-fiscal-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Datos fiscales</h1><p class="sub">Con esto el sistema sabe qué impuestos, comprobantes y plazos le tocan a tu empresa.</p></div></div>

      @if (loading()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
      @else {
        @if (p(); as x) {
          @if (!x.complete) { <div class="notice warn" role="status">Faltan datos: complétalos para recibir los avisos correctos (comprobantes, plazos de la DGII).</div> }
          @if (!x.closingMonthAllowed) {
            <div class="notice info" role="status">Tu año fiscal cierra en {{ month(x.closingMonth) }}. La DGII solo admite cierres en marzo, junio, septiembre o diciembre: revísalo con tu contadora en <a routerLink="/company">Empresa</a>.</div>
          }
        }
        <form class="panel panel-pad" [formGroup]="form" (ngSubmit)="save()" novalidate>
          <div class="form-grid">
            <div class="field span-2"><label for="fp-cls">Clasificación en la DGII <app-field-help text="Aparece en tu Oficina Virtual de la DGII (Grande, Mediano, Pequeño, Micro). Define hasta cuándo puedes usar comprobantes B y desde cuándo solo e-CF." /></label>
              <select id="fp-cls" class="select" formControlName="dgiiClassification"><option value="">Elige…</option>@for (o of CLS; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
            <div class="field span-2"><label for="fp-reg">Régimen de impuestos <app-field-help text="Casi todas las empresas están en el régimen Ordinario. El RST es un régimen simplificado para negocios pequeños que pagan una cuota." /></label>
              <select id="fp-reg" class="select" formControlName="taxRegime"><option value="">Elige…</option>@for (o of REG; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
            <div class="field span-2"><label for="fp-lf">Tipo de sociedad <app-field-help text="Está en tu registro mercantil (Ley 479-08): SRL, SA, SAS, EIRL… Si eres una persona con negocio propio, elige Persona física." /></label>
              <select id="fp-lf" class="select" formControlName="legalForm"><option value="">Elige…</option>@for (o of LF; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
            <div class="field"><label for="fp-fw">Marco contable <app-field-help text="La mayoría usa NIIF para las PYMES. Las que cotizan en bolsa o están reguladas por la SIMV usan NIIF completas. Si no sabes, pregúntale a tu contadora." /></label>
              <select id="fp-fw" class="select" formControlName="accountingFramework"><option value="">Elige…</option>@for (o of FW; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
            <div class="field"><label for="fp-ad">Desde cuándo lo usas (opcional)</label><app-date-input id="fp-ad" formControlName="frameworkAdoptionDate" /></div>
            <div class="field"><label for="fp-ecf">Emites e-CF desde (opcional) <app-field-help text="La fecha en que la DGII te autorizó como emisor de facturas electrónicas. Déjala vacía si todavía usas comprobantes B." /></label>
              <app-date-input id="fp-ecf" formControlName="ecfEmitterSince" /></div>
            <div class="field"><label class="check" for="fp-wa"><input id="fp-wa" type="checkbox" formControlName="isWithholdingAgent" /> Soy agente de retención <app-field-help text="Márcalo si la DGII te designó para retener impuestos a tus proveedores (por ejemplo, el 30 % del ITBIS de servicios)." /></label></div>
          </div>
          <app-error-notice [error]="error()" />
          @if (canEdit) {
            <div class="btn-row" style="margin-top:14px"><button type="submit" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar datos fiscales' }}</button></div>
          } @else {
            <p class="hint" style="margin-top:14px">Solo un administrador puede cambiar estos datos.</p>
          }
        </form>
      }
    </div>
  `,
})
export class FiscalProfileView {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly fb = inject(FormBuilder);
  protected readonly canEdit = inject(Auth).has('ADMIN');
  protected readonly CLS = entries(DGII_CLASSIFICATION);
  protected readonly REG = entries(TAX_REGIME);
  protected readonly LF = entries(LEGAL_FORM);
  protected readonly FW = entries(ACCOUNTING_FRAMEWORK);

  protected readonly p = signal<FiscalProfile | null>(null);
  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly form = this.fb.nonNullable.group({
    dgiiClassification: [''], taxRegime: [''], legalForm: [''], accountingFramework: [''],
    frameworkAdoptionDate: [''], ecfEmitterSince: [''], isWithholdingAgent: [false],
  });

  constructor() { void this.load(); }

  protected month(m: number): string { return MONTHS[m - 1] ?? String(m); }

  private fill(x: FiscalProfile): void {
    this.p.set(x);
    this.form.reset({
      dgiiClassification: x.dgiiClassification ?? '', taxRegime: x.taxRegime ?? '', legalForm: x.legalForm ?? '',
      accountingFramework: x.accountingFramework ?? '', frameworkAdoptionDate: x.frameworkAdoptionDate ? isoDate(x.frameworkAdoptionDate) : '',
      ecfEmitterSince: x.ecfEmitterSince ? isoDate(x.ecfEmitterSince) : '', isWithholdingAgent: x.isWithholdingAgent,
    });
    if (!this.canEdit) this.form.disable();
  }

  private async load(): Promise<void> {
    try { this.fill(await this.api.getP<FiscalProfile>('/fiscal/profile')); }
    catch (e) { this.error.set(e); }
    this.loading.set(false);
  }

  protected async save(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true); this.error.set(null);
    const v = this.form.getRawValue();
    // Vacío = null (borra el dato); clean quita los '' así que se arma a mano
    const body = {
      ...clean({ isWithholdingAgent: v.isWithholdingAgent }),
      dgiiClassification: v.dgiiClassification || null, taxRegime: v.taxRegime || null, legalForm: v.legalForm || null,
      accountingFramework: v.accountingFramework || null, frameworkAdoptionDate: v.frameworkAdoptionDate || null, ecfEmitterSince: v.ecfEmitterSince || null,
    };
    try {
      this.fill(await firstValueFrom(this.api.put<FiscalProfile>('/fiscal/profile', body)));
      this.notify.ok('Datos fiscales guardados.');
    } catch (e) { this.error.set(e); }
    this.saving.set(false);
  }
}
