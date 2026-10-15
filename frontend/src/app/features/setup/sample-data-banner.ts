import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SetupState } from '../../core/setup-status';

/** Franja «Estás viendo datos de ejemplo — Borrarlos» (E2), en todas las pantallas mientras existan. */
@Component({
  selector: 'app-sample-data-banner',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `@if (setup.samples()) { <div class="notice warn banner" role="status">Estás viendo <strong>datos de ejemplo</strong>. <a routerLink="/setup">Borrarlos</a> antes de empezar con tus datos reales.</div> }`,
  styles: `.banner { margin: 16px 28px 0; } @media (max-width: 900px) { .banner { margin: 12px 16px 0; } }`,
})
export class SampleDataBanner {
  protected readonly setup = inject(SetupState);
  constructor() { if (!this.setup.status()) void this.setup.load(); }
}
