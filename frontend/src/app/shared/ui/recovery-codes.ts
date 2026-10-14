import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { saveBlob } from '../../core/api';
import { Notify } from '../../core/notify';

/** Los 10 códigos de emergencia: se muestran UNA sola vez (nada en localStorage). Copiar o descargar .txt. */
@Component({
  selector: 'app-recovery-codes',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="notice warn" role="status"><strong>Guárdalos ahora: no se vuelven a mostrar.</strong> Cada código sirve una sola vez para entrar si pierdes el teléfono.</div>
    <ol class="codes mono">@for (c of codes(); track c) { <li>{{ c }}</li> }</ol>
    <div class="btn-row">
      <button type="button" class="btn btn-sm" (click)="copy()">Copiar</button>
      <button type="button" class="btn btn-sm" (click)="download()">Descargar .txt</button>
    </div>
  `,
  styles: `.codes { columns: 2; gap: 24px; margin: 12px 0; padding-left: 22px; font-size: 15px; line-height: 1.8; } @media (max-width: 480px) { .codes { columns: 1; } }`,
})
export class RecoveryCodes {
  private readonly notify = inject(Notify);
  readonly codes = input<string[]>([]);
  private text() { return `Códigos de emergencia (verificación en dos pasos)\nCada uno sirve una sola vez.\n\n${this.codes().join('\n')}\n`; }
  protected async copy(): Promise<void> {
    try { await navigator.clipboard.writeText(this.text()); this.notify.ok('Códigos copiados.'); }
    catch { this.notify.error('No se pudo copiar: descárgalos o anótalos.'); }
  }
  protected download(): void { saveBlob(new Blob([this.text()], { type: 'text/plain;charset=utf-8' }), 'codigos-de-emergencia.txt'); }
}
