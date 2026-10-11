import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HelpContent } from './help-content';
import { HelpHeading, HelpMarkdown } from './help-markdown';

/** Visor de una sección del manual (/help/:slug), con el índice "En esta sección" para saltar entre sus bloques. */
@Component({
  selector: 'app-help-page',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, HelpMarkdown],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>{{ section()?.titulo ?? 'Manual de usuario' }}</h1></div>
        <a class="btn" routerLink="/help">Volver al índice</a>
      </div>

      @if (!content.ready() || state() === 'loading') {
        <div class="loading"><span class="spinner"></span> Cargando…</div>
      } @else if (!section()) {
        <div class="panel empty"><h3>No encontramos esa sección</h3><p>Elige una del índice del manual.</p><a class="btn btn-primary" routerLink="/help">Ir al índice</a></div>
      } @else if (state() === 'missing') {
        <div class="panel empty"><h3>Esta sección todavía no está escrita</h3><p>La estamos preparando. Mientras tanto, mira las demás en el índice.</p><a class="btn btn-primary" routerLink="/help">Ir al índice</a></div>
      } @else {
        <div class="layout">
          @if (headings().length > 1) {
            <nav class="toc" aria-label="En esta sección">
              <strong>En esta sección</strong>
              <ul>@for (h of headings(); track h.id) { <li><a [routerLink]="[]" [fragment]="h.id">{{ h.text }}</a></li> }</ul>
            </nav>
          }
          <article class="panel panel-pad doc"><app-help-markdown [source]="text()" [anchor]="fragment()" (headings)="headings.set($event)" /></article>
        </div>
      }
    </div>
  `,
  styles: `
    .layout { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; align-items: start; }
    .toc { position: sticky; top: 70px; display: flex; flex-direction: column; gap: 6px; font-size: 14px; }
    .toc ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
    .toc a { color: var(--text-dim); } .toc a:hover { color: var(--primary); }
    .doc { max-width: 820px; }
    @media (max-width: 900px) { .layout { grid-template-columns: 1fr; } .toc { position: static; } }
  `,
})
export class HelpPage {
  protected readonly content = inject(HelpContent);
  private readonly route = inject(ActivatedRoute);

  /** :slug de la ruta (enlazado por withComponentInputBinding). */
  readonly slug = input<string>('');
  protected readonly fragment = toSignal(this.route.fragment, { initialValue: null });
  protected readonly section = computed(() => (this.content.ready() ? this.content.section(this.slug()) : null));
  protected readonly text = signal('');
  protected readonly state = signal<'loading' | 'ok' | 'missing'>('loading');
  protected readonly headings = signal<HelpHeading[]>([]);

  constructor() {
    void this.content.load();
    effect(() => {
      const s = this.section();
      if (!s) return;
      this.state.set('loading');
      void this.content.markdown(s).then((md) => {
        if (this.section() !== s) return;
        this.text.set(md ?? '');
        this.state.set(md ? 'ok' : 'missing');
      });
    });
  }
}
