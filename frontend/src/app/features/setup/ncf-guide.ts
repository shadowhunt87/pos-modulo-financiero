import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Notify } from '../../core/notify';
import { SetupState } from '../../core/setup-status';
import { UI } from '../../shared/ui';
import { ErrorNotice } from '../../shared/ui/error-notice';
import { FieldHelp } from '../../shared/ui/field-help';

const fmt = (type: string, n: number) => `${type}${String(n).padStart(type.startsWith('E') ? 10 : 8, '0')}`;

/** Guía del NCF (E2): qué es, cuál necesitas, dónde se pide y el formulario en el orden de la autorización de la DGII. */
@Component({
  selector: 'app-ncf-guide',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Tus comprobantes fiscales (NCF)</h1><p class="sub">El NCF es el número que la DGII exige en cada factura con valor fiscal.</p></div></div>
      <div class="cols-2">
        <section class="panel panel-pad">
          <h2>1. ¿Cuál necesitas?</h2>
          <p><strong>¿Le vendes a empresas</strong> que te piden crédito fiscal? → <strong>B01</strong> (crédito fiscal).</p>
          <p><strong>¿Le vendes a personas</strong> o consumidores finales? → <strong>B02</strong> (consumo).</p>
          <p class="hint">Casi todos los negocios necesitan los dos. Las notas de crédito usan B04. Si ya emites facturas electrónicas, tus tipos empiezan con E (E31, E32…).</p>
          <h2>2. ¿Dónde se piden?</h2>
          <ol>
            <li>Entra a la Oficina Virtual de la DGII con tu usuario.</li>
            <li>Menú «Solicitud de comprobantes fiscales» y pide el tipo y la cantidad.</li>
            <li>La DGII te da un rango «desde – hasta» y una fecha de vencimiento.</li>
          </ol>
          <p class="hint">[CAPTURA: Oficina Virtual de la DGII, solicitud de NCF]</p>
        </section>
        <section class="panel panel-pad">
          <h2>3. Cárgalos aquí (como dice tu autorización)</h2>
          @if (!auth.has('ADMIN')) { <div class="notice info" role="status">Solo un administrador puede cargar comprobantes.</div> }
          <div class="field"><label for="g-type">Tipo de comprobante</label>
            <select id="g-type" class="select" [value]="type()" (change)="type.set($any($event.target).value)">
              @for (t of TYPES; track t[0]) { <option [value]="t[0]">{{ t[0] }} · {{ t[1] }}</option> }
            </select></div>
          <div class="field"><label for="g-from">Desde (número) <app-field-help text="Solo el número final de la autorización, sin la letra ni el tipo. Ej.: si dice B0100000051, escribe 51." /></label>
            <input id="g-from" class="input" type="number" min="1" [value]="from()" (input)="from.set(+$any($event.target).value)" /></div>
          <div class="field"><label for="g-to">Hasta (número)</label><input id="g-to" class="input" type="number" min="1" [value]="to()" (input)="to.set(+$any($event.target).value)" /></div>
          <div class="field"><label for="g-exp">Vence el (opcional)</label><app-date-input id="g-exp" [value]="exp()" (dateChange)="exp.set($event)" /></div>
          @if (problem()) { <span class="error-text">{{ problem() }}</span> }
          @else { <p class="notice info" role="status">Tus facturas saldrán con <span class="mono">{{ preview() }}</span>… ({{ count() }} comprobantes).</p> }
          <app-error-notice [error]="error()" />
          <div class="btn-row">
            <button type="button" class="btn btn-primary" [disabled]="busy() || !!problem() || !auth.has('ADMIN')" (click)="save()">{{ busy() ? 'Guardando…' : 'Guardar comprobantes' }}</button>
            <a class="btn" routerLink="/setup">Volver a la configuración inicial</a>
          </div>
        </section>
      </div>
    </div>
  `,
  styles: `h2 { font-size: 1rem; margin: 10px 0 6px; } ol { padding-left: 18px; line-height: 1.6; } .field { margin-bottom: 10px; }`,
})
export class NcfGuide {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  private readonly setup = inject(SetupState);
  protected readonly auth = inject(Auth);
  protected readonly TYPES: [string, string][] = [
    ['B01', 'Crédito fiscal'], ['B02', 'Consumo'], ['B04', 'Nota de crédito'], ['B14', 'Regímenes especiales'], ['B15', 'Gubernamental'],
    ['B11', 'Compras (a no registrados)'], ['B13', 'Gastos menores'], ['E31', 'e-CF crédito fiscal'], ['E32', 'e-CF consumo'],
  ];
  protected readonly type = signal('B01');
  protected readonly from = signal(1);
  protected readonly to = signal(100);
  protected readonly exp = signal('');
  protected readonly busy = signal(false);
  protected readonly error = signal<unknown>(null);
  protected readonly count = computed(() => this.to() - this.from() + 1);
  protected readonly problem = computed(() => {
    if (!(this.from() >= 1) || !(this.to() >= 1)) return 'Escribe los dos números del rango.';
    if (this.to() < this.from()) return '«Hasta» debe ser mayor o igual que «Desde».';
    if (this.exp() && this.exp() < new Date().toISOString().slice(0, 10)) return 'La fecha de vencimiento ya pasó.';
    return '';
  });
  protected readonly preview = computed(() => [0, 1].map((i) => fmt(this.type(), this.from() + i)).join(', '));

  protected async save(): Promise<void> {
    this.busy.set(true); this.error.set(null);
    try {
      await firstValueFrom(this.api.post('/ncf/sequences', { ncfType: this.type(), rangeStart: this.from(), rangeEnd: this.to(), ...(this.exp() ? { expirationDate: this.exp() } : {}) }));
      this.notify.ok(`Comprobantes ${this.type()} guardados.`);
      await this.setup.load();
      await this.router.navigateByUrl('/setup');
    } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }
}
