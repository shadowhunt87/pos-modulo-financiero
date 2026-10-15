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
        <p class="next"><span class="lbl">Siguiente paso</span><a [routerLink]="s.ruta" [title]="s.texto">{{ s.texto }} <span aria-hidden="true">→</span></a></p>
      }
    }
  `,
  styles: `
    .next { margin: 0; display: flex; align-items: center; gap: 8px; font-size: 13px; min-width: 0; white-space: nowrap; }
    .lbl { font-size: 11.5px; font-weight: 500; color: var(--text-faint); padding: 2px 7px; border: 1px solid var(--line); border-radius: 999px; flex: none; }
    a { font-weight: 500; overflow: hidden; text-overflow: ellipsis; }
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
