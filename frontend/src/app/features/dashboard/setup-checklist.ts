import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { SetupState } from '../../core/setup-status';

const HIDE_KEY = 'fm.setupChecklistHidden';
const readHidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };

/** Tarjeta «Pendientes (n de 5)» del Panel (E2). Se oculta con «Ocultar» (preferencia del navegador). */
@Component({
  selector: 'app-setup-checklist',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink],
  template: `
    @if (!hidden() && setup.status(); as s) {
      @if (s.done < s.total) {
        <section class="panel section" aria-labelledby="sc-title">
          <div class="panel-head"><h2 id="sc-title">Pendientes ({{ s.done }} de {{ s.total }})</h2>
            <span><a routerLink="/setup">Configuración inicial</a> · <button type="button" class="linkbtn" (click)="hide()">Ocultar</button></span></div>
          <div class="bar" role="progressbar" [attr.aria-valuenow]="s.done" aria-valuemin="0" [attr.aria-valuemax]="s.total" aria-label="Avance de la configuración"><span [style.width.%]="(s.done / s.total) * 100"></span></div>
          <ul class="list">
            @for (g of s.groups; track g.key) {
              <li [class.done]="g.done"><span class="mark" aria-hidden="true">{{ g.done ? '✓' : '' }}</span>
                @if (g.done) { <s>{{ g.title }}</s> } @else { <span class="txt"><a [routerLink]="g.route">{{ g.title }}</a><span class="hint">{{ g.reason }}</span></span><a class="go" [routerLink]="g.route" tabindex="-1" aria-hidden="true">→</a> }</li>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: `
    .bar { height: 4px; background: var(--surface-2); } .bar span { display: block; height: 100%; background: var(--primary); border-radius: 0 4px 4px 0; transition: width .3s; }
    .list { list-style: none; margin: 0; padding: 6px 10px 10px; display: flex; flex-direction: column; }
    li { display: flex; align-items: center; gap: 12px; padding: 9px 12px; border-radius: 10px; overflow-wrap: anywhere; }
    li:not(.done):hover { background: var(--surface-2); }
    .mark { flex: none; width: 22px; height: 22px; border-radius: 50%; border: 1.5px dashed var(--line-strong); display: grid; place-items: center; font-size: 12px; font-weight: 800; }
    li.done .mark { border: 0; background: var(--pos-soft); color: var(--pos); }
    li.done s { color: var(--text-faint); }
    .txt { flex: 1; display: flex; flex-direction: column; min-width: 0; } .txt a { font-weight: 600; }
    .go { color: var(--text-faint); text-decoration: none; } li:hover .go { color: var(--primary); }
  `,
})
export class SetupChecklist {
  protected readonly setup = inject(SetupState);
  protected readonly hidden = signal(readHidden());
  constructor() { void this.setup.load(); }
  protected hide(): void { this.hidden.set(true); try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* modo privado */ } }
}
