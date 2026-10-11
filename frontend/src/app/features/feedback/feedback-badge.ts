import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FEEDBACK_STATUS, FEEDBACK_STATUS_LOOK } from '../../shared/labels';

/** Estado de un comentario: icono + color + texto (no depende solo del color). */
@Component({
  selector: 'app-feedback-status',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="look().tone"><span aria-hidden="true">{{ look().icon }}</span>&nbsp;{{ text() }}</span>`,
})
export class FeedbackStatusBadge {
  readonly value = input('');
  protected readonly text = computed(() => FEEDBACK_STATUS[this.value()] ?? this.value());
  protected readonly look = computed(() => FEEDBACK_STATUS_LOOK[this.value()] ?? { icon: '•', tone: '' });
}
