import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SetupState } from '../../core/setup-status';

/** «Para facturar falta X → Configurar» (E2). Solo aparece si falta algo de los grupos que pide la pantalla. */
@Component({
  selector: 'app-readiness-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (missing().length) {
      <div class="notice warn" role="status">
        <strong>{{ action() }} falta:</strong>
        @for (g of missing(); track g.key; let last = $last) { {{ g.title }} (<a [routerLink]="g.route">configurar</a>){{ last ? '.' : ',' }} }
      </div>
    }
  `,
})
export class ReadinessNotice {
  private readonly setup = inject(SetupState);
  /** Grupos del arranque que necesita esta pantalla (claves de /guidance/setup-status). */
  readonly needs = input<string[]>(['accounting', 'ncf']);
  readonly action = input('Para facturar');
  protected readonly missing = computed(() => (this.setup.status()?.groups ?? []).filter((g) => this.needs().includes(g.key) && !g.done));
  constructor() { if (!this.setup.status()) void this.setup.load(); }
}
