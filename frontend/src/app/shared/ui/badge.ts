import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { label, tone } from '../labels';

/** Etiqueta de estado con color: <app-status [value]="inv.status" [map]="INVOICE_STATUS" /> */
@Component({
  selector: 'app-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="cls()">{{ text() }}</span>`,
})
export class StatusBadge {
  readonly value = input<string | null | undefined>('');
  readonly map = input<Record<string, string>>({});
  protected readonly text = computed(() => label(this.map(), this.value()));
  protected readonly cls = computed(() => tone(this.value()));
}
