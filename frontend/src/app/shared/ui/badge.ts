import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { label, tone } from '../labels';

/** Icono por tono: el estado no depende solo del color (✓ bien, ✕ mal, ! atención, i informa, • sin tono). */
const TONE_ICON: Record<string, string> = { pos: '✓', neg: '✕', warn: '!', info: 'i' };

/** Etiqueta de estado con icono + color + texto: <app-status [value]="inv.status" [map]="INVOICE_STATUS" /> */
@Component({
  selector: 'app-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="cls()"><span aria-hidden="true">{{ icon() }}</span>&nbsp;{{ text() }}</span>`,
})
export class StatusBadge {
  readonly value = input<string | null | undefined>('');
  readonly map = input<Record<string, string>>({});
  protected readonly text = computed(() => label(this.map(), this.value()));
  protected readonly cls = computed(() => tone(this.value()));
  protected readonly icon = computed(() => TONE_ICON[this.cls()] ?? '•');
}
