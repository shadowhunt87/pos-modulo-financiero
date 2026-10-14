import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RATIO_LIGHT_LOOK } from '../../shared/labels';

/** Luz del semáforo: icono + color + texto («Bien», «Atención», «Riesgo», «Sin dato»). */
@Component({
  selector: 'app-analysis-light',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="look().tone"><span aria-hidden="true">{{ look().icon }}</span>&nbsp;{{ look().text }}</span>`,
})
export class AnalysisLight {
  readonly color = input<string>('NONE');
  protected readonly look = computed(() => RATIO_LIGHT_LOOK[this.color()] ?? RATIO_LIGHT_LOOK['NONE']);
}
