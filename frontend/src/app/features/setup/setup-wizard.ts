import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { Notify } from '../../core/notify';
import { SetupState } from '../../core/setup-status';
import { UI } from '../../shared/ui';
import { ErrorNotice } from '../../shared/ui/error-notice';
import { Stepper } from '../../shared/ui/stepper';

const INTRO: Record<string, string> = {
  company: 'Nombre, RNC, dirección y tu año fiscal. Es lo que sale en tus facturas.',
  accounting: 'Plan de cuentas, cuentas automáticas, impuestos y diarios. Con un clic lo dejamos listo con el estándar de RD.',
  ncf: 'Los números de comprobante que te autoriza la DGII. Sin ellos no puedes emitir facturas con valor fiscal.',
  money: 'Tu cuenta de banco o tu caja, para registrar cobros y pagos.',
  firstInvoice: 'Crea un cliente y emite tu primera factura.',
};

/** Configuración inicial (E2): 5 grupos, cada uno se puede saltar; nada es obligatorio (P7). */
@Component({
  selector: 'app-setup-wizard',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ErrorNotice, Stepper, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Configuración inicial</h1><p class="sub">Cinco pasos para emitir tu primera factura válida. Puedes saltar cualquiera y volver después.</p></div></div>
      @if (setup.status(); as s) {
        <section class="panel panel-pad section"><app-stepper [steps]="s.groups" [current]="current()" label="Pasos de la configuración inicial" /></section>
        @for (g of s.groups; track g.key; let i = $index) {
          <section class="panel panel-pad section group" [class.done]="g.done">
            <h2>{{ i + 1 }}. {{ g.title }} @if (g.done) { <span class="badge pos">✓&nbsp;Listo</span> }</h2>
            <p class="dim">{{ intro[g.key] }}</p>
            @if (!g.done) { <p>{{ g.reason }}</p> }
            <div class="btn-row">
              @if (g.key === 'accounting' && !g.done && auth.has('ADMIN')) {
                <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="prepare()">{{ busy() ? 'Preparando…' : 'Preparar mi contabilidad' }}</button>
              }
              @if (g.key === 'ncf' && !g.done) { <a class="btn btn-primary" routerLink="/setup/ncf">Guía para cargar tus NCF</a> }
              <a class="btn" [routerLink]="g.route">{{ g.done ? 'Revisar' : 'Ir a configurarlo' }}</a>
            </div>
          </section>
        }
        <section class="panel panel-pad section">
          <h2>¿Quieres ver primero cómo se ve?</h2>
          @if (setup.samples()) {
            <p>Estás viendo <strong>datos de ejemplo</strong>. Bórralos antes de empezar con tus datos reales.</p>
            <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="removeSamples()">Borrar los datos de ejemplo</button>
          } @else {
            <p class="dim">Cargamos clientes, facturas, cobros y un banco de mentira para que explores. Se borran con un clic sin tocar nada real. Necesita la contabilidad preparada.</p>
            @if (auth.has('ADMIN')) { <button type="button" class="btn" [disabled]="busy()" (click)="loadSamples()">Cargar datos de ejemplo</button> }
          }
        </section>
        <app-error-notice [error]="error()" />
      } @else { <div class="loading"><span class="spinner"></span> Cargando…</div> }
    </div>
  `,
  styles: `.group.done { opacity: .85; } .group h2 { font-size: 1.05rem; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }`,
})
export class SetupWizard {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  protected readonly auth = inject(Auth);
  protected readonly setup = inject(SetupState);
  protected readonly intro = INTRO;
  protected readonly busy = signal(false);
  protected readonly error = signal<unknown>(null);

  constructor() { void this.setup.load(); }

  protected current() { return this.setup.status()?.groups.find((g) => !g.done)?.key ?? null; }

  private async run(fn: () => Promise<string>): Promise<void> {
    this.busy.set(true); this.error.set(null);
    try { this.notify.ok(await fn()); await this.setup.load(); } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }

  protected prepare(): Promise<void> {
    return this.run(async () => {
      const r = await firstValueFrom(this.api.post<{ accounts: number; taxes: number; journals: number }>('/guidance/chart-template', {}));
      return `Listo: ${r.accounts} cuentas, ${r.taxes} impuestos y ${r.journals} diarios.`;
    });
  }
  protected loadSamples(): Promise<void> {
    return this.run(async () => { await firstValueFrom(this.api.post('/guidance/sample-data', {})); return 'Datos de ejemplo cargados.'; });
  }
  protected async removeSamples(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Borrar los datos de ejemplo', message: 'Se borran los clientes, facturas, cobros y el banco de ejemplo. Tus datos reales no se tocan.', confirmText: 'Borrar ejemplos', danger: true }))) return;
    await this.run(async () => { await firstValueFrom(this.api.delete('/guidance/sample-data')); return 'Datos de ejemplo borrados.'; });
  }
}
