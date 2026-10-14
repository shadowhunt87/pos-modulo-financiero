import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Notify } from '../../core/notify';
import { UI } from '../../shared/ui';
import { FieldHelp } from '../../shared/ui/field-help';

interface ConnInfo {
  providers: { code: string; label: string }[]; eTypes: string[]; encryptionReady: boolean;
  connection: { providerCode: string; environment: string; numbering: string; settings: Record<string, unknown> | null; ecfTypes: string[]; active: boolean; hasCredentials: boolean; lastCheckAt: string | null; lastCheckOk: boolean | null } | null;
}

/** Conexión con el proveedor certificado de e-CF (N7, solo ADMIN). Las credenciales se escriben y nunca se muestran. */
@Component({
  selector: 'app-ecf-connection',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Facturación electrónica: conexión</h1><p class="sub">Con la conexión activa, tus e-CF se emiten desde el sistema y se envían solos a tu proveedor certificado.</p></div></div>
      @if (info(); as i) {
        @if (!i.encryptionReady) { <div class="notice warn" role="status">El servidor no tiene ECF_ENCRYPTION_KEY: no se pueden guardar credenciales. Avisa al administrador del sistema.</div> }
        @if (i.connection?.lastCheckAt) { <div class="notice" [class.pos]="i.connection!.lastCheckOk" [class.neg]="!i.connection!.lastCheckOk" role="status">Última prueba {{ i.connection!.lastCheckAt | fdatetime }}: {{ i.connection!.lastCheckOk ? 'conexión correcta' : 'falló' }}</div> }
        <form class="panel panel-pad" (ngSubmit)="save()" novalidate>
          <div class="form-grid">
            <div class="field"><label for="c-p">Proveedor</label><select id="c-p" name="p" class="select" [(ngModel)]="providerCode">@for (p of i.providers; track p.code) { <option [value]="p.code">{{ p.label }}</option> }</select></div>
            <div class="field"><label for="c-e">Ambiente</label><select id="c-e" name="e" class="select" [(ngModel)]="environment"><option value="TEST">Pruebas</option><option value="PROD">Producción</option></select></div>
            <div class="field"><label for="c-n">¿Quién numera los e-NCF? <app-field-help text="Lo dice tu contrato con el proveedor. «El sistema» usa tus secuencias E cargadas en Comprobantes fiscales." /></label>
              <select id="c-n" name="n" class="select" [(ngModel)]="numbering"><option value="OURS">El sistema (mis secuencias E)</option><option value="PROVIDER">El proveedor</option></select></div>
            <fieldset class="field span-all"><legend class="label">Tipos que se emiten desde el sistema</legend>
              <div class="types">@for (t of i.eTypes; track t) { <label class="check"><input type="checkbox" [checked]="types().includes(t)" (change)="toggle(t, $any($event.target).checked)" /> {{ t }}</label> }</div></fieldset>
            @if (providerCode === 'http') {
              <div class="field span-all"><label for="c-s">Configuración técnica del proveedor (JSON) <app-field-help text="La da el proveedor: baseUrl, sendPath, statusPath, format (json o xml), fields y statusMap. Sin claves aquí." /></label>
                <textarea id="c-s" name="s" class="input mono" rows="8" [(ngModel)]="settingsText"></textarea></div>
              <div class="field"><label for="c-t">Token del proveedor (se guarda cifrado)</label><input id="c-t" name="t" class="input" type="password" autocomplete="off" [(ngModel)]="tokenValue" [placeholder]="i.connection?.hasCredentials ? 'Guardado: déjalo vacío para no cambiarlo' : ''" /></div>
            }
            <div class="field"><label class="check" for="c-a"><input id="c-a" name="a" type="checkbox" [(ngModel)]="active" /> Conexión activa</label></div>
          </div>
          <app-error-notice [error]="error()" />
          <div class="btn-row" style="margin-top:14px">
            <button type="submit" class="btn btn-primary" [disabled]="busy()">Guardar</button>
            @if (i.connection) { <button type="button" class="btn" [disabled]="busy()" (click)="check()">Probar la conexión</button> }
          </div>
        </form>
      } @else { <app-error-notice [error]="error()" /> }
    </div>
  `,
  styles: `.types { display: flex; flex-wrap: wrap; gap: 6px 16px; }`,
})
export class EcfConnection {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly info = signal<ConnInfo | null>(null);
  protected readonly types = signal<string[]>(['E31', 'E32', 'E34']);
  protected readonly busy = signal(false);
  protected readonly error = signal<unknown>(null);
  protected providerCode = 'sandbox';
  protected environment = 'TEST';
  protected numbering = 'OURS';
  protected active = false;
  protected settingsText = '{\n  "baseUrl": "https://",\n  "sendPath": "/ecf",\n  "statusPath": "/ecf/{trackId}",\n  "format": "json"\n}';
  protected tokenValue = '';

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    try {
      const i = await this.api.getP<ConnInfo>('/ecf/connection');
      this.info.set(i);
      const c = i.connection;
      if (c) { this.providerCode = c.providerCode; this.environment = c.environment; this.numbering = c.numbering; this.active = c.active; this.types.set(c.ecfTypes); if (c.settings) this.settingsText = JSON.stringify(c.settings, null, 2); }
    } catch (e) { this.error.set(e); }
  }
  protected toggle(t: string, on: boolean): void { this.types.update((xs) => (on ? [...xs, t] : xs.filter((x) => x !== t))); }

  protected async save(): Promise<void> {
    let settings: Record<string, unknown> | undefined;
    if (this.providerCode === 'http') {
      try { settings = JSON.parse(this.settingsText) as Record<string, unknown>; } catch { this.error.set('La configuración técnica no es un JSON válido.'); return; }
    }
    this.busy.set(true); this.error.set(null);
    try {
      const i = await firstValueFrom(this.api.put<ConnInfo>('/ecf/connection', {
        providerCode: this.providerCode, environment: this.environment, numbering: this.numbering, ecfTypes: this.types(), active: this.active,
        ...(settings ? { settings } : {}), ...(this.tokenValue ? { credentials: { token: this.tokenValue } } : {}),
      }));
      this.info.set(i); this.tokenValue = '';
      this.notify.ok('Conexión guardada.');
    } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }
  protected async check(): Promise<void> {
    this.busy.set(true);
    try { const r = await firstValueFrom(this.api.post<{ ok: boolean; message: string }>('/ecf/connection/check', {})); r.ok ? this.notify.ok(r.message) : this.notify.error(r.message); await this.load(); }
    catch (e) { this.error.set(e); }
    this.busy.set(false);
  }
}
