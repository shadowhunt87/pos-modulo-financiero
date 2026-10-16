import { ChangeDetectionStrategy, Component, effect, inject, input, output, signal, untracked } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { errorMessage } from '../../../../core/errors';
import { UI } from '../../../../shared/ui';
import { PosApi } from '../pos-api';
import { APPROVAL_LABEL } from '../types';

/** Autorización de supervisor: su correo y su PIN. Devuelve el id de la autorización (sirve una vez, 2 minutos). */
@Component({
  selector: 'app-pos-approval',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ...UI],
  template: `
    <app-modal [open]="!!action()" title="Autorización de supervisor" width="420px" (closed)="closed.emit()">
      <form id="ap-form" (ngSubmit)="submit()" class="stack">
        <p class="dim">Para <strong>{{ label() }}</strong> hace falta que un supervisor ponga su PIN.</p>
        <div class="field"><label for="ap-email">Correo del supervisor</label>
          <input id="ap-email" name="email" class="input" type="email" autocomplete="off" [(ngModel)]="email" required /></div>
        <div class="field"><label for="ap-pin">PIN</label>
          <input id="ap-pin" name="pin" class="input pin" type="password" inputmode="numeric" maxlength="6" autocomplete="off" [(ngModel)]="pin" required /></div>
        @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="closed.emit()">Cancelar</button>
        <button type="submit" form="ap-form" class="btn btn-primary" [disabled]="busy() || !email || pin.length < 4">{{ busy() ? 'Verificando…' : 'Autorizar' }}</button>
      </ng-container>
    </app-modal>
  `,
  styles: `.pin { letter-spacing: .4em; font-size: 20px; text-align: center; }`,
})
export class PosApprovalDialog {
  private readonly pos = inject(PosApi);
  readonly action = input<string | null>(null);
  readonly approved = output<string>();
  readonly closed = output<void>();
  protected email = '';
  protected pin = '';
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected label = () => APPROVAL_LABEL[this.action() ?? ''] ?? 'esta acción';

  constructor() {
    effect(() => { if (this.action()) untracked(() => { this.pin = ''; this.error.set(''); }); });
  }

  protected async submit(): Promise<void> {
    const action = this.action();
    if (!action || this.busy()) return;
    this.busy.set(true); this.error.set('');
    try {
      const r = await this.pos.approve({ action, supervisorEmail: this.email.trim(), pin: this.pin });
      this.approved.emit(r.approvalId);
    } catch (e) { this.error.set(errorMessage(e)); this.pin = ''; }
    this.busy.set(false);
  }
}
