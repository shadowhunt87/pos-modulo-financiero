import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { Notify } from '../../core/notify';
import { UI } from '../../shared/ui';

interface CalItem {
  code: string; name: string; period: string; dueDate: string; originalDate: string; moved: boolean; route: string;
  status: 'FILED' | 'PENDING' | 'OVERDUE'; filing: { id: string; filedAt: string; reference: string | null } | null;
}
interface Contingency { active: { id: string; reason: string; endsAt: string } | null; bLastDay: { date: string; classification: string } | null }
const LOOK = { FILED: { icon: '✓', tone: 'pos', text: 'Presentada' }, PENDING: { icon: '○', tone: '', text: 'Pendiente' }, OVERDUE: { icon: '!', tone: 'neg', text: 'Vencida' } } as const;

/** Calendario fiscal (PLAN-v0.3 §8, N5): qué vence, qué falta, «Ya lo presenté» y contingencia de comprobantes B. */
@Component({
  selector: 'app-fiscal-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head"><div><h1>Calendario fiscal</h1><p class="sub">Lo que tienes que presentar a la DGII, cuándo vence y si ya lo presentaste.</p></div></div>
      @for (w of warnings(); track $index) { <div class="notice info" role="status">{{ w }}</div> }
      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Vence</th><th>Declaración</th><th>Período</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @if (loading()) { <tr><td colspan="5"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
            @for (i of items(); track i.code + i.period) {
              <tr>
                <td class="nowrap">{{ i.dueDate | fdate }}@if (i.moved) { <div class="hint">Corrido desde el {{ i.originalDate | fdate }} (no laborable)</div> }</td>
                <td><strong>{{ i.name }}</strong></td>
                <td class="mono">{{ i.period }}</td>
                <td><span class="badge" [class]="LOOK[i.status].tone">{{ LOOK[i.status].icon }}&nbsp;{{ LOOK[i.status].text }}</span>
                  @if (i.filing?.reference) { <div class="hint">Ref. {{ i.filing!.reference }}</div> }</td>
                <td class="actions">
                  @if (i.status !== 'FILED') {
                    <a class="btn btn-ghost btn-sm" [routerLink]="i.route">Prepararla</a>
                    @if (canFile) { <button type="button" class="btn btn-sm" (click)="file(i)">Ya lo presenté</button> }
                  } @else if (auth.has('ADMIN')) { <button type="button" class="btn btn-ghost btn-sm" (click)="unfile(i)">Deshacer</button> }
                </td>
              </tr>
            } @empty { @if (!loading()) { <tr><td colspan="5"><app-empty-state title="No hay vencimientos en este rango" /></td></tr> } }
          </tbody>
        </table></div>
      </section>

      <section class="panel panel-pad section">
        <h2>Comprobantes B y contingencia</h2>
        @if (cont(); as c) {
          @if (c.bLastDay) { <p>Para tu clasificación, los comprobantes B valen hasta el <strong>{{ c.bLastDay.date | fdate }}</strong>. Después solo e-CF.</p> }
          @else { <p class="hint">Completa la clasificación DGII en <a routerLink="/company/fiscal">Datos fiscales</a> para saber hasta cuándo valen tus B.</p> }
          @if (c.active) {
            <div class="notice warn" role="status">Contingencia vigente hasta el {{ c.active.endsAt | fdatetime }}: {{ c.active.reason }}. Avisa a la DGII y regulariza dentro del plazo.</div>
            @if (auth.has('ADMIN')) { <button type="button" class="btn" (click)="endCont()">Terminar la contingencia</button> }
          } @else if (auth.has('ADMIN')) {
            <p class="hint">Si el sistema de facturación electrónica falla, puedes registrar una contingencia para seguir emitiendo B por un plazo máximo.</p>
            <button type="button" class="btn" (click)="startCont()">Registrar contingencia</button>
          }
        }
      </section>
    </div>
  `,
})
export class FiscalCalendar {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  protected readonly auth = inject(Auth);
  protected readonly LOOK = LOOK;
  protected readonly canFile = this.auth.has('ADMIN', 'ACCOUNTANT');
  protected readonly items = signal<CalItem[]>([]);
  protected readonly warnings = signal<string[]>([]);
  protected readonly cont = signal<Contingency | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true);
    try {
      const [cal, c] = await Promise.all([this.api.getP<{ warnings: string[]; items: CalItem[] }>('/fiscal/calendar'), this.api.getP<Contingency>('/fiscal/b-contingency')]);
      this.items.set(cal.items); this.warnings.set(cal.warnings); this.cont.set(c);
    } catch (e) { this.error.set(e); }
    this.loading.set(false);
  }

  protected async file(i: CalItem): Promise<void> {
    const ref = await this.confirm.reason({ title: `${i.name} · ${i.period}`, message: 'Márcala como presentada. Desde ahora no se podrán anular facturas de ese mes (se corrigen con nota de crédito).', confirmText: 'Ya lo presenté', label: 'Número de confirmación de la DGII (opcional)', required: false });
    if (ref === null) return;
    try { await firstValueFrom(this.api.post('/fiscal/filings', { obligationCode: i.code, period: i.period, ...(ref.trim() ? { reference: ref.trim() } : {}) })); this.notify.ok('Marcada como presentada.'); await this.load(); }
    catch (e) { this.error.set(e); }
  }
  protected async unfile(i: CalItem): Promise<void> {
    if (!i.filing || !(await this.confirm.ask({ title: 'Deshacer la presentación', message: 'Vuelve a quedar pendiente. Queda en la bitácora.', confirmText: 'Deshacer', danger: true }))) return;
    try { await firstValueFrom(this.api.delete(`/fiscal/filings/${i.filing.id}`)); await this.load(); } catch (e) { this.error.set(e); }
  }
  protected async startCont(): Promise<void> {
    const reason = await this.confirm.reason({ title: 'Registrar contingencia', message: 'Permite emitir comprobantes B por el plazo máximo legal. Recuerda avisar a la DGII.', confirmText: 'Registrar', label: 'Motivo (qué falló)' });
    if (reason === null) return;
    try { await firstValueFrom(this.api.post('/fiscal/b-contingency', { reason })); this.notify.ok('Contingencia registrada.'); await this.load(); } catch (e) { this.error.set(e); }
  }
  protected async endCont(): Promise<void> {
    try { await firstValueFrom(this.api.delete('/fiscal/b-contingency')); this.notify.ok('Contingencia terminada.'); await this.load(); } catch (e) { this.error.set(e); }
  }
}
