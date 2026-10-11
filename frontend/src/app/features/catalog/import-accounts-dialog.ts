import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Notify } from '../../core/notify';
import { ACCOUNT_TYPE, IMPORT_ACTION_LOOK, label } from '../../shared/labels';
import { ErrorNotice, FieldHelp, Modal } from '../../shared/ui';
import {
  fileProblem, ImportAction, ImportPreview, ImportRow, ImportSummary, resultText, sortRows, summaryOf,
} from './import-accounts-logic';

type Source = 'rd' | 'file';
const FILTERS: ImportAction[] = ['error', 'create', 'update', 'skip', 'unchanged'];

/**
 * Asistente de 3 pasos para llenar el plan de cuentas: 1 Elegir (estándar RD o Excel/CSV propio),
 * 2 Revisar (vista previa, no guarda nada) y 3 Confirmar (aplica todo o nada).
 * Uso: <app-import-accounts-dialog [open]="x()" [source]="'rd'" [hasAccounts]="n>0" (closed)="x.set(false)" (imported)="recargar()" />
 */
@Component({
  selector: 'app-import-accounts-dialog',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [Modal, FieldHelp, ErrorNotice, RouterLink],
  template: `
    <app-modal [open]="open()" title="Cargar o importar plan de cuentas" width="860px" (closed)="close()">
      <ol class="steps" aria-label="Pasos">
        @for (s of stepNames; track s; let i = $index) {
          <li [class.on]="step() === i + 1" [class.done]="step() > i + 1" [attr.aria-current]="step() === i + 1 ? 'step' : null">
            <span class="n" aria-hidden="true">{{ step() > i + 1 ? '✓' : i + 1 }}</span><span class="t">{{ s }}</span>
          </li>
        }
      </ol>

      @if (step() === 1) {
        <p>Puedes usar el catálogo estándar de República Dominicana o tu propio Excel con estas columnas: código, nombre, tipo y cuenta padre.
          <app-field-help text="El catálogo estándar trae unas 190 cuentas listas para usar (activos, pasivos, patrimonio, ingresos y gastos). Si usas tu Excel, descarga la plantilla: trae las columnas y las instrucciones. Antes de guardar verás una vista previa y no se cambia nada hasta que confirmes." /></p>
        @if (hasAccounts()) {
          <div class="notice info gap"><span aria-hidden="true">i</span><span>Tu plan ya tiene cuentas. Aquí solo se agregan cuentas nuevas y se actualizan nombres. <strong>Nunca se borra nada.</strong></span></div>
        }
        <div class="choices" role="radiogroup" aria-label="Origen de las cuentas">
          <button type="button" class="choice" role="radio" [attr.aria-checked]="src() === 'rd'" [class.sel]="src() === 'rd'" (click)="pick('rd')">
            <strong>Catálogo estándar de RD</strong>
            <span class="sub">Unas 190 cuentas ya clasificadas. La opción más rápida.</span>
          </button>
          <button type="button" class="choice" role="radio" [attr.aria-checked]="src() === 'file'" [class.sel]="src() === 'file'" (click)="pick('file')">
            <strong>Mi propio archivo</strong>
            <span class="sub">Excel (.xlsx) o CSV, máximo 2 MB.</span>
          </button>
        </div>
        @if (src() === 'file') {
          <div class="field gap">
            <label for="imp-file">Archivo</label>
            <input id="imp-file" class="input" type="file" accept=".xlsx,.csv" (change)="onFile($event)" />
            @if (file(); as f) { <span class="hint">Elegido: {{ f.name }}</span> }
          </div>
        }
        <p class="sub gap"><button type="button" class="link" [disabled]="busy()" (click)="template()">Descargar plantilla de Excel</button> (con las columnas y las instrucciones)</p>
        @if (error()) { <app-error-notice style="display:block;margin-top:14px" [error]="error()" /> }
      }

      @if (step() === 2 && preview(); as p) {
        <div class="cards">
          @for (k of filters; track k) {
            <div class="card" [class]="'card ' + look[k].tone">
              <span class="num">{{ count(k) }}</span><span class="lab"><span aria-hidden="true">{{ look[k].icon }}</span> {{ look[k].plural }}</span>
            </div>
          }
        </div>
        @if (summary().errores > 0) {
          <div class="notice neg gap" role="alert"><span aria-hidden="true">!</span><span>El archivo tiene {{ summary().errores }} {{ summary().errores === 1 ? 'error' : 'errores' }}. No se puede importar hasta corregirlos: arréglalos en tu Excel (están primero en la lista) y vuelve a subirlo. No se guardó nada.</span></div>
        } @else if (summary().crear + summary().actualizar === 0) {
          <div class="notice gap"><span aria-hidden="true">i</span><span>No hay nada nuevo que importar: todas las cuentas ya existen igual.</span></div>
        }
        <div class="chips gap" role="group" aria-label="Filtrar por acción">
          <button type="button" class="chip" [class.on]="filter() === ''" [attr.aria-pressed]="filter() === ''" (click)="filter.set('')">Todas ({{ p.filas.length }})</button>
          @for (k of filters; track k) {
            @if (count(k) > 0) { <button type="button" class="chip" [class.on]="filter() === k" [attr.aria-pressed]="filter() === k" (click)="filter.set(k)">{{ look[k].text }} ({{ count(k) }})</button> }
          }
        </div>
        <div class="table-wrap tall">
          <table class="table">
            <thead><tr><th>Fila</th><th>Acción</th><th>Código</th><th>Nombre</th><th>Tipo</th><th>Padre</th></tr></thead>
            <tbody>
              @for (r of rows(); track r.fila) {
                <tr>
                  <td class="mono">{{ r.fila }}</td>
                  <td><span class="badge" [class]="'badge ' + look[r.accion].tone"><span aria-hidden="true">{{ look[r.accion].icon }}</span>&nbsp;{{ look[r.accion].text }}</span></td>
                  <td class="mono">{{ r.codigo }}</td>
                  <td>{{ r.nombre }}
                    @for (m of r.mensajes; track $index) { <div class="msg" [class.bad]="r.accion === 'error'">{{ m }}</div> }
                  </td>
                  <td>{{ tipo(r) }}</td>
                  <td class="mono">{{ r.padre }}</td>
                </tr>
              } @empty { <tr><td colspan="6" class="table-empty">No hay filas con ese filtro.</td></tr> }
            </tbody>
          </table>
        </div>
        @if (error()) { <app-error-notice style="display:block;margin-top:14px" [error]="error()" /> }
      }

      @if (step() === 3) {
        <div class="done-box">
          <span class="big" aria-hidden="true">✓</span>
          <h3>{{ doneText() }}</h3>
          <p class="sub">Tu plan de cuentas ya está actualizado.</p>
          <a class="btn btn-primary" routerLink="/account-classification" (click)="close()">Revisa la clasificación de cuentas para reportes →</a>
          <p class="hint">Así tus reportes y estados financieros saben dónde poner cada cuenta.</p>
        </div>
      }

      <ng-container modal-actions>
        @if (step() === 1) {
          <button type="button" class="btn" (click)="close()">Cancelar</button>
          <button type="button" class="btn btn-primary" [disabled]="busy() || !canReview()" (click)="review()">{{ busy() ? 'Revisando…' : 'Ver vista previa' }}</button>
        }
        @if (step() === 2) {
          <button type="button" class="btn" [disabled]="busy()" (click)="back()">Atrás</button>
          <button type="button" class="btn btn-primary" [disabled]="busy() || !canApply()" (click)="apply()">{{ busy() ? 'Importando…' : 'Importar' }}</button>
        }
        @if (step() === 3) { <button type="button" class="btn" (click)="close()">Cerrar</button> }
      </ng-container>
    </app-modal>
  `,
  styles: `
    .steps { list-style: none; display: flex; gap: 8px; margin: 0 0 16px; padding: 0; flex-wrap: wrap; }
    .steps li { display: flex; align-items: center; gap: 6px; color: var(--text-faint); font-size: 13px; }
    .steps li + li::before { content: ''; width: 20px; height: 1px; background: var(--line-strong); margin-right: 2px; }
    .steps .n { width: 22px; height: 22px; border-radius: 50%; display: grid; place-items: center; font-size: 12px; font-weight: 700; border: 1px solid var(--line-strong); }
    .steps li.on { color: var(--text); font-weight: 600; }
    .steps li.on .n { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
    .steps li.done { color: var(--pos); }
    .steps li.done .n { background: var(--pos-soft); border-color: transparent; }
    .gap { margin-top: 14px; }
    .choices { display: grid; gap: 10px; grid-template-columns: 1fr 1fr; margin-top: 14px; }
    @media (max-width: 560px) { .choices { grid-template-columns: 1fr; } }
    .choice { text-align: left; display: flex; flex-direction: column; gap: 4px; padding: 14px; border-radius: var(--radius-lg); border: 1px solid var(--line-strong); background: var(--surface); color: var(--text); font: inherit; cursor: pointer; }
    .choice:hover { border-color: var(--text-faint); }
    .choice.sel { border-color: var(--primary); outline: 2px solid var(--primary); outline-offset: -2px; background: var(--primary-soft); }
    .link { background: none; border: 0; padding: 0; color: var(--primary); font: inherit; text-decoration: underline; cursor: pointer; }
    .link:disabled { opacity: .5; cursor: not-allowed; }
    .cards { display: grid; gap: 8px; grid-template-columns: repeat(auto-fit, minmax(120px, 1fr)); }
    .card { border: 1px solid var(--line); border-radius: var(--radius); padding: 10px 12px; background: var(--surface-2); display: flex; flex-direction: column; }
    .card.pos { background: var(--pos-soft); color: var(--pos); border-color: transparent; }
    .card.neg { background: var(--neg-soft); color: var(--neg); border-color: transparent; }
    .card.warn { background: var(--warn-soft); color: var(--warn); border-color: transparent; }
    .card.info { background: var(--info-soft); color: var(--info); border-color: transparent; }
    .card .num { font-size: 22px; font-weight: 700; }
    .card .lab { font-size: 12px; font-weight: 600; }
    .chips { display: flex; gap: 6px; flex-wrap: wrap; }
    .chip { height: 28px; padding: 0 10px; border-radius: 14px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--text); font: inherit; font-size: 13px; cursor: pointer; }
    .chip.on { background: var(--primary); border-color: var(--primary); color: var(--on-primary); }
    .tall { max-height: 320px; overflow: auto; margin-top: 10px; }
    .msg { font-size: 12px; color: var(--text-dim); overflow-wrap: anywhere; }
    .msg.bad { color: var(--neg); font-weight: 500; }
    .done-box { display: flex; flex-direction: column; align-items: center; gap: 10px; text-align: center; padding: 12px 0; }
    .done-box .big { width: 48px; height: 48px; border-radius: 50%; display: grid; place-items: center; font-size: 26px; background: var(--pos-soft); color: var(--pos); }
  `,
})
export class ImportAccountsDialog {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  readonly open = input(false);
  /** Opción marcada al abrir: 'rd' (estándar) o 'file' (su propio archivo). */
  readonly source = input<Source>('rd');
  readonly hasAccounts = input(false);
  readonly closed = output<void>();
  /** Se emitió después de importar bien: la lista debe recargarse. */
  readonly imported = output<void>();

