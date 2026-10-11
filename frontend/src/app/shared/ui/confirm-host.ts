import { ChangeDetectionStrategy, Component, ElementRef, effect, inject, signal, viewChild } from '@angular/core';
import { Confirm } from '../../core/confirm';

@Component({
  selector: 'app-confirm-host',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg class="confirm" (cancel)="cancel($event)">
      @if (confirm.state(); as s) {
        <form (submit)="submit($event)">
          <h2>{{ s.title }}</h2>
          @if (s.message) { <p class="dim msg">{{ s.message }}</p> }
          @if (s.prompt; as p) {
            <div class="field" style="margin-top:12px">
              <label for="confirm-text">{{ p.label }}</label>
              <textarea id="confirm-text" class="textarea" rows="3" [placeholder]="p.placeholder ?? ''"
                [value]="text()" (input)="text.set($any($event.target).value)"></textarea>
            </div>
          }
          <div class="btn-row actions">
            <button type="button" class="btn" (click)="confirm.close(false)">Cancelar</button>
            <button type="submit" class="btn" [class.btn-danger]="s.danger" [class.btn-primary]="!s.danger"
              [disabled]="!!s.prompt?.required && !text().trim()">{{ s.confirmText ?? 'Confirmar' }}</button>
          </div>
        </form>
      }
    </dialog>
  `,
  styles: `
    dialog.confirm { border: 0; border-radius: var(--radius-lg); padding: 20px; width: min(440px, calc(100vw - 24px)); background: var(--surface); color: var(--text); box-shadow: var(--shadow-pop); }
    dialog.confirm::backdrop { background: rgba(10, 22, 28, .55); }
    .msg { margin-top: 8px; white-space: pre-line; } .actions { justify-content: flex-end; margin-top: 18px; }
  `,
})
export class ConfirmHost {
  protected readonly confirm = inject(Confirm);
  protected readonly text = signal('');
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      const open = !!this.confirm.state();
      if (open && !el.open) { this.text.set(''); el.showModal(); }
      else if (!open && el.open) el.close();
    });
  }
  cancel(e: Event): void { e.preventDefault(); this.confirm.close(false); }
  submit(e: Event): void { e.preventDefault(); this.confirm.close(true, this.text()); }
}
