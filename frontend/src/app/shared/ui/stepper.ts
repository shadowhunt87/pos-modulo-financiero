import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';

export interface Step { key: string; title: string; done: boolean; detail?: string; route?: string | null }

/** Pasos en fila con ✓ / número (P7: siempre texto, no solo color). En celular se apilan. */
@Component({
  selector: 'app-stepper',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <ol class="steps" [attr.aria-label]="label()">
      @for (s of steps(); track s.key; let i = $index) {
        <li [class.done]="s.done" [class.current]="s.key === current()" [attr.aria-current]="s.key === current() ? 'step' : null">
          <span class="dot" aria-hidden="true">{{ s.done ? '✓' : i + 1 }}</span>
          <span class="txt"><strong>{{ s.title }}</strong>@if (s.done) { <span class="sr-only"> (hecho)</span> }
            @if (s.detail) { <span class="hint">{{ s.detail }}</span> }
            @if (!s.done && s.route) { <a [routerLink]="s.route">Hacerlo →</a> }</span>
        </li>
      }
    </ol>
  `,
  styles: `
    .steps { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
    li { display: flex; gap: 8px; align-items: flex-start; min-width: 0; }
    .dot { flex: none; width: 24px; height: 24px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; border: 2px solid var(--line-strong); color: var(--text-dim); }
    li.done .dot { background: var(--pos); border-color: var(--pos); color: var(--surface); }
    li.current .dot { border-color: var(--primary); color: var(--primary); }
    .txt { display: flex; flex-direction: column; gap: 2px; font-size: 13px; overflow-wrap: anywhere; }
  `,
})
export class Stepper {
  readonly steps = input<Step[]>([]);
  readonly current = input<string | null>(null);
  readonly label = input('Pasos');
}