  protected readonly stepNames = ['Elegir', 'Revisar', 'Confirmar'];
  protected readonly filters = FILTERS;
  protected readonly look = IMPORT_ACTION_LOOK;
  protected readonly step = signal<1 | 2 | 3>(1);
  protected readonly src = signal<Source>('rd');
  protected readonly file = signal<File | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<unknown>('');
  protected readonly preview = signal<ImportPreview | null>(null);
  protected readonly filter = signal<ImportAction | ''>('');
  protected readonly doneText = signal('');

  protected readonly summary = computed<ImportSummary>(() => this.preview()?.resumen ?? { crear: 0, actualizar: 0, sinCambios: 0, omitidas: 0, errores: 0 });
  protected readonly rows = computed<ImportRow[]>(() => sortRows([...(this.preview()?.filas ?? [])], this.filter()));
  protected readonly canReview = computed(() => this.src() === 'rd' || !!this.file());
  protected readonly canApply = computed(() => { const s = this.summary(); return s.errores === 0 && s.crear + s.actualizar > 0; });

  constructor() {
    effect(() => {
      if (!this.open()) return;
      const s = this.source();
      untracked(() => {
        this.step.set(1); this.src.set(s); this.file.set(null); this.preview.set(null);
        this.filter.set(''); this.error.set(''); this.busy.set(false);
      });
    });
  }

