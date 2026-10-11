import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { HelpContent } from './help-content';

/** Índice del manual: todas las secciones, con un buscador por título. */
@Component({
  selector: 'app-help-index',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Manual de usuario</h1><p class="sub">Cada sección explica en pocas palabras, paso a paso y con el detalle contable. Elige la que necesites.</p></div>
      </div>

      <div class="toolbar">
        <div class="field wide"><label for="help-q">Buscar en el manual</label>
          <input id="help-q" class="input" type="search" placeholder="Por ejemplo: factura, cobro, cliente" (input)="q.set($any($event.target).value)" /></div>
      </div>

      @if (!content.ready()) {
        <div class="loading"><span class="spinner"></span> Cargando…</div>
      } @else if (!content.sections().length) {
        <div class="panel empty"><h3>El manual todavía no está disponible</h3><p>Vuelve a intentarlo en unos minutos. Si sigue igual, avisa a quien administra el sistema.</p></div>
      } @else if (!shown().length) {
        <div class="panel empty"><h3>No encontramos ninguna sección con “{{ q() }}”</h3><p>Prueba con otra palabra, por ejemplo “factura” o “cobro”.</p></div>
      } @else {
        <ol class="list">
          @for (s of shown(); track s.slug; let i = $index) {
            <li><a class="card" [routerLink]="['/help', s.slug]">
              <span class="n" aria-hidden="true">{{ i + 1 }}</span>
              <span class="t"><strong>{{ s.titulo }}</strong>@if (s.resumen) { <small>{{ s.resumen }}</small> }</span>
              <span class="go" aria-hidden="true">→</span>
            </a></li>
          }
        </ol>
      }
    </div>
  `,
  styles: `
    .list { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
    .card { display: flex; align-items: center; gap: 14px; padding: 14px 16px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius-lg); color: var(--text); text-decoration: none; }
    .card:hover { border-color: var(--primary); background: var(--surface-2); }
    .n { flex: none; width: 28px; height: 28px; border-radius: 50%; background: var(--primary-soft); color: var(--primary); display: grid; place-items: center; font-weight: 600; font-size: 13px; }
    .t { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
    .t small { color: var(--text-dim); font-size: 13px; }
    .go { color: var(--text-faint); }
  `,
})
export class HelpIndex {
  protected readonly content = inject(HelpContent);
  protected readonly q = signal('');
  protected readonly shown = computed(() => {
    const t = fold(this.q().trim());
    const all = this.content.sections();
    return t ? all.filter((s) => fold(s.titulo + ' ' + (s.resumen ?? '')).includes(t)) : all;
  });

  constructor() { void this.content.load(); }
}

/** Compara sin importar mayúsculas ni tildes. */
function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
