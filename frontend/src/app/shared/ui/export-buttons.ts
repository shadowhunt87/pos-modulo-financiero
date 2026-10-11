import { ChangeDetectionStrategy, Component, inject, input, signal } from '@angular/core';
import { Api, Query } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';

/** Botones “Excel” y “PDF” que descargan un reporte del módulo /exports (con el token). */
@Component({
  selector: 'app-export-buttons',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="btn-row no-print">
      <button type="button" class="btn btn-sm" [disabled]="!!busy()" (click)="go('xlsx')">{{ busy() === 'xlsx' ? 'Generando…' : 'Excel' }}</button>
      <button type="button" class="btn btn-sm" [disabled]="!!busy()" (click)="go('pdf')">{{ busy() === 'pdf' ? 'Generando…' : 'PDF' }}</button>
    </div>
  `,
})
export class ExportButtons {
  /** Ruta de exportación, p. ej. "/exports/trial-balance" o "/exports/dgii/607". */
  readonly path = input.required<string>();
  readonly query = input<Query>({});
  readonly name = input('reporte');

  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly busy = signal<'' | 'xlsx' | 'pdf'>('');

  protected async go(format: 'xlsx' | 'pdf'): Promise<void> {
    this.busy.set(format);
    try { await this.api.download(this.path(), { ...this.query(), format }, `${this.name()}.${format}`); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set('');
  }
}
