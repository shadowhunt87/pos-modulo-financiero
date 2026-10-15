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
        <div class="logo"><svg viewBox="0 0 32 32" width="44" height="44"><rect width="32" height="32" rx="9" fill="currentColor"/><path d="M9 21.5V14M14 21.5V10.5M19 21.5v-5M24 21.5V12.5" stroke="#fff" stroke-width="2.4" stroke-linecap="round"/></svg><span>Contabilidad y finanzas</span></div>
        <h1>Libros al día,<br>impuestos en orden.</h1>
        <p>Contabilidad, facturación con NCF, bancos y reportes para la DGII, en un solo lugar.</p>
        <ul class="feats">
          <li>Facturas con NCF y e-CF</li>
          <li>Bancos y conciliación</li>
          <li>606 · 607 · 608 e IT-1 listos</li>
          <li>Estados financieros al momento</li>
        </ul>
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
    .intro {
      position: relative; overflow: hidden; color: var(--on-ink); padding: 8vh 7vw; display: flex; flex-direction: column; justify-content: center; gap: 22px;
      background: radial-gradient(1200px 600px at -10% -20%, rgba(45, 212, 191, .22), transparent 60%),
                  radial-gradient(900px 500px at 120% 120%, rgba(79, 70, 229, .25), transparent 60%), var(--ink);
    }
    .intro::after {
      content: ''; position: absolute; inset: 0; pointer-events: none; opacity: .5;
      background-image: linear-gradient(rgba(255,255,255,.04) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.04) 1px, transparent 1px);
      background-size: 44px 44px; mask-image: radial-gradient(circle at 30% 40%, #000, transparent 75%);
    }
    .intro > * { position: relative; z-index: 1; }
    .logo { display: flex; align-items: center; gap: 12px; color: var(--primary-side); font-weight: 600; font-size: 15px; }
    .logo span { color: #fff; }
    .intro h1 { color: #fff; font-size: clamp(32px, 3.8vw, 50px); line-height: 1.08; letter-spacing: -.035em; font-weight: 750; }
    .intro p { max-width: 40ch; color: var(--on-ink-dim); font-size: 16.5px; }
    .feats { list-style: none; margin: 6px 0 0; padding: 0; display: grid; grid-template-columns: repeat(2, max-content); gap: 10px 26px; color: var(--on-ink); font-size: 14px; }
    .feats li { display: flex; align-items: center; gap: 9px; }
    .feats li::before { content: ''; width: 18px; height: 18px; border-radius: 6px; flex: none; background: rgba(45, 212, 191, .16) url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%232dd4bf' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m5 12 5 5 9-10'/%3E%3C/svg%3E") center / 12px no-repeat; }
    .card { align-self: center; justify-self: center; width: min(420px, calc(100% - 40px)); padding: 34px 32px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; box-shadow: var(--shadow-pop); }
    .card h2 { font-size: 22px; font-weight: 700; letter-spacing: -.02em; margin-bottom: 20px; }
    form { display: flex; flex-direction: column; gap: 14px; }
    .code { font-size: 20px; letter-spacing: .2em; text-align: center; }
    .linkbtn { align-self: flex-start; }
    .qr { display: block; margin: 8px auto; background: #fff; padding: 6px; border-radius: 8px; }
    .apps { padding-left: 18px; margin: 8px 0 14px; line-height: 1.8; }
    .btn-primary { height: 42px; font-size: 14.5px; }
    @media (max-width: 860px) { .wrap { grid-template-columns: 1fr; } .intro { padding: 28px 24px; } .intro p, .feats { display: none; } .card { margin: 24px 0; } }
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
