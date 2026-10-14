import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Notify } from '../../core/notify';
import { AUDIT_AREA, ENGAGEMENT_STATUS } from '../../shared/labels';
import { UI } from '../../shared/ui';
import type { AccountNotice, Engagement } from './auditing-types';

/** Encargos de auditoría (PLAN-v0.2 §5, A3). Los ven ADMIN y AUDITOR; crean ambos; el resto lo trabaja la auditora. */
@Component({
  selector: 'app-engagements',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Auditoría</h1><p class="sub">Encargos de revisión: papeles de trabajo, partidas revisadas, hallazgos e informe.</p></div>
        <button type="button" class="btn btn-primary" (click)="open.set(true)">Nuevo encargo</button>
      </div>
      @for (n of notices(); track n.at) { <div class="notice neg" role="alert"><strong>Aviso de la cuenta auditora:</strong> {{ n.message }}</div> }
      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Encargo</th><th>Período</th><th>Firma</th><th>Estado</th><th>Hallazgos</th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="5"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (e of rows(); track e.id) {
                <tr>
                  <td><a [routerLink]="['/auditing', e.id]"><strong>{{ e.name }}</strong></a></td>
                  <td class="nowrap">{{ e.periodStart | fdate }} – {{ e.periodEnd | fdate }}</td>
                  <td>{{ e.auditorFirm || '—' }}</td>
                  <td><app-status [value]="e.status" [map]="ENGAGEMENT_STATUS" /></td>
                  <td>{{ total(e) }}</td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="5"><app-empty-state title="Todavía no hay encargos" text="Un encargo es la revisión de un período: se crean sus papeles de trabajo con procedimientos sugeridos." actionLabel="Nuevo encargo" (action)="open.set(true)" /></td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="open()" title="Nuevo encargo de auditoría" width="620px" (closed)="open.set(false)">
      <div class="form-grid">
        <div class="field span-2"><label for="e-name">Nombre</label><input id="e-name" class="input" maxlength="120" [value]="name()" (input)="name.set($any($event.target).value)" placeholder="Revisión anual 2026" /></div>
        <div class="field"><label for="e-from">Período: desde</label><input id="e-from" class="input" type="date" [value]="from()" (input)="from.set($any($event.target).value)" /></div>
        <div class="field"><label for="e-to">Hasta</label><input id="e-to" class="input" type="date" [value]="to()" (input)="to.set($any($event.target).value)" /></div>
        <div class="field span-2"><label for="e-firm">Firma auditora (opcional)</label><input id="e-firm" class="input" maxlength="200" [value]="firm()" (input)="firm.set($any($event.target).value)" /></div>
        <fieldset class="field span-all"><legend class="label">Áreas a revisar (se precargan con procedimientos sugeridos)</legend>
          <div class="areas">@for (a of AREAS; track a[0]) { <label class="check"><input type="checkbox" [checked]="areas().includes(a[0])" (change)="toggle(a[0], $any($event.target).checked)" /> {{ a[1] }}</label> }</div>
        </fieldset>
      </div>
      <app-error-notice [error]="formError()" />
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="open.set(false)">Cancelar</button>
        <button type="button" class="btn btn-primary" [disabled]="busy() || !name() || !from() || !to() || !areas().length" (click)="create()">{{ busy() ? 'Creando…' : 'Crear encargo' }}</button>
      </ng-container>
    </app-modal>
  `,
  styles: `.areas { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 6px 14px; }`,
})
export class Engagements {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  protected readonly auth = inject(Auth);
  protected readonly ENGAGEMENT_STATUS = ENGAGEMENT_STATUS;
  protected readonly AREAS = Object.entries(AUDIT_AREA);
  protected readonly rows = signal<Engagement[]>([]);
  protected readonly notices = signal<AccountNotice[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);
  protected readonly open = signal(false);
  protected readonly busy = signal(false);
  protected readonly formError = signal<unknown>(null);
  protected readonly name = signal('');
  protected readonly from = signal(`${new Date().getFullYear() - 1}-01-01`);
  protected readonly to = signal(`${new Date().getFullYear() - 1}-12-31`);
  protected readonly firm = signal('');
  protected readonly areas = signal<string[]>(['CASH_AND_BANKS', 'RECEIVABLES', 'PAYABLES', 'REVENUE', 'EXPENSES', 'TAXES']);

  constructor() { void this.load(); }

  protected total(e: Engagement): string {
    const n = Object.values(e.findingsBySeverity ?? {}).reduce((s, x) => s + x, 0);
    return n ? `${n}` : '—';
  }
  protected toggle(a: string, on: boolean): void { this.areas.update((xs) => (on ? [...xs, a] : xs.filter((x) => x !== a))); }

  private async load(): Promise<void> {
    try {
      const [rows, notices] = await Promise.all([this.api.getP<Engagement[]>('/auditing/engagements'), this.api.getP<AccountNotice[]>('/auditing/account-notices')]);
      this.rows.set(rows); this.notices.set(this.auth.has('AUDITOR') ? notices : []);
    } catch (e) { this.error.set(e); }
    this.loading.set(false);
  }

  protected async create(): Promise<void> {
    this.busy.set(true); this.formError.set(null);
    try {
      const e = await firstValueFrom(this.api.post<Engagement>('/auditing/engagements', {
        name: this.name().trim(), periodStart: this.from(), periodEnd: this.to(), ...(this.firm().trim() ? { auditorFirm: this.firm().trim() } : {}), areas: this.areas(),
      }));
      this.notify.ok('Encargo creado.');
      await this.router.navigate(['/auditing', e.id]);
    } catch (e) { this.formError.set(e); }
    this.busy.set(false);
  }
}
