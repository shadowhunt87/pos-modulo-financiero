import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { RouteInfo } from '../../core/route-info';
import { NAV } from '../../layout/nav';

interface Crumb { label: string; link: string | null }

/**
 * Migas de pan automáticas: grupo del menú › opción › título de la ruta. Se montan una vez en el shell;
 * las pantallas no pasan nada. Para que salga bien, la ruta debe tener `title` y estar en layout/nav.ts.
 */
@Component({
  selector: 'app-breadcrumbs',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (crumbs().length) {
      <nav class="crumbs" aria-label="Dónde estás">
        <ol>
          @for (c of crumbs(); track $index; let last = $last) {
            <li [attr.aria-current]="last ? 'page' : null">
              @if (c.link) { <a [routerLink]="c.link">{{ c.label }}</a> } @else { <span>{{ c.label }}</span> }
            </li>
          }
        </ol>
      </nav>
    }
  `,
  styles: `
    ol { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; align-items: center; gap: 2px 0; font-size: 13px; color: var(--text-dim); }
    li { display: inline-flex; align-items: center; min-width: 0; }
    li + li::before { content: '›'; margin: 0 7px; color: var(--text-faint); }
    li[aria-current] { color: var(--text); font-weight: 600; }
    a { color: var(--text-dim); } a:hover { color: var(--primary); }
    span, a { overflow-wrap: anywhere; }
  `,
})
export class Breadcrumbs {
  private readonly info = inject(RouteInfo);

  protected readonly crumbs = computed<Crumb[]>(() => {
    const { url, title } = this.info.state();
    let best: { group: string; label: string; path: string } | null = null;
    for (const g of NAV) for (const i of g.items) {
      const match = i.path === '/' ? url === '/' : url === i.path || url.startsWith(i.path + '/');
      if (match && (!best || i.path.length > best.path.length)) best = { group: g.title, label: i.label, path: i.path };
    }
    if (!best) return title ? [{ label: title, link: null }] : [];
    const out: Crumb[] = [];
    if (best.group) out.push({ label: best.group, link: null });
    const exact = url === best.path;
    out.push({ label: best.label, link: exact ? null : best.path });
    if (!exact && title && title !== best.label) out.push({ label: title, link: null });
    return out;
  });
}
