import { ChangeDetectionStrategy, Component, ElementRef, ViewEncapsulation, effect, inject, input, output, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import type { Tokens } from 'marked';
import { HelpContent } from './help-content';
import { slugify } from './help-slug';

export interface HelpHeading { id: string; text: string }

const escapeHtml = (s: string): string =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Muestra texto Markdown como HTML seguro. Tres capas de seguridad:
 *  1. marked NO deja pasar HTML crudo (se muestra como texto), los enlaces solo pueden ser http(s), mailto,
 *     rutas de la app o secciones del manual, y las imágenes solo archivos locales bajo manual/.
 *  2. Angular limpia el resultado en [innerHTML] (quita scripts, eventos y URL peligrosas).
 *  3. La CSP del servidor prohíbe scripts en línea y recursos de otros sitios.
 * `marked` se carga solo al abrir la Ayuda (import dinámico).
 */
@Component({
  selector: 'app-help-markdown',
  changeDetection: ChangeDetectionStrategy.OnPush,
  encapsulation: ViewEncapsulation.None,
  template: `<div class="manual-body" [innerHTML]="html()" (click)="onClick($event)"></div>`,
  styles: `
    .manual-body { line-height: 1.6; font-size: 15px; color: var(--text); overflow-wrap: anywhere; }
    .manual-body h1 { font-size: 24px; margin: 0 0 12px; }
    .manual-body h2 { font-size: 19px; margin: 28px 0 10px; padding-top: 6px; border-top: 1px solid var(--line); scroll-margin-top: 70px; }
    .manual-body h3 { font-size: 16px; margin: 20px 0 6px; scroll-margin-top: 70px; }
    .manual-body h1 + h2, .manual-body > h2:first-child { border-top: 0; margin-top: 8px; }
    .manual-body p, .manual-body ul, .manual-body ol, .manual-body blockquote, .manual-body table { margin: 0 0 12px; }
    .manual-body ul, .manual-body ol { padding-left: 22px; }
    .manual-body li { margin: 3px 0; }
    .manual-body a { color: var(--primary); text-decoration: underline; }
    .manual-body img { max-width: 100%; height: auto; border: 1px solid var(--line); border-radius: var(--radius); display: block; margin: 8px 0; }
    .manual-body blockquote { margin-left: 0; padding: 8px 14px; background: var(--info-soft); border-left: 3px solid var(--info); border-radius: var(--radius); }
    .manual-body blockquote p:last-child { margin-bottom: 0; }
    .manual-body code { font-family: var(--font-mono); font-size: 13px; background: var(--surface-2); border: 1px solid var(--line); border-radius: 4px; padding: 0 4px; }
    .manual-body pre { overflow-x: auto; background: var(--surface-2); border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; }
    .manual-body pre code { border: 0; background: none; padding: 0; }
    .manual-body table { display: block; overflow-x: auto; border-collapse: collapse; }
    .manual-body th, .manual-body td { border: 1px solid var(--line); padding: 6px 10px; text-align: left; }
    .manual-body th { background: var(--surface-2); }
    .manual-body hr { border: 0; border-top: 1px solid var(--line); margin: 20px 0; }
  `,
})
export class HelpMarkdown {
  private readonly content = inject(HelpContent);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly source = input<string>('');
  /** Ancla a la que bajar cuando termine de pintarse (sin el "#"). */
  readonly anchor = input<string | null>(null);
  /** Títulos de segundo nivel, para el índice "En esta sección". */
  readonly headings = output<HelpHeading[]>();
  /** Se dispara tras navegar por un enlace interno (el panel lateral lo usa para cerrarse). */
  readonly navigated = output<void>();

  protected readonly html = signal('');
  private marked: Promise<import('marked').Marked> | null = null;

  constructor() {
    effect(() => {
      const src = this.source();
      const anchor = this.anchor();
      void untracked(() => this.render(src, anchor));
    });
  }

  private parser(): Promise<import('marked').Marked> {
    this.marked ??= import('marked').then(({ Marked }) => new Marked({
      gfm: true,
      renderer: {
        // Sin HTML crudo: lo que el autor escriba entre < > se ve como texto, nunca se ejecuta ni se interpreta.
        html: ({ text }) => escapeHtml(text),
        // Enlace o imagen descartados por fixLink/fixImage (href vacío): se deja solo el texto.
        link(token) { return token.href ? false : this.parser.parseInline(token.tokens); },
        image(token) { return token.href ? false : escapeHtml(token.text); },
      },
      walkTokens: (t) => {
        if (t.type === 'link') this.fixLink(t as Tokens.Link);
        else if (t.type === 'image') this.fixImage(t as Tokens.Image);
      },
    }));
    return this.marked;
  }

  /** Enlaces: solo destinos conocidos y seguros. Cualquier otro (javascript:, data:, …) queda como texto sin enlace. */
  private fixLink(t: { href: string }): void {
    const href = t.href.trim();
    if (/^(https?:\/\/|mailto:)/i.test(href)) return;
    if (href.startsWith('#')) return;
    if (/^\/(?!\/)/.test(href)) return; // ruta de la app: /invoices/new, /help/clientes#crear
    const m = /^(?:\.\/)?([A-Za-z0-9][A-Za-z0-9._-]*\.md)(#.*)?$/.exec(href); // enlace a otro .md del manual
    if (m) {
      const sec = this.content.sectionByFile(m[1]);
      if (sec) { t.href = '/help/' + sec.slug + (m[2] ?? ''); return; }
    }
    t.href = '';
  }

  /** Imágenes: solo archivos del propio manual (img/…). Nada de internet ni data:. */
  private fixImage(t: { href: string }): void {
    const href = t.href.trim().replace(/^\.\//, '');
    t.href = /^(?:manual\/)?img\/[A-Za-z0-9._/-]+$/.test(href) && !href.includes('..')
      ? (href.startsWith('manual/') ? href : 'manual/' + href)
      : '';
  }

  private async render(src: string, anchor: string | null): Promise<void> {
    if (!src) { this.html.set(''); this.headings.emit([]); return; }
    const marked = await this.parser();
    this.html.set(await marked.parse(src));
    // Angular quita los atributos id al limpiar el HTML; los ponemos en el DOM ya limpio.
    queueMicrotask(() => setTimeout(() => this.decorate(anchor)));
  }

  private decorate(anchor: string | null): void {
    const root = this.host.nativeElement;
    const found: HelpHeading[] = [];
    const used = new Set<string>();
    root.querySelectorAll<HTMLElement>('h1, h2, h3, h4').forEach((h) => {
      const base = slugify(h.textContent ?? '') || 'seccion';
      let id = base, n = 2;
      while (used.has(id)) id = base + '-' + n++;
      used.add(id);
      h.id = id;
      if (h.tagName === 'H2') found.push({ id, text: h.textContent ?? '' });
    });
    root.querySelectorAll<HTMLAnchorElement>('a[href^="http"]').forEach((a) => { a.target = '_blank'; a.rel = 'noopener noreferrer'; });
    this.headings.emit(found);
    if (anchor) root.querySelector<HTMLElement>('#' + CSS.escape(anchor))?.scrollIntoView({ block: 'start' });
  }

  protected onClick(e: MouseEvent): void {
    const a = (e.target as HTMLElement).closest('a');
    if (!a || e.defaultPrevented || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const href = a.getAttribute('href') ?? '';
    if (href.startsWith('#')) {
      e.preventDefault();
      this.host.nativeElement.querySelector<HTMLElement>('#' + CSS.escape(href.slice(1)))?.scrollIntoView({ block: 'start' });
    } else if (href.startsWith('/')) {
      e.preventDefault();
      void this.router.navigateByUrl(href).then(() => this.navigated.emit());
    }
  }
}
