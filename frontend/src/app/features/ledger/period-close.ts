import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { Notify } from '../../core/notify';
import { UI } from '../../shared/ui';
import { ErrorNotice } from '../../shared/ui/error-notice';
import type { FiscalPeriod } from './ledger-shared';

interface CloseCheck { key: string; title: string; ok: boolean; detail: string; route: string }
interface CloseStatus { period: { id: string; name: string; startDate: string; endDate: string; status: string }; closed: boolean; ready: boolean; checks: CloseCheck[] }

/** Cierre de mes guiado (E2, R8): qué revisar antes de cerrar, con enlace a cada arreglo, y el botón de cerrar. */
@Component({
  selector: 'app-period-close',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ErrorNotice, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Cierre de mes guiado</h1><p class="sub">Revisa cada punto antes de cerrar: un mes cerrado ya no acepta cambios.</p></div></div>
      <div class="toolbar">
        <div class="field"><label for="pc-p">Período</label>
          <select id="pc-p" class="select" [value]="periodId()" (change)="pick($any($event.target).value)">
            <option value="">Elige un mes…</option>
            @for (p of periods(); track p.id) { <option [value]="p.id">{{ p.name }}{{ p.status === 'CLOSED' ? ' (cerrado)' : '' }}</option> }
          </select></div>
      </div>
      @if (!periods().length && !loading()) {
        <div class="empty"><h3>No hay períodos fiscales</h3><p>Crea los meses de tu año fiscal para poder cerrarlos.</p><a class="btn btn-primary" routerLink="/fiscal-periods">Ir a Períodos fiscales</a></div>
      }
      <app-error-notice [error]="error()" />
      @if (loading()) { <div class="loading"><span class="spinner"></span> Revisando…</div> }
      @else if (status(); as s) {
        @if (s.closed) { <div class="notice info" role="status">{{ s.period.name }} ya está cerrado.</div> }
        <section class="panel">
          <ul class="checks">
            @for (c of s.checks; track c.key) {
              <li [class.ok]="c.ok">
                <span class="badge" [class.pos]="c.ok" [class.warn]="!c.ok">{{ c.ok ? '✓ Listo' : '! Revisar' }}</span>
                <div><strong>{{ c.title }}</strong><div class="hint">{{ c.detail }}</div></div>
                @if (!c.ok) { <a class="btn btn-sm" [routerLink]="c.route">Arreglarlo</a> }
              </li>
            }
          </ul>
        </section>
        @if (!s.closed && auth.has('ADMIN')) {
          <div class="btn-row section">
            <button type="button" class="btn btn-primary" [disabled]="busy() || !s.ready" (click)="close()">{{ busy() ? 'Cerrando…' : 'Cerrar ' + s.period.name }}</button>
            @if (!s.ready) { <span class="hint">Resuelve los puntos marcados para poder cerrar.</span> }
          </div>
        }
      }
    </div>
  `,
  styles: `.checks { list-style: none; margin: 0; padding: 0; } .checks li { display: grid; grid-template-columns: auto 1fr auto; gap: 12px; align-items: center; padding: 12px 16px; border-bottom: 1px solid var(--line); } @media (max-width: 480px) { .checks li { grid-template-columns: 1fr; } }`,
})
export class PeriodClose {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  protected readonly auth = inject(Auth);
  protected readonly periods = signal<FiscalPeriod[]>([]);
  protected readonly periodId = signal('');
  protected readonly status = signal<CloseStatus | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal<unknown>(null);
  private readonly firstOpen = computed(() => this.periods().find((p) => p.status !== 'CLOSED'));

  constructor() { void this.init(); }

  private async init(): Promise<void> {
    try {
      const rows = await this.api.getP<FiscalPeriod[] | { data: FiscalPeriod[] }>('/accounting/fiscal-periods');
      this.periods.set((Array.isArray(rows) ? rows : rows.data).sort((a, b) => a.startDate.localeCompare(b.startDate)));
      const p = this.firstOpen();
      if (p) await this.pick(p.id);
    } catch (e) { this.error.set(e); }
    this.loading.set(false);
  }

  protected async pick(id: string): Promise<void> {
    this.periodId.set(id); this.status.set(null); this.error.set(null);
    if (!id) return;
    this.loading.set(true);
    try { this.status.set(await this.api.getP<CloseStatus>('/guidance/period-close', { periodId: id })); } catch (e) { this.error.set(e); }
    this.loading.set(false);
  }

  protected async close(): Promise<void> {
    const s = this.status();
    if (!s) return;
    if (!(await this.confirm.ask({ title: `Cerrar ${s.period.name}`, message: 'Después de cerrar, ese mes no acepta facturas, pagos ni asientos nuevos. Solo un administrador puede reabrirlo.', confirmText: 'Cerrar el mes' }))) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.post(`/accounting/fiscal-periods/${s.period.id}/close`, {}));
      this.notify.ok(`${s.period.name} cerrado.`);
      await this.init();
    } catch (e) { this.error.set(e); }
    this.busy.set(false);
  }
}
