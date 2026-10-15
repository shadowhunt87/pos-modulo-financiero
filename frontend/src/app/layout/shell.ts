import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterOutlet } from '@angular/router';
import { filter, debounceTime } from 'rxjs';
import { Api } from '../core/api';
import { Auth } from '../core/auth';
import { Lookups } from '../core/lookups';
import { Company } from '../core/models';
import { ROLE } from '../shared/labels';
import { money, today, yearStart } from '../shared/format';
import { FeedbackLauncher } from '../core/feedback-launcher';
import { HelpPrefs } from '../core/help-prefs';
import { Breadcrumbs, NextStep } from '../shared/ui';
import { FeedbackDialog } from '../features/feedback/feedback-dialog';
import { HelpDrawer } from '../features/help/help-drawer';
import { NAV } from './nav';
import { NavIcon } from './nav-icon';
import { RouteInfo } from '../core/route-info';
import { SampleDataBanner } from '../features/setup/sample-data-banner';
import { ReleaseNotice } from './release-notice';

interface Ledger { totalDebit: string; totalCredit: string }

@Component({
  selector: 'app-shell',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterOutlet, RouterLink, NavIcon, Breadcrumbs, NextStep, HelpDrawer, FeedbackDialog, SampleDataBanner, ReleaseNotice],
  templateUrl: './shell.html',
  styleUrl: './shell.css',
})
export class Shell {
  protected readonly auth = inject(Auth);
  private readonly api = inject(Api);
  private readonly router = inject(Router);
  private readonly lookups = inject(Lookups);
  protected readonly helpPrefs = inject(HelpPrefs);
  protected readonly feedback = inject(FeedbackLauncher);
  private readonly destroyRef = inject(DestroyRef);
  private readonly routeInfo = inject(RouteInfo);

  protected readonly ROLE = ROLE;
  protected readonly menuOpen = signal(false);
  protected readonly userMenu = signal(false);
  /** Panel lateral del botón "?" (ayuda de la pantalla actual). */
  protected readonly helpOpen = signal(false);
  protected readonly company = signal<Company | null>(null);
  protected readonly dark = signal(document.documentElement.dataset['theme'] === 'dark');
  /** Diferencia débitos − créditos del año en curso; null mientras carga. */
  protected readonly gap = signal<string | null>(null);
  protected readonly balanced = computed(() => this.gap() !== null && Number(this.gap()) === 0);
  protected readonly gapText = computed(() => money(this.gap()));

  protected readonly nav = computed(() =>
    NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.roles || this.auth.has(...i.roles)) })).filter((g) => g.items.length),
  );

  /** Opción del menú de la pantalla actual: la ruta más larga que coincide (así /dgii/review no marca también /dgii). */
  protected readonly activePath = computed(() => {
    const url = this.routeInfo.state().url;
    let best: string | null = null;
    for (const g of this.nav()) for (const i of g.items) {
      const hit = i.path === '/' ? url === '/' : url === i.path || url.startsWith(i.path + '/');
      if (hit && (!best || i.path.length > best.length)) best = i.path;
    }
    return best;
  });
  /** Sección de la pantalla actual. */
  protected readonly currentGroup = computed(() => this.nav().find((g) => g.items.some((i) => i.path === this.activePath()))?.title ?? null);
  /** Sección abierta del acordeón (una a la vez). Al cambiar de pantalla se abre la sección de esa pantalla. */
  protected readonly openGroup = signal<string | null>(null);

  constructor() {
    effect(() => { const g = this.currentGroup(); if (g) untracked(() => this.openGroup.set(g)); });
    void this.api.getP<Company>('/company').then((c) => this.company.set(c)).catch(() => undefined);
    void this.lookups.ensureAll().catch(() => undefined);
    void this.checkBooks();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), debounceTime(600), takeUntilDestroyed(this.destroyRef))
      .subscribe(() => { this.menuOpen.set(false); this.userMenu.set(false); void this.checkBooks(); });
  }

  /** Indicador de integridad: ¿los libros del año están cuadrados? */
  private async checkBooks(): Promise<void> {
    try {
      const gl = await this.api.getP<Ledger>('/reports/general-ledger', { from: yearStart(), to: today() });
      this.gap.set((Number(gl.totalDebit) - Number(gl.totalCredit)).toFixed(2));
    } catch { /* si falla, no mostramos nada */ }
  }

  protected toggleTheme(): void {
    const next = this.dark() ? 'light' : 'dark';
    document.documentElement.dataset['theme'] = next;
    try { localStorage.setItem('fm.theme', next); } catch { /* ignore */ }
    this.dark.set(next === 'dark');
  }
  protected toggleGroup(title: string): void { this.openGroup.update((g) => (g === title ? null : title)); }
  protected logout(): void { this.lookups.reset(); this.auth.logout(); }
}