  protected count(k: ImportAction): number {
    const s = this.summary();
    return { error: s.errores, create: s.crear, update: s.actualizar, skip: s.omitidas, unchanged: s.sinCambios }[k];
  }
  protected tipo(r: ImportRow): string { return label(ACCOUNT_TYPE, r.tipo); }

  protected pick(s: Source): void { this.src.set(s); this.error.set(''); }
  protected onFile(e: Event): void {
    const f = (e.target as HTMLInputElement).files?.[0] ?? null;
    const problem = f ? fileProblem(f) : '';
    this.error.set(problem);
    this.file.set(f && !problem ? f : null);
  }

  protected async template(): Promise<void> {
    try { await this.api.download('/chart-of-accounts/template', undefined, 'plantilla-plan-de-cuentas.xlsx'); }
    catch (e) { this.error.set(e); }
  }

  protected async review(): Promise<void> {
    if (this.busy() || !this.canReview()) return;
    this.busy.set(true); this.error.set('');
    try {
      const f = this.file();
      const p = this.src() === 'rd'
        ? await this.api.getP<ImportPreview>('/chart-of-accounts/standard/rd/preview')
        : await firstValueFrom(this.api.upload<ImportPreview>('/chart-of-accounts/import/preview', f as File));
      this.preview.set(p); this.filter.set(''); this.step.set(2);
    } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }

  protected back(): void { this.step.set(1); this.error.set(''); }

  protected async apply(): Promise<void> {
    if (this.busy() || !this.canApply()) return;
    this.busy.set(true); this.error.set('');
    try {
      const res = this.src() === 'rd'
        ? await firstValueFrom(this.api.post<ImportSummary | { resumen: ImportSummary }>('/chart-of-accounts/standard/rd'))
        : await firstValueFrom(this.api.upload<ImportSummary | { resumen: ImportSummary }>('/chart-of-accounts/import', this.file() as File));
      const text = resultText(summaryOf(res));
      this.doneText.set(text); this.notify.ok(text);
      this.step.set(3); this.imported.emit();
    } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }

  protected close(): void { if (!this.busy()) this.closed.emit(); }
}
