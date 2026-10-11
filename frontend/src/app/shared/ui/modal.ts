import { ChangeDetectionStrategy, Component, ElementRef, effect, input, output, viewChild } from '@angular/core';

/** Diálogo modal sobre <dialog> nativo (foco atrapado y Esc incluidos). */
@Component({
  selector: 'app-modal',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dlg class="modal" [style.width]="width()" (cancel)="onCancel($event)" (click)="onBackdrop($event)">
      <div class="modal-box">
        <header class="modal-head">
          <h2>{{ title() }}</h2>
          <button type="button" class="btn btn-ghost btn-icon" aria-label="Cerrar" (click)="closed.emit()">✕</button>
        </header>
        <div class="modal-body"><ng-content /></div>
        <footer class="modal-foot"><ng-content select="[modal-actions]" /></footer>
      </div>
    </dialog>
  `,
  styles: `
    dialog.modal { border: 0; padding: 0; background: transparent; max-width: calc(100vw - 24px); max-height: calc(100vh - 24px); color: inherit; overflow: visible; }
    dialog.modal::backdrop { background: rgba(10, 22, 28, .55); }
    .modal-box { background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-pop); display: flex; flex-direction: column; max-height: calc(100vh - 24px); }
    .modal-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 18px; border-bottom: 1px solid var(--line); }
    .modal-body { padding: 18px; overflow: auto; }
    .modal-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 18px; border-top: 1px solid var(--line); }
    .modal-foot:empty { display: none; }
  `,
})
export class Modal {
  readonly open = input(false);
  readonly title = input('');
  readonly width = input('560px');
  readonly closed = output<void>();
  private readonly dlg = viewChild.required<ElementRef<HTMLDialogElement>>('dlg');

  constructor() {
    effect(() => {
      const el = this.dlg().nativeElement;
      if (this.open() && !el.open) el.showModal();
      else if (!this.open() && el.open) el.close();
    });
  }
  onCancel(e: Event): void { e.preventDefault(); this.closed.emit(); }
  onBackdrop(e: MouseEvent): void { if (e.target === this.dlg().nativeElement) this.closed.emit(); }
}
