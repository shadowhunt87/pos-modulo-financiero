import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { UI } from '../../../../shared/ui';
import type { Parked } from '../types';

/** Ventas suspendidas de la terminal (F10). */
@Component({
  selector: 'app-pos-parked',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...UI],
  template: `
    <app-modal [open]="open()" title="Ventas suspendidas" width="560px" (closed)="closed.emit()">
      <ul class="list">
        @for (p of items(); track p.id) {
          <li><div><strong>{{ p.label }}</strong><div class="dim">{{ p.payload.lines.length }} producto(s) · {{ p.createdAt | fdatetime }}</div></div>
            <span class="btn-row"><button type="button" class="btn btn-ghost btn-sm" (click)="discard.emit(p)">Descartar</button>
              <button type="button" class="btn btn-primary btn-sm" (click)="resume.emit(p)">Recuperar</button></span></li>
        } @empty { <li class="dim">No hay ventas suspendidas en esta terminal.</li> }
      </ul>
      <ng-container modal-actions><button type="button" class="btn" (click)="closed.emit()">Cerrar</button></ng-container>
    </app-modal>
  `,
  styles: `.list { list-style: none; margin: 0; padding: 0; } .list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--line); }`,
})
export class PosParkedDialog {
  readonly open = input(false);
  readonly items = input<Parked[]>([]);
  readonly resume = output<Parked>();
  readonly discard = output<Parked>();
  readonly closed = output<void>();
}
