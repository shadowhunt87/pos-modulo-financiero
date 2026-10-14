import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Api } from '../../core/api';
import { Notify } from '../../core/notify';
import { UI } from '../../shared/ui';
import { ConfirmIdentity } from '../../shared/ui/confirm-identity';
import { ErrorNotice } from '../../shared/ui/error-notice';

interface Summary { tables: { model: string; rows: number }[]; files: { count: number; totalBytes: number }; estimatedBytes: number; limits: { perHour: number } }

/** Exportar todos mis datos (ANEXO-S0 §5.8): ZIP con todo lo de la empresa. Solo ADMIN, con confirmación reforzada. */
@Component({
  selector: 'app-data-export',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ConfirmIdentity, ErrorNotice, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Exportar todos mis datos</h1><p class="sub">Descarga en un solo archivo .zip toda la información de tu empresa, para guardarla o llevártela.</p></div></div>

      <div class="cols-2">
        <section class="panel panel-pad">
          <h2>Qué incluye</h2>
          <ul>
            <li>Una hoja (CSV, se abre en Excel) por cada tabla: facturas, asientos, clientes, cobros, bancos, presupuestos, bitácora…</li>
            <li>Todos los archivos adjuntos y las facturas electrónicas (XML).</li>
            <li>Un índice con huellas digitales (SHA-256) para comprobar que nada se alteró, y un archivo LEEME con instrucciones.</li>
          </ul>
          <h2>Qué no incluye</h2>
          <ul>
            <li>Claves de usuarios, credenciales bancarias, llaves de conexión y datos de la verificación en dos pasos.</li>
            <li>Los papeles de trabajo internos de la auditora (solo los hallazgos ya comunicados).</li>
          </ul>
        </section>
        <section class="panel panel-pad">
          <h2>Tamaño aproximado</h2>
          @if (summary(); as s) {
            <p class="big">{{ size() }}</p>
            <p class="hint">{{ rows() }} filas en {{ s.tables.length }} tablas y {{ s.files.count }} archivos. Puedes exportar hasta {{ s.limits.perHour }} veces por hora.</p>
          } @else if (!error()) { <div class="loading"><span class="spinner"></span> Calculando…</div> }
          <div class="notice warn" role="status">El archivo trae <strong>todos</strong> los datos de tu empresa. Guárdalo en un lugar seguro y no lo envíes por correo sin cifrar.</div>
        </section>
      </div>

      <section class="panel panel-pad section">
        <label class="check"><input type="checkbox" [checked]="leaving()" (change)="leaving.set($any($event.target).checked)" /> Me voy del servicio (exportación final)</label>
        <app-confirm-identity id="x-ci" [(password)]="cpw" [(code)]="ccode" />
        <app-error-notice [error]="error()" />
        <div class="btn-row" style="margin-top:14px">
          <button type="button" class="btn btn-primary" [disabled]="busy() || !cpw()" (click)="go()">{{ busy() ? 'Preparando el archivo… (puede tardar unos minutos)' : 'Descargar todos mis datos' }}</button>
        </div>
      </section>
    </div>
  `,
  styles: `.big { font-size: 26px; font-weight: 600; margin: 6px 0; } ul { padding-left: 18px; line-height: 1.6; margin: 8px 0 14px; } h2 { font-size: 1rem; }`,
})
export class DataExport {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly summary = signal<Summary | null>(null);
  protected readonly error = signal<unknown>(null);
  protected readonly busy = signal(false);
  protected readonly leaving = signal(false);
  protected readonly cpw = signal('');
  protected readonly ccode = signal('');
  protected readonly rows = computed(() => (this.summary()?.tables ?? []).reduce((n, t) => n + t.rows, 0).toLocaleString('es-DO'));
  protected readonly size = computed(() => {
    const b = this.summary()?.estimatedBytes ?? 0;
    return b > 1e9 ? `${(b / 1e9).toFixed(1)} GB` : b > 1e6 ? `${(b / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`;
  });

  constructor() {
    void this.api.getP<Summary>('/data-export/summary').then((s) => this.summary.set(s)).catch((e) => this.error.set(e));
  }

  protected async go(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(null);
    try {
      await this.api.downloadPost('/data-export', {
        confirmPassword: this.cpw(), ...(this.ccode().trim() ? { confirmCode: this.ccode().trim() } : {}),
        purpose: this.leaving() ? 'CANCELLATION' : 'ON_DEMAND',
      }, 'exportacion.zip');
      this.notify.ok('Archivo descargado.');
      this.cpw.set(''); this.ccode.set('');
    } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }
}
