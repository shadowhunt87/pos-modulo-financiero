import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { errorPairs } from '../../core/errors';
import { FIX_HINTS } from '../../core/error-text';
import { Guidance, GuideLink } from '../../core/guidance';

interface Item { text: string; fix: string | null; link: GuideLink | null }

/**
 * Error que explica y lleva a la solución (plan 9.6). Reemplaza al mensaje rojo suelto.
 *
 *   <app-error-notice [error]="error()" />                       // error = lo que atrapó el catch (o un texto)
 *   <app-error-notice [error]="error()" fixLabel="Crear cliente" fixLink="/partners" />   // enlace propio
 *
 * - Muestra cada mensaje ya traducido (core/errors.ts).
 * - "Cómo arreglarlo": primero lo que diga `public/manual/ayuda.json` -> `errores`
 *   (patron = expresión regular sobre el mensaje original (inglés) o el traducido), si no, las pistas de FIX_HINTS.
 * - Nunca se oculta con "Ocultar ayudas" (P7). Si `error` es null/vacío no pinta nada.
 */
@Component({
  selector: 'app-error-notice',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (items().length) {
      <div class="notice neg err" role="alert">
        <span class="ico" aria-hidden="true">!</span>
        <div class="body">
          <strong class="head">No se pudo guardar</strong>
          @for (it of items(); track $index) {
            <p class="msg">{{ it.text }}</p>
            @if (it.fix) { <p class="fix"><b>Cómo arreglarlo:</b> {{ it.fix }}</p> }
            @if (!fixLink() && it.link) { <a class="btn btn-sm" [routerLink]="it.link.ruta">{{ it.link.texto }}</a> }
          }
          @if (fixLink()) { <a class="btn btn-sm" [routerLink]="fixLink()">{{ fixLabel() || 'Ir a la solución' }}</a> }
        </div>
      </div>
    }
  `,
  styles: `
    .err { align-items: flex-start; }
    .ico { flex: none; width: 20px; height: 20px; border-radius: 50%; background: var(--neg); color: var(--surface); display: grid; place-items: center; font-weight: 700; font-size: 13px; margin-top: 1px; }
    .body { display: flex; flex-direction: column; gap: 6px; align-items: flex-start; min-width: 0; color: var(--text); }
    .head { color: var(--neg); }
    .msg { overflow-wrap: anywhere; }
    .fix { color: var(--text-dim); }
    .fix b { color: var(--text); font-weight: 600; }
  `,
})
export class ErrorNotice {
  private readonly guidance = inject(Guidance);

  /** Lo que atrapó el `catch` (HttpErrorResponse, Error o texto). */
  readonly error = input<unknown>(null);
  /** Enlace propio a la solución (si se omite se usa el de ayuda.json). */
  readonly fixLink = input<string | null>(null);
  readonly fixLabel = input<string>('');

  protected readonly items = computed<Item[]>(() => {
    const err = this.error();
    if (err === null || err === undefined || err === '') return [];
    const pairs = typeof err === 'string' ? [{ text: err, raw: err }] : errorPairs(err);
    const helps = this.guidance.errors();
    return pairs.map(({ text, raw }) => {
      const found = helps.find((h) => safeTest(h.patron, raw) || safeTest(h.patron, text));
      if (found) return { text, fix: found.explicacion, link: found.enlace ?? null };
      const hint = FIX_HINTS.find((h) => h.pattern.test(raw));
      return { text, fix: hint?.explanation ?? null, link: hint?.link ?? null };
    });
  });

  constructor() { void this.guidance.load(); }
}

function safeTest(pattern: string, text: string): boolean {
  try { return new RegExp(pattern, 'i').test(text); } catch { return false; }
}
