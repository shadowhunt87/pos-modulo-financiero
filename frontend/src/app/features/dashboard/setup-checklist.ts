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
          <ul class="panel-pad list">
            @for (g of s.groups; track g.key) {
              <li><span aria-hidden="true">{{ g.done ? '✓' : '○' }}</span> @if (g.done) { <s>{{ g.title }}</s> } @else { <a [routerLink]="g.route">{{ g.title }}</a> <span class="hint">{{ g.reason }}</span> }</li>
            }
          </ul>
        </section>
      }
    }
  `,
  styles: `.list { list-style: none; margin: 0; display: flex; flex-direction: column; gap: 6px; } li { overflow-wrap: anywhere; } .hint { margin-left: 6px; }`,
})
export class SetupChecklist {
  protected readonly setup = inject(SetupState);
  protected readonly hidden = signal(readHidden());
  constructor() { void this.setup.load(); }
  protected hide(): void { this.hidden.set(true); try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* modo privado */ } }
}
