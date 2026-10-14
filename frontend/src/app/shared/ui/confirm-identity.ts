import { ChangeDetectionStrategy, Component, inject, input, model } from '@angular/core';
import { TwoFactorState } from '../../core/two-factor';

/**
 * Confirmación reforzada (ANEXO-S0 3.10b): tu clave y, si tienes la verificación en dos pasos, el código de tu app.
 *   <app-confirm-identity [(password)]="pw" [(code)]="cd" />
 * Una clave o un código mal escritos dan 422 y NO cierran la sesión.
 */
@Component({
  selector: 'app-confirm-identity',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset class="ci">
      <legend>{{ title() }}</legend>
      <p class="hint">{{ hint() }}</p>
      <div class="field"><label [for]="id() + '-pw'">Tu contraseña</label>
        <input class="input" type="password" [id]="id() + '-pw'" autocomplete="current-password" maxlength="72" [value]="password()" (input)="password.set($any($event.target).value)" /></div>
      @if (tf.status()?.enabled !== false) {
        <div class="field"><label [for]="id() + '-code'">Código de tu aplicación @if (tf.status() === null) { (si la tienes activada) }</label>
          <input class="input" [id]="id() + '-code'" inputmode="numeric" autocomplete="one-time-code" maxlength="32" placeholder="6 dígitos o código de emergencia" [value]="code()" (input)="code.set($any($event.target).value)" /></div>
      }
    </fieldset>
  `,
  styles: `.ci { border: 1px dashed var(--line-strong); border-radius: var(--radius); padding: 10px 12px; margin: 12px 0 0; display: flex; flex-direction: column; gap: 8px; } legend { font-weight: 600; padding: 0 4px; }`,
})
export class ConfirmIdentity {
  protected readonly tf = inject(TwoFactorState);
  readonly password = model('');
  readonly code = model('');
  readonly id = input('ci');
  readonly title = input('Confirma que eres tú');
  readonly hint = input('Por seguridad, esta acción pide tu contraseña (y el código de tu aplicación si la tienes activada).');

  constructor() { void this.tf.load(); }
}
