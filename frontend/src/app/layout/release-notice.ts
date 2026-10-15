import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Guidance } from '../core/guidance';

const KEY = 'fm.seenVersion';
const read = () => { try { return localStorage.getItem(KEY); } catch { return null; } };

/** Aviso «Hay novedades» una vez por versión (D4): la versión sale de public/manual/ayuda.json. */
@Component({
  selector: 'app-release-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (version(); as v) {
      <div class="card" role="status">
        <div class="top"><span class="tag">Nuevo</span><button type="button" class="x" aria-label="Cerrar aviso de novedades" (click)="seen()">✕</button></div>
        <p>Hay novedades en la <strong>{{ v }}</strong>.</p>
        <a routerLink="/help/novedades" (click)="seen()">Ver qué cambió →</a>
      </div>
    }
  `,
  styles: `
    .card { margin-bottom: 8px; padding: 10px 12px; border: 1px solid var(--side-line); border-radius: 10px; background: var(--side-hover); font-size: 12.5px; color: var(--on-side); }
    .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
    .tag { font-size: 11px; font-weight: 600; color: var(--primary-side); }
    .x { border: 0; background: none; color: var(--on-side-dim); cursor: pointer; font-size: 12px; padding: 2px 4px; border-radius: 4px; }
    .x:hover { color: var(--on-side-strong); }
    a { font-weight: 500; }
  `,
})
export class ReleaseNotice {
  private readonly guidance = inject(Guidance);
  protected readonly version = signal<string | null>(null);
  private current = '';

  constructor() {
    void this.guidance.load().then(() => {
      this.current = this.guidance.version();
      if (this.current && read() !== this.current) this.version.set(this.current.split(' ·')[0]);
    });
  }
  protected seen(): void {
    try { localStorage.setItem(KEY, this.current); } catch { /* modo privado */ }
    this.version.set(null);
  }
}
