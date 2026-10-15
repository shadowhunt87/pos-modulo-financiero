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
        <section class="panel" aria-labelledby="sc-title">
          <div class="panel-head"><h2 id="sc-title">Termina de configurar</h2><button type="button" class="linkbtn dim-link" (click)="hide()">Ocultar</button></div>
          <div class="progress">
            <div class="bar" role="progressbar" [attr.aria-valuenow]="s.done" aria-valuemin="0" [attr.aria-valuemax]="s.total" aria-label="Avance de la configuración"><span [style.width.%]="(s.done / s.total) * 100"></span></div>
            <span class="count">{{ s.done }} de {{ s.total }} listos</span>
          </div>
          <ul class="list">
            @for (g of s.groups; track g.key) {
              @if (!g.done) {
                <li><span class="mark" aria-hidden="true"></span>
                  <span class="txt"><a [routerLink]="g.route">{{ g.title }}</a><span class="hint">{{ g.reason }}</span></span></li>
              }
            }
          </ul>
          <div class="foot"><a routerLink="/setup">Abrir la configuración inicial →</a></div>
        </section>
      }
    }
  `,
  styles: `
    .progress { display: flex; align-items: center; gap: 10px; padding: 14px 22px 4px; }
    .bar { flex: 1; height: 6px; background: var(--surface-2); border-radius: 3px; overflow: hidden; border: 1px solid var(--line); }
    .bar span { display: block; height: 100%; background: var(--primary); transition: width .3s; }
    .count { font-size: 12.5px; color: var(--text-dim); white-space: nowrap; }
    .list { list-style: none; margin: 0; padding: 8px 12px; display: flex; flex-direction: column; }
    li { display: flex; align-items: flex-start; gap: 12px; padding: 8px 10px; border-radius: 8px; overflow-wrap: anywhere; }
    li:hover { background: var(--surface-2); }
    .mark { flex: none; width: 16px; height: 16px; margin-top: 2px; border-radius: 50%; border: 1.5px solid var(--line-strong); }
    .txt { flex: 1; display: flex; flex-direction: column; min-width: 0; gap: 1px; } .txt a { font-weight: 500; }
    .foot { padding: 4px 22px 16px; font-size: 13px; }
    .dim-link { color: var(--text-faint); font-weight: 400; font-size: 13px; }
  `,
})
export class SetupChecklist {
  protected readonly setup = inject(SetupState);
  protected readonly hidden = signal(readHidden());
  constructor() { void this.setup.load(); }
  protected hide(): void { this.hidden.set(true); try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* modo privado */ } }
}
