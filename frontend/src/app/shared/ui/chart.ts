import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, input, viewChild } from '@angular/core';
import { Chart, ChartConfiguration, registerables } from 'chart.js';

Chart.register(...registerables);

/** Envoltorio mínimo de Chart.js: pásale la configuración y se redibuja cuando cambia. */
@Component({
  selector: 'app-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="wrap" [style.height]="height()"><canvas #cv></canvas></div>`,
  styles: `.wrap { position: relative; width: 100%; }`,
})
export class ChartView implements OnDestroy {
  readonly config = input.required<ChartConfiguration>();
  readonly height = input('260px');
  private readonly cv = viewChild.required<ElementRef<HTMLCanvasElement>>('cv');
  private chart: Chart | null = null;

  constructor() {
    effect(() => {
      const cfg = this.config();
      this.chart?.destroy();
      const style = getComputedStyle(document.documentElement);
      Chart.defaults.color = style.getPropertyValue('--text-dim').trim() || '#5a6c76';
      Chart.defaults.borderColor = style.getPropertyValue('--line').trim() || '#dde3e7';
      Chart.defaults.font.family = style.getPropertyValue('--font-ui').trim() || 'sans-serif';
      this.chart = new Chart(this.cv().nativeElement, { ...cfg, options: { responsive: true, maintainAspectRatio: false, ...(cfg.options ?? {}) } });
    });
  }
  ngOnDestroy(): void { this.chart?.destroy(); }
}
