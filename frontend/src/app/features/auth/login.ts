import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth, type EnrollStart } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { RecoveryCodes } from '../../shared/ui/recovery-codes';

type Step = 'password' | 'code' | 'enroll' | 'codes';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RecoveryCodes],
  template: `
    <div class="wrap">
      <section class="intro" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="76" height="76"><rect x="10" y="14" width="100" height="92" rx="10" fill="none" stroke="currentColor" stroke-width="5"/><path d="M60 14v92M10 48h100M10 78h100" stroke="currentColor" stroke-width="5"/><circle cx="35" cy="31" r="5" fill="currentColor"/><circle cx="85" cy="31" r="5" fill="currentColor"/></svg>
        <h1>Libros al día,<br>impuestos en orden.</h1>
        <p>Contabilidad, facturación con NCF, bancos y reportes para la DGII, en un solo lugar.</p>
      </section>
      <section class="card">
        @switch (step()) {
        @case ('password') {
        <h2>Iniciar sesión</h2>
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          <div class="field">
            <label for="email">Correo</label>
            <input id="email" class="input" type="email" formControlName="email" autocomplete="username" autofocus />
          </div>
          <div class="field">
            <label for="password">Clave</label>
            <input id="password" class="input" type="password" formControlName="password" autocomplete="current-password" />
          </div>
          @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
          <button class="btn btn-primary" type="submit" [disabled]="busy() || form.invalid">{{ busy() ? 'Entrando…' : 'Entrar' }}</button>
        </form>
        }

        <!-- Paso 2: código de la app o de emergencia -->
        @case ('code') {
        <h2>Verificación en dos pasos</h2>
        <form (ngSubmit)="sendCode()" novalidate>
          <div class="field">
            <label for="code">{{ useRecovery() ? 'Código de emergencia' : 'Código de 6 dígitos de tu aplicación' }}</label>
            <input id="code" class="input code" [attr.inputmode]="useRecovery() ? 'text' : 'numeric'" autocomplete="one-time-code" autofocus
              [attr.maxlength]="useRecovery() ? 32 : 6" [placeholder]="useRecovery() ? 'XXXX-XXXX-XXXX-XXXX' : '123456'" [value]="code()" (input)="code.set($any($event.target).value)" />
            @if (!useRecovery()) { <span class="hint">Ábrela en tu teléfono (Google o Microsoft Authenticator) y escribe el número que se ve ahora.</span> }
          </div>
          @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
          <button class="btn btn-primary" type="submit" [disabled]="busy() || !code().trim()">{{ busy() ? 'Comprobando…' : 'Entrar' }}</button>
          <button type="button" class="linkbtn" (click)="useRecovery.set(!useRecovery()); code.set('')">{{ useRecovery() ? 'Usar el código de la aplicación' : 'Usar un código de emergencia' }}</button>
          <button type="button" class="linkbtn" (click)="lost.set(!lost())">Perdí mi teléfono</button>
          @if (lost()) {
            <div class="notice info" role="status">
              1. Entra con uno de tus <strong>códigos de emergencia</strong> (los que guardaste al activar la verificación).<br>
              2. Si no los tienes, pide a <strong>otro administrador de tu empresa</strong> que restablezca tu verificación en Usuarios.<br>
              3. Si eres el único administrador, escribe a soporte: te restablecen la verificación después de confirmar tu identidad.
            </div>
          }
          <button type="button" class="linkbtn" (click)="restart()">Volver a escribir correo y clave</button>
        </form>
        }

        <!-- Inscripción obligatoria (rol que exige 2FA) -->
        @case ('enroll') {
        <h2>Activa la verificación en dos pasos</h2>
        <p class="hint">Tu empresa exige este paso para tu cuenta. Paso {{ enrollStep() }} de 3.</p>
        @if (enrollStep() === 1) {
          <p>Instala en tu teléfono una de estas aplicaciones gratuitas:</p>
          <ul class="apps">
            <li><a href="https://play.google.com/store/apps/details?id=com.google.android.apps.authenticator2" target="_blank" rel="noopener">Google Authenticator (Android)</a> · <a href="https://apps.apple.com/app/google-authenticator/id388497605" target="_blank" rel="noopener">iPhone</a></li>
            <li><a href="https://play.google.com/store/apps/details?id=com.azure.authenticator" target="_blank" rel="noopener">Microsoft Authenticator (Android)</a> · <a href="https://apps.apple.com/app/microsoft-authenticator/id983156458" target="_blank" rel="noopener">iPhone</a></li>
          </ul>
          @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
          <button class="btn btn-primary" type="button" [disabled]="busy()" (click)="startEnroll()">{{ busy() ? 'Preparando…' : 'Ya la tengo: continuar' }}</button>
        }
        @if (enrollStep() === 2 && enroll(); as e) {
          <p>Abre la aplicación, pulsa «+» y escanea este código:</p>
          <img class="qr" [src]="e.qrCode" alt="Código QR para la aplicación de verificación" width="200" height="200" />
          <p class="hint">¿No puedes escanear? Escribe esta clave en la aplicación: <span class="mono">{{ e.secret }}</span></p>
          <form (ngSubmit)="sendCode()" novalidate>
            <div class="field"><label for="ecode">Código de 6 dígitos que muestra la aplicación</label>
              <input id="ecode" class="input code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" [value]="code()" (input)="code.set($any($event.target).value)" /></div>
            @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
            <button class="btn btn-primary" type="submit" [disabled]="busy() || code().trim().length !== 6">{{ busy() ? 'Comprobando…' : 'Activar y entrar' }}</button>
          </form>
        }
        <button type="button" class="linkbtn" (click)="restart()">Cancelar</button>
        }

        <!-- Códigos de emergencia (una sola vez) antes de entrar -->
        @case ('codes') {
        <h2>Tus códigos de emergencia</h2>
        <p class="hint">Paso 3 de 3. Guárdalos en un lugar seguro, fuera del teléfono.</p>
        <app-recovery-codes [codes]="recoveryCodes()" />
        <label class="check" style="margin-top:12px"><input type="checkbox" [checked]="saved()" (change)="saved.set($any($event.target).checked)" /> Ya los guardé</label>
        <button class="btn btn-primary" type="button" style="margin-top:12px" [disabled]="!saved()" (click)="goIn()">Entrar</button>
        }
        }
      </section>
    </div>
  `,
  styles: `
    .wrap { min-height: 100vh; display: grid; grid-template-columns: 1.1fr 1fr; }
    .intro { background: var(--ink); color: var(--on-ink); padding: 8vh 7vw; display: flex; flex-direction: column; justify-content: center; gap: 22px; }
    .intro svg { color: var(--marker); }
    .intro h1 { color: #fff; font-size: clamp(30px, 3.6vw, 46px); line-height: 1.12; }
    .intro p { max-width: 38ch; color: var(--on-ink-dim); font-size: 16px; }
    .card { align-self: center; justify-self: center; width: min(400px, calc(100% - 40px)); padding: 28px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); box-shadow: var(--shadow); }
    .card h2 { font-family: var(--font-display); font-size: 22px; margin-bottom: 18px; }
    form { display: flex; flex-direction: column; gap: 14px; }
    .code { font-size: 20px; letter-spacing: .2em; text-align: center; }
    .linkbtn { align-self: flex-start; }
    .qr { display: block; margin: 8px auto; background: #fff; padding: 6px; border-radius: 8px; }
    .apps { padding-left: 18px; margin: 8px 0 14px; line-height: 1.8; }
    .btn-primary { height: 38px; }
    @media (max-width: 860px) { .wrap { grid-template-columns: 1fr; } .intro { padding: 28px 24px; } .intro p, .intro svg { display: none; } .card { margin: 24px 0; } }
  `,
})
export class Login {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(Auth);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly step = signal<Step>('password');
  // El desafío vive solo en memoria (nunca en localStorage)
  private challenge = '';
  protected readonly code = signal('');
  protected readonly useRecovery = signal(false);
  protected readonly lost = signal(false);
  protected readonly enroll = signal<EnrollStart | null>(null);
  protected readonly enrollStep = signal(1);
  protected readonly recoveryCodes = signal<string[]>([]);
  protected readonly saved = signal(false);
  protected readonly form = this.fb.nonNullable.group({
    email: ['', [Validators.required, Validators.email]],
    password: ['', [Validators.required, Validators.minLength(8)]],
  });

