import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';

@Component({
  selector: 'app-login',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule],
  template: `
    <div class="wrap">
      <section class="intro" aria-hidden="true">
        <svg viewBox="0 0 120 120" width="76" height="76"><rect x="10" y="14" width="100" height="92" rx="10" fill="none" stroke="currentColor" stroke-width="5"/><path d="M60 14v92M10 48h100M10 78h100" stroke="currentColor" stroke-width="5"/><circle cx="35" cy="31" r="5" fill="currentColor"/><circle cx="85" cy="31" r="5" fill="currentColor"/></svg>
        <h1>Libros al día,<br>impuestos en orden.</h1>
        <p>Contabilidad, facturación con NCF, bancos y reportes para la DGII, en un solo lugar.</p>
      </section>
      <section class="card">
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
      await this.auth.login(v.email, v.password);
      const back = this.route.snapshot.queryParamMap.get('returnUrl');
      await this.router.navigateByUrl(back && back.startsWith('/') && !back.startsWith('//') ? back : '/');
    } catch (e) {
      this.error.set(errorMessage(e));
    }
    this.busy.set(false);
  }
}
