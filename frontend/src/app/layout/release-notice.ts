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
      <div class="notice info banner" role="status">
        <span><strong>Novedades de la {{ v }}</strong>: mira lo nuevo del sistema. <a routerLink="/help/novedades" (click)="seen()">Ver novedades</a></span>
        <button type="button" class="btn btn-ghost btn-sm" (click)="seen()">Cerrar</button>
      </div>
    }
  `,
  styles: `.banner { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px; }`,
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