  constructor() {
    if (this.auth.isValid()) void this.router.navigateByUrl('/');
  }

  protected async submit(): Promise<void> {
    if (this.form.invalid || this.busy()) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const v = this.form.getRawValue();
      const res = await this.auth.login(v.email, v.password);
      if ('access_token' in res) await this.goIn();
      else {
        this.challenge = res.challengeToken; this.code.set(''); this.useRecovery.set(false); this.lost.set(false);
        this.step.set('twoFactorRequired' in res ? 'code' : 'enroll'); this.enrollStep.set(1);
      }
    } catch (e) {
      this.error.set(errorMessage(e));
    }
    this.busy.set(false);
  }

  protected async startEnroll(): Promise<void> {
    this.busy.set(true); this.error.set('');
    try { this.enroll.set(await this.auth.enrollStart(this.challenge)); this.enrollStep.set(2); }
    catch (e) { this.fromChallengeError(e); }
    this.busy.set(false);
  }

  protected async sendCode(): Promise<void> {
    if (this.busy() || !this.code().trim()) return;
    this.busy.set(true); this.error.set('');
    try {
      const res = await this.auth.loginSecondStep(this.challenge, this.code());
      this.challenge = '';
      if (res.recoveryCodes?.length) { this.recoveryCodes.set(res.recoveryCodes); this.step.set('codes'); }
      else {
        if (res.recoveryCodesRemaining !== undefined && res.recoveryCodesRemaining <= 3) {
          try { sessionStorage.setItem('fm.recoveryLow', String(res.recoveryCodesRemaining)); } catch { /* modo privado */ }
        }
        await this.goIn();
      }
    } catch (e) { this.fromChallengeError(e); }
    this.busy.set(false);
  }

  /** Si el desafío venció, se vuelve a pedir la clave con el mensaje del servidor. */
  private fromChallengeError(e: unknown): void {
    const msg = errorMessage(e);
    if (/venció/.test(msg)) { this.restart(); this.error.set(msg); return; }
    this.error.set(msg); this.code.set('');
  }

  protected restart(): void {
    this.challenge = ''; this.enroll.set(null); this.code.set(''); this.error.set(''); this.step.set('password');
  }

  protected async goIn(): Promise<void> {
    const back = this.route.snapshot.queryParamMap.get('returnUrl');
    await this.router.navigateByUrl(back && back.startsWith('/') && !back.startsWith('//') ? back : '/');
  }
}
