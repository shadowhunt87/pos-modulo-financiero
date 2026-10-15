import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NAV_ICONS } from './nav';

/** Icono de línea del menú y la barra superior (decorativo: el texto del botón o enlace lo nombra). */
@Component({
  selector: 'app-nav-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg viewBox="0 0 24 24" [attr.width]="size()" [attr.height]="size()" aria-hidden="true" focusable="false"
    fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><path [attr.d]="d()" /></svg>`,
  styles: `:host { display: inline-flex; flex: none; }`,
})
export class NavIcon {
  readonly name = input.required<keyof typeof NAV_ICONS>();
  readonly size = input(18);
  protected readonly d = computed(() => NAV_ICONS[this.name()]);
}
