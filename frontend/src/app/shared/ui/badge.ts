import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { label, tone } from '../labels';

/** Trazo del icono por tono: el estado no depende solo del color (bien, mal, atención, en curso, sin tono). */
const TONE_PATH: Record<string, string> = {
  pos: 'M3.5 8.5 6.5 11.5 12.5 4.5', neg: 'M4.5 4.5l7 7M11.5 4.5l-7 7', warn: 'M8 3.5v5.5M8 12v.5',
  info: 'M5.5 8a2.5 2.5 0 1 0 5 0a2.5 2.5 0 1 0 -5 0', '': 'M8 7.5v1',
};

/** Etiqueta de estado con icono + color + texto: <app-status [value]="inv.status" [map]="INVOICE_STATUS" /> */
@Component({
  selector: 'app-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="cls()"><svg viewBox="0 0 16 16" width="12" height="12" aria-hidden="true"><path [attr.d]="icon()" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>{{ text() }}</span>`,
})
export class StatusBadge {
  readonly value = input<string | null | undefined>('');
  readonly map = input<Record<string, string>>({});
  protected readonly text = computed(() => label(this.map(), this.value()));
  protected readonly cls = computed(() => tone(this.value()));
  protected readonly icon = computed(() => TONE_PATH[this.cls()] ?? TONE_PATH['']);
}
