import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Estado vacío que explica y ofrece crear lo primero (Guía de producto, checklist de pantalla).
 *
 *   <app-empty-state title="Todavía no hay facturas" text="Crea la primera para empezar a cobrar."
 *     actionLabel="Nueva factura" actionLink="/invoices/new" [canAct]="canWrite()" />
 *   <app-empty-state [filtered]="hasFilters()" title="No hay facturas con esos filtros" (clear)="clearFilters()" />
 *
 * - Dentro de una tabla va en <tr><td colspan="N"> con el número de columnas de la tabla.
 * - `canAct` (por defecto verdadero): pásale el permiso; si es falso no se muestra el botón de crear.
 * - `filtered`: con filtros activos muestra «Quitar filtros» (emite `clear`) en lugar del botón de crear.
 */
@Component({
  selector: 'app-empty-state',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="empty">
      <h3>{{ title() }}</h3>
      @if (text()) { <p>{{ text() }}</p> }
      @if (filtered()) {
        <button type="button" class="btn" style="margin-top:12px" (click)="clear.emit()">Quitar filtros</button>
      } @else if (actionLabel() && actionLink() && canAct()) {
        <a class="btn btn-primary" style="margin-top:12px" [routerLink]="actionLink()">{{ actionLabel() }}</a>
      }
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly text = input<string>('');
  readonly actionLabel = input<string>('');
  readonly actionLink = input<string>('');
  readonly canAct = input<boolean>(true);
  readonly filtered = input<boolean>(false);
  readonly clear = output<void>();
}
