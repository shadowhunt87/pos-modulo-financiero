import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Notify } from '../../core/notify';
import { TwoFactorState } from '../../core/two-factor';
import { UI } from '../../shared/ui';
import { ErrorNotice } from '../../shared/ui/error-notice';
import { FieldHelp } from '../../shared/ui/field-help';
import { RecoveryCodes } from '../../shared/ui/recovery-codes';

interface Setup { otpauthUri: string; qrCode: string; secret: string; expiresInSeconds: number }
type Flow = '' | 'activate' | 'change' | 'regenerate' | 'disable';

/** Seguridad de mi cuenta (ANEXO-S0 §5.5): activar, cambiar de teléfono, regenerar códigos y desactivar el 2FA. */
@Component({
  selector: 'app-security',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ErrorNotice, FieldHelp, RecoveryCodes, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Seguridad de mi cuenta</h1><p class="sub">Verificación en dos pasos: además de tu clave, un código de tu teléfono.</p></div></div>

      @if (tf.status(); as s) {
        <section class="panel panel-pad">
          @if (s.enabled) {
            <p><span class="badge pos">✓&nbsp;Activada</span> desde el {{ s.enabledAt | fdatetime }}@if (s.enabledIp) { , desde la dirección {{ s.enabledIp }} }.</p>
            <p class="hint">Si no reconoces esta activación, avisa a tu administrador de inmediato.</p>
            <p>Te quedan <strong>{{ s.recoveryCodesRemaining }}</strong> códigos de emergencia.@if (s.recoveryCodesRemaining <= 3) { <span class="badge warn">!&nbsp;Pocos: genera nuevos</span> }</p>
            <div class="btn-row">
              <button type="button" class="btn" (click)="open('change')">Cambiar de teléfono</button>
              <button type="button" class="btn" (click)="open('regenerate')">Generar códigos nuevos</button>
              @if (!s.requiredForMyRole) { <button type="button" class="btn btn-danger" (click)="open('disable')">Desactivar</button> }
            </div>
            @if (s.requiredForMyRole) { <p class="hint">Tu rol exige la verificación en dos pasos: no se puede desactivar.</p> }
          } @else {
            <p><span class="badge warn">!&nbsp;Sin activar</span> Si alguien consigue tu clave, podría entrar a tu cuenta.</p>
            <button type="button" class="btn btn-primary" (click)="open('activate')">Activar la verificación en dos pasos</button>
          }
        </section>
      } @else {
        <div class="loading"><span class="spinner"></span> Cargando…</div>
      }
    </div>

    <app-modal [open]="!!flow()" [title]="title()" width="560px" (closed)="close()">
      @if (codes().length) {
        <app-recovery-codes [codes]="codes()" />
      } @else if ((flow() === 'activate' || flow() === 'change') && setup(); as x) {
        <p class="hint">Paso 2 de 3 · Abre la aplicación, pulsa «+» y escanea:</p>
        <img class="qr" [src]="x.qrCode" alt="Código QR para la aplicación de verificación" width="200" height="200" />
        <p class="hint">¿No puedes escanear? Escribe esta clave: <span class="mono">{{ x.secret }}</span></p>
        <div class="field"><label for="s-code">Código de 6 dígitos que muestra la aplicación</label>
          <input id="s-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="6" [value]="code()" (input)="code.set($any($event.target).value)" /></div>
      } @else {
        @if (flow() === 'activate') {
          <p class="hint">Paso 1 de 3 · Instala en tu teléfono Google Authenticator o Microsoft Authenticator (gratis, en la tienda de tu teléfono).</p>
        }
        <div class="field"><label for="s-pw">Tu contraseña</label><input id="s-pw" class="input" type="password" autocomplete="current-password" [value]="password()" (input)="password.set($any($event.target).value)" /></div>
        @if (flow() !== 'activate') {
          <div class="field"><label for="s-cur">Código de tu aplicación actual <app-field-help text="Los 6 dígitos de la aplicación, o uno de tus códigos de emergencia si ya no tienes el teléfono." /></label>
            <input id="s-cur" class="input" autocomplete="one-time-code" maxlength="32" [value]="code()" (input)="code.set($any($event.target).value)" /></div>
        }
      }
      <app-error-notice [error]="error()" />
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="close()">{{ codes().length ? 'Ya los guardé' : 'Cancelar' }}</button>
        @if (!codes().length) {
          <button type="button" class="btn" [class.btn-primary]="flow() !== 'disable'" [class.btn-danger]="flow() === 'disable'" [disabled]="busy()" (click)="next()">{{ busy() ? 'Un momento…' : actionText() }}</button>
        }
      </ng-container>
    </app-modal>
  `,
  styles: `.qr { display: block; margin: 8px auto; background: #fff; padding: 6px; border-radius: 8px; }`,
})
export class Security {
  private readonly api = inject(Api);
  private readonly auth = inject(Auth);
  private readonly notify = inject(Notify);
  protected readonly tf = inject(TwoFactorState);

  protected readonly flow = signal<Flow>('');
  protected readonly setup = signal<Setup | null>(null);
  protected readonly password = signal('');
  protected readonly code = signal('');
  protected readonly codes = signal<string[]>([]);
  protected readonly busy = signal(false);
  protected readonly error = signal<unknown>(null);

  constructor() { void this.tf.load(true); }

  protected title(): string {
    return { '': '', activate: 'Activar la verificación en dos pasos', change: 'Cambiar de teléfono', regenerate: 'Códigos de emergencia nuevos', disable: 'Desactivar la verificación' }[this.flow()];
  }
  protected actionText(): string {
    if (this.setup()) return 'Activar';
    return { '': '', activate: 'Continuar', change: 'Continuar', regenerate: 'Generar', disable: 'Desactivar' }[this.flow()];
  }

  protected open(f: Flow): void { this.flow.set(f); this.setup.set(null); this.password.set(''); this.code.set(''); this.codes.set([]); this.error.set(null); }
  protected close(): void { this.flow.set(''); this.setup.set(null); this.codes.set([]); void this.tf.load(true); }

  protected async next(): Promise<void> {
    if (this.busy()) return;
    this.busy.set(true); this.error.set(null);
    try {
      const f = this.flow();
      if (this.setup()) {
        const r = await firstValueFrom(this.api.post<{ access_token: string; recoveryCodes: string[] }>('/users/me/two-factor/enable', { code: this.code().trim() }));
        this.auth.replaceToken(r.access_token);
        this.codes.set(r.recoveryCodes);
        this.notify.ok(f === 'change' ? 'Teléfono cambiado.' : 'Verificación en dos pasos activada.');
      } else if (f === 'activate' || f === 'change') {
        this.setup.set(await firstValueFrom(this.api.post<Setup>('/users/me/two-factor/setup', { password: this.password(), ...(f === 'change' ? { code: this.code().trim() } : {}) })));
        this.code.set('');
      } else if (f === 'regenerate') {
        const r = await firstValueFrom(this.api.post<{ recoveryCodes: string[] }>('/users/me/two-factor/recovery-codes', { password: this.password(), code: this.code().trim() }));
        this.codes.set(r.recoveryCodes);
      } else if (f === 'disable') {
        const r = await firstValueFrom(this.api.post<{ access_token: string }>('/users/me/two-factor/disable', { password: this.password(), code: this.code().trim() }));
        this.auth.replaceToken(r.access_token);
        this.notify.ok('Verificación en dos pasos desactivada.');
        this.close();
      }
    } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }
}
