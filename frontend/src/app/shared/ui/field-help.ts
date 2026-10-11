import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Guidance } from '../../core/guidance';
import { HelpPrefs } from '../../core/help-prefs';

/**
 * "?" pequeño junto a la etiqueta de un campo difícil, con 1-3 frases (plan 9.2).
 *
 *   <label>Tipo de comprobante <app-field-help key="factura.tipoNcf" /></label>
 *   <label>Retención <app-field-help text="Impuesto que se descuenta al pagar." /></label>
 *
 * - `key`: texto en `public/manual/ayuda.json` -> `campos` (string o { texto, seccion, ancla } -> "Más en el manual").
 * - `text`: texto de respaldo si la clave no existe (o no se usa ayuda.json).
 * - Teclado: Tab llega al botón, Enter/Espacio abre, Esc cierra. Sin librerías.
 * - Se oculta con "Ocultar ayudas". Si no hay texto, no pinta nada.
 */
@Component({
  selector: 'app-field-help',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  host: { '(document:click)': 'onDocClick($event)', '(document:keydown.escape)': 'close()', '(window:scroll)': 'close()', '(window:resize)': 'close()' },
  template: `
    @if (content(); as c) {
      @if (!prefs.hidden()) {
        <button #btn type="button" class="q" aria-label="Ayuda sobre este campo" [attr.aria-expanded]="open()" (click)="toggle(btn)">?</button>
        @if (open()) {
          <span class="pop" role="note" [style.top.px]="top()" [style.left.px]="left()">
            {{ c.texto }}
            @if (c.seccion) { <a [routerLink]="['/help', c.seccion]" [fragment]="c.ancla" (click)="close()">Más en el manual</a> }
          </span>
        }
      }
    }
  `,
  styles: `
    :host { display: inline-block; vertical-align: middle; margin-left: 4px; }
    .q { width: 18px; height: 18px; padding: 0; border-radius: 50%; border: 1px solid var(--line-strong); background: var(--surface-2); color: var(--text-dim); font: 600 11px/1 var(--font-ui); cursor: help; }
    .q:hover, .q[aria-expanded="true"] { background: var(--primary-soft); color: var(--primary); border-color: var(--primary); }
    .pop { position: fixed; z-index: 60; width: min(280px, calc(100vw - 16px)); padding: 10px 12px; border-radius: var(--radius); background: var(--surface); color: var(--text); border: 1px solid var(--line-strong); box-shadow: var(--shadow-pop); font: 400 13px/1.45 var(--font-ui); display: flex; flex-direction: column; gap: 6px; text-align: left; white-space: normal; }
  `,
})
export class FieldHelp {
  protected readonly prefs = inject(HelpPrefs);
  private readonly guidance = inject(Guidance);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly key = input<string>('');
  readonly text = input<string>('');

  protected readonly open = signal(false);
  protected readonly top = signal(0);
  protected readonly left = signal(0);
  protected readonly content = computed(() => {
    const found = this.key() ? this.guidance.field(this.key()) : null;
    if (found) return found;
    return this.text() ? { texto: this.text() } : null;
  });

  constructor() { void this.guidance.load(); }

  protected toggle(btn: HTMLElement): void {
    if (this.open()) { this.close(); return; }
    const r = btn.getBoundingClientRect();
    const w = Math.min(280, window.innerWidth - 16);
    this.left.set(Math.max(8, Math.min(r.left - 8, window.innerWidth - w - 8)));
    this.top.set(r.bottom + 6);
    this.open.set(true);
  }
  protected close(): void { if (this.open()) this.open.set(false); }
  protected onDocClick(e: Event): void {
    if (this.open() && !this.host.nativeElement.contains(e.target as Node)) this.close();
  }
}
