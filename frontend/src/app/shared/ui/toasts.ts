import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { Notify } from '../../core/notify';

@Component({
  selector: 'app-toasts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="toasts" aria-live="polite">
      @for (t of notify.toasts(); track t.id) {
        <div class="toast" [class]="t.kind" role="status">
          <span>{{ t.text }}</span>
          <button type="button" class="x" aria-label="Cerrar aviso" (click)="notify.dismiss(t.id)">✕</button>
        </div>
      }
    </div>
  `,
  styles: `
    .toasts { position: fixed; right: 16px; bottom: 16px; z-index: 2000; display: flex; flex-direction: column; gap: 8px; max-width: min(420px, calc(100vw - 32px)); }
    .toast { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; padding: 11px 14px; border-radius: var(--radius); background: var(--ink); color: var(--on-ink); box-shadow: var(--shadow-pop); border-left: 4px solid var(--on-ink-dim); animation: in .18s ease-out; }
    .toast.ok { border-left-color: #3fbf86; } .toast.error { border-left-color: #ee6a5e; } .toast.info { border-left-color: var(--marker); }
    .x { background: none; border: 0; color: var(--on-ink-dim); cursor: pointer; padding: 0 2px; }
    @keyframes in { from { transform: translateY(8px); opacity: 0; } }
  `,
})
export class Toasts { protected readonly notify = inject(Notify); }
