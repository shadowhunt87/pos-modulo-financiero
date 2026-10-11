import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { RouteInfo } from '../../core/route-info';
import { HelpContent, HelpSection } from './help-content';
import { HelpMarkdown } from './help-markdown';

/**
 * Panel lateral del botón "?": muestra la sección del manual que explica la pantalla actual, sin salir de ella
 * (así no se pierde lo que se estaba escribiendo). Si se cambia de pantalla con el panel abierto, se actualiza solo.
 * Esc lo cierra. "Abrir el manual completo" va a /help en otra pestaña.
 */
@Component({
  selector: 'app-help-drawer',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HelpMarkdown],
  host: { '(document:keydown.escape)': 'closed.emit()' },
  template: `
    @if (open()) {
      <aside class="drawer" role="complementary" aria-label="Ayuda de esta pantalla">
        <header>
          <strong>Ayuda de esta pantalla</strong>
          <button #closeBtn type="button" class="btn btn-ghost btn-icon" aria-label="Cerrar la ayuda" (click)="closed.emit()">✕</button>
        </header>
        <div class="body">
          @if (!content.ready()) {
            <div class="loading"><span class="spinner"></span> Cargando…</div>
          } @else if (!target()) {
            <h2>Esta pantalla todavía no tiene una ayuda propia</h2>
            <p class="dim">Puedes buscar lo que necesites en el manual completo.</p>
          } @else if (state() === 'loading') {
            <div class="loading"><span class="spinner"></span> Cargando…</div>
          } @else if (state() === 'missing') {
            <h2>{{ target()!.section.titulo }}</h2>
            <p class="dim">Esta sección todavía no está escrita. La estamos preparando.</p>
          } @else {
            <app-help-markdown [source]="text()" [anchor]="target()!.anchor" (navigated)="closed.emit()" />
          }
        </div>
        <footer>
          <a class="btn btn-primary" [href]="fullLink()" target="_blank" rel="noopener">Abrir el manual completo</a>
        </footer>
      </aside>
    }
  `,
  styles: `
    :host { display: contents; }
    .drawer { position: fixed; top: 0; right: 0; bottom: 0; width: min(440px, 100vw); z-index: 40; display: flex; flex-direction: column; background: var(--surface); border-left: 1px solid var(--line-strong); box-shadow: var(--shadow-pop); }
    header { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    .body { flex: 1; overflow-y: auto; padding: 14px 16px; }
    .body h2 { font-size: 17px; margin: 0 0 8px; }
    footer { padding: 12px 16px; border-top: 1px solid var(--line); display: flex; }
    footer .btn { flex: 1; justify-content: center; }
  `,
})
export class HelpDrawer {
  protected readonly content = inject(HelpContent);
  private readonly info = inject(RouteInfo);

  readonly open = input(false);
  readonly closed = output<void>();

  private readonly closeBtn = viewChild<ElementRef<HTMLButtonElement>>('closeBtn');
  protected readonly text = signal('');
  protected readonly state = signal<'loading' | 'ok' | 'missing'>('loading');
  protected readonly target = computed(() => {
    if (!this.content.ready()) return null;
    return this.content.forScreen(this.info.state().pattern);
  });
  protected readonly fullLink = computed(() => {
    const t = this.target();
    return t ? '/help/' + t.section.slug + (t.anchor ? '#' + t.anchor : '') : '/help';
  });

  constructor() {
    effect(() => { if (this.open()) void this.content.load(); });
    effect(() => {
      const t = this.target();
      if (!this.open() || !t) return;
      const section: HelpSection = t.section;
      this.state.set('loading');
      void this.content.markdown(section).then((md) => {
        if (this.target()?.section !== section) return;
        this.text.set(md ?? '');
        this.state.set(md ? 'ok' : 'missing');
      });
    });
    // Al abrir, el foco pasa al botón de cerrar para que el teclado entre al panel.
    effect(() => { if (this.open()) this.closeBtn()?.nativeElement.focus(); });
  }
}
