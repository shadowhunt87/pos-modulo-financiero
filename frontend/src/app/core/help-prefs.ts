import { Injectable, computed, inject, signal } from '@angular/core';
import { Auth } from './auth';

const PREFIX = 'fm.hideHelp.';

function read(userId: string): boolean {
  try { return localStorage.getItem(PREFIX + userId) === '1'; } catch { return false; }
}
function write(userId: string, hidden: boolean): void {
  try { hidden ? localStorage.setItem(PREFIX + userId, '1') : localStorage.removeItem(PREFIX + userId); } catch { /* modo privado */ }
}

/**
 * Interruptor "Ocultar ayudas" (plan 9.5). Se guarda en el navegador, por usuario (`fm.hideHelp.<id>`).
 * Oculta: la línea de "siguiente paso", los avisos previos y los "?" de campo.
 * NO oculta: el botón "?" de la pantalla, las migas ni las explicaciones de errores.
 */
@Injectable({ providedIn: 'root' })
export class HelpPrefs {
  private readonly auth = inject(Auth);
  private readonly cache = signal<Record<string, boolean>>({});

  /** True si el usuario actual pidió ocultar las ayudas. */
  readonly hidden = computed(() => {
    const id = this.auth.user()?.id;
    return id ? (this.cache()[id] ?? read(id)) : false;
  });

  toggle(): void {
    const id = this.auth.user()?.id;
    if (!id) return;
    const next = !this.hidden();
    write(id, next);
    this.cache.update((c) => ({ ...c, [id]: next }));
  }
}
