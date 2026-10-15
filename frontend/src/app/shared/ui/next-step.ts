import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Guidance } from '../../core/guidance';
import { HelpPrefs } from '../../core/help-prefs';
import { RouteInfo } from '../../core/route-info';

/**
 * "Siguiente paso: …" con enlace, según la pantalla actual. Se monta una vez en el shell.
 * Texto: `public/manual/ayuda.json` -> `pantallas[ruta].siguiente`, o el valor por defecto de core/guidance.ts.
 * Se oculta con "Ocultar ayudas".
 */
@Component({
  selector: 'app-next-step',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (step(); as s) {
      @if (!prefs.hidden()) {
        <p class="next"><span class="lbl">Siguiente paso:</span> <a [routerLink]="s.ruta">{{ s.texto }} <span aria-hidden="true">→</span></a></p>
      }
    }
  `,
  styles: `
    .next { margin: 0; font-size: 13px; color: var(--text-dim); }
    .next { padding: 10px 0 0; }
    .lbl { font-weight: 600; color: var(--text); margin-right: 6px; }
  `,
})
export class NextStep {
  protected readonly prefs = inject(HelpPrefs);
  private readonly guidance = inject(Guidance);
  private readonly info = inject(RouteInfo);

  protected readonly step = computed(() => {
    const { pattern, url } = this.info.state();
    const s = pattern ? this.guidance.nextStep(pattern) : null;
    return s && s.ruta !== url ? s : null;
  });

  constructor() { void this.guidance.load(); }
}
