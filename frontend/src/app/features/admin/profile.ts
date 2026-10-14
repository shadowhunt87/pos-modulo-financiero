import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { AbstractControl, FormBuilder, ReactiveFormsModule, ValidationErrors, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { TwoFactorState } from '../../core/two-factor';
import { RouterLink } from '@angular/router';
import { Auth, SessionUser } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { ROLE } from '../../shared/labels';
import { UI } from '../../shared/ui';

function sameAs(a: string, b: string) {
  return (g: AbstractControl): ValidationErrors | null => (g.get(a)?.value === g.get(b)?.value ? null : { mismatch: true });
}

@Component({
  selector: 'app-profile',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ReactiveFormsModule, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Mi perfil</h1><p class="sub">Tus datos de acceso y tu contraseña.</p></div></div>
      <div class="cols-2">
        <section class="panel">
          <div class="panel-head"><h2>Datos personales</h2></div>
          <form class="panel-pad" [formGroup]="profileForm" (ngSubmit)="saveProfile()" novalidate>
            <div class="form-grid">
              <div class="field span-all"><label for="p-name">Nombre</label><input id="p-name" class="input" formControlName="name" />
                @if (profileForm.controls.name.touched && profileForm.controls.name.invalid) { <span class="error-text">Escribe tu nombre.</span> }</div>
              <div class="field span-all"><span class="dim">Correo</span><div>{{ auth.user()?.email }}</div></div>
              <div class="field span-all"><span class="dim">Rol</span><div>{{ auth.user()?.role | lbl: ROLE }}</div></div>
            </div>
            @if (profileError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ profileError() }}</div> }
            <div class="btn-row" style="margin-top:14px"><button type="submit" class="btn btn-primary" [disabled]="savingProfile() || profileForm.pristine">{{ savingProfile() ? 'Guardando…' : 'Guardar' }}</button></div>
          </form>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Cambiar contraseña</h2></div>
          <form class="panel-pad" [formGroup]="passForm" (ngSubmit)="changePassword()" novalidate>
            <div class="form-grid">
              <div class="field span-all"><label for="c-cur">Contraseña actual</label><input id="c-cur" class="input" type="password" formControlName="currentPassword" autocomplete="current-password" />
                @if (passForm.controls.currentPassword.touched && passForm.controls.currentPassword.invalid) { <span class="error-text">Escribe tu contraseña actual.</span> }</div>
              <div class="field span-all"><label for="c-new">Contraseña nueva</label><input id="c-new" class="input" type="password" formControlName="newPassword" autocomplete="new-password" />
                @if (passForm.controls.newPassword.touched && passForm.controls.newPassword.invalid) { <span class="error-text">Entre 8 y 72 caracteres.</span> }</div>
              <div class="field span-all"><label for="c-rep">Repite la contraseña nueva</label><input id="c-rep" class="input" type="password" formControlName="repeat" autocomplete="new-password" />
                @if (passForm.controls.repeat.touched && passForm.hasError('mismatch')) { <span class="error-text">Las contraseñas no coinciden.</span> }</div>
              @if (tf.status()?.enabled) {
                <div class="field span-all"><label for="c-code">Código de tu aplicación</label><input id="c-code" class="input" inputmode="numeric" autocomplete="one-time-code" maxlength="32" formControlName="code" /></div>
              }
            </div>
            @if (passError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ passError() }}</div> }
            <div class="btn-row" style="margin-top:14px"><button type="submit" class="btn btn-primary" [disabled]="savingPass()">{{ savingPass() ? 'Guardando…' : 'Cambiar contraseña' }}</button></div>
          </form>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Verificación en dos pasos</h2><a routerLink="/security">Seguridad de mi cuenta</a></div>
          <p class="panel-pad">{{ tf.status()?.enabled ? 'Activada: al entrar te pedimos un código de tu teléfono.' : 'Sin activar. Actívala para que nadie entre solo con tu clave.' }}</p>
        </section>
      </div>
    </div>
  `,
})
export class Profile {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  protected readonly auth = inject(Auth);
  protected readonly ROLE = ROLE;

  protected readonly savingProfile = signal(false);
  protected readonly profileError = signal('');
  protected readonly savingPass = signal(false);
  protected readonly passError = signal('');

  protected readonly profileForm = this.fb.nonNullable.group({ name: [this.auth.user()?.name ?? '', [Validators.required, Validators.maxLength(150)]] });
  protected readonly passForm = this.fb.nonNullable.group({
    currentPassword: ['', Validators.required],
    newPassword: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    repeat: ['', Validators.required],
    code: [''],
  }, { validators: sameAs('newPassword', 'repeat') });
  protected readonly tf = inject(TwoFactorState);

  constructor() { void this.tf.load(); }

  protected async saveProfile(): Promise<void> {
    this.profileForm.markAllAsTouched();
    if (this.profileForm.invalid || this.savingProfile()) return;
    this.savingProfile.set(true); this.profileError.set('');
    try {
      const name = this.profileForm.getRawValue().name.trim();
      await firstValueFrom(this.api.patch('/users/me', { name }));
      this.auth.updateUser({ name });
      this.profileForm.reset({ name });
      this.notify.ok('Perfil actualizado.');
    } catch (e) { this.profileError.set(errorMessage(e)); }
    this.savingProfile.set(false);
  }

  protected async changePassword(): Promise<void> {
    this.passForm.markAllAsTouched();
    if (this.passForm.invalid || this.savingPass()) return;
    this.savingPass.set(true); this.passError.set('');
    try {
      const v = this.passForm.getRawValue();
      const res = await firstValueFrom(this.api.post<{ access_token: string; user?: SessionUser }>('/users/me/change-password', {
        currentPassword: v.currentPassword, newPassword: v.newPassword, ...(v.code.trim() ? { code: v.code.trim() } : {}),
      }));
      // El backend invalida los tokens anteriores: se guarda el nuevo para no perder la sesión
      if (res.access_token) this.auth.replaceToken(res.access_token);
      this.passForm.reset();
      this.notify.ok('Contraseña cambiada.');
    } catch (e) { this.passError.set(errorMessage(e)); }
    this.savingPass.set(false);
  }
}
