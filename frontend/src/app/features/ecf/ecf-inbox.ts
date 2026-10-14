import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Notify } from '../../core/notify';
import { UI } from '../../shared/ui';

interface Doc {
  id: string; eNcf: string; ecfType: string; status: string; origin: string; verification: string; attempts: number; lastError: string | null;
  contingencySince: string | null; sentAt: string | null; resolvedAt: string | null; createdAt: string;
  invoice: { id: string; number: string; total: string; issueDate: string; partner: { name: string } };
  events: { kind: string; message: string | null; createdAt: string }[];
}
const LOOK: Record<string, { icon: string; tone: string; text: string }> = {
  IMPORTED: { icon: '↧', tone: '', text: 'Importado' }, PENDING_SEND: { icon: '○', tone: 'info', text: 'Por enviar' }, SENDING: { icon: '…', tone: 'info', text: 'Enviando' },
  ACCEPTED: { icon: '✓', tone: 'pos', text: 'Aceptado' }, ACCEPTED_CONDITIONAL: { icon: '✓', tone: 'warn', text: 'Aceptado condicional' },
  REJECTED: { icon: '✕', tone: 'neg', text: 'Rechazado' }, CONTINGENCY: { icon: '!', tone: 'warn', text: 'Contingencia' }, VOID_UNUSED: { icon: '–', tone: '', text: 'Anulado sin usar' },
};

/** Bandeja de e-CF (N7): estado de cada comprobante electrónico, motivo de rechazo y reintento. */
@Component({
  selector: 'app-ecf-inbox',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Facturas electrónicas (e-CF)</h1><p class="sub">Estado de cada comprobante electrónico ante la DGII.</p></div>
        <div class="btn-row"><a class="btn" routerLink="/ecf/import">Importar XML</a>@if (auth.has('ADMIN')) { <a class="btn" routerLink="/ecf/connection">Conexión con el proveedor</a> }</div>
      </div>
      <div class="toolbar"><div class="field"><label for="ib-s">Estado</label>
        <select id="ib-s" class="select" (change)="status.set($any($event.target).value); load()"><option value="">Todos</option>@for (s of STATES; track s[0]) { <option [value]="s[0]">{{ s[1].text }}</option> }</select></div></div>
      <app-error-notice [error]="error()" />
      <section class="panel"><div class="table-wrap"><table class="table">
        <thead><tr><th>e-NCF</th><th>Factura</th><th>Cliente / proveedor</th><th class="num">Total</th><th>Estado</th><th>Detalle</th><th></th></tr></thead>
        <tbody>
          @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
          @for (d of docs(); track d.id) {
            <tr>
              <td class="mono">{{ d.eNcf.startsWith('PEND-') ? 'Lo asigna el proveedor' : d.eNcf }}</td>
              <td><a [routerLink]="['/invoices', d.invoice.id]">{{ d.invoice.number }}</a><div class="hint">{{ d.invoice.issueDate | fdate }}</div></td>
              <td>{{ d.invoice.partner.name }}</td>
              <td class="num">{{ d.invoice.total | money }}</td>
              <td><span class="badge" [class]="LOOK[d.status].tone">{{ LOOK[d.status].icon }}&nbsp;{{ LOOK[d.status].text }}</span>
                @if (d.origin === 'IMPORTED' && d.verification === 'UNVERIFIED') { <div class="hint">No verificado con la DGII</div> }</td>
              <td class="dim">@if (d.lastError) { {{ d.lastError }} } @else if (d.contingencySince) { Desde {{ d.contingencySince | fdatetime }} } @else if (d.resolvedAt) { {{ d.resolvedAt | fdatetime }} }
                @if (d.attempts) { <div class="hint">{{ d.attempts }} intento(s)</div> }</td>
              <td>@if (canRetry && (d.status === 'CONTINGENCY' || d.status === 'PENDING_SEND')) { <button type="button" class="btn btn-ghost btn-sm" (click)="retry(d)">Reintentar ahora</button> }</td>
            </tr>
          } @empty { @if (!loading()) { <tr><td colspan="7"><app-empty-state title="Todavía no hay facturas electrónicas" text="Aparecen aquí al emitir e-CF desde el sistema (con el proveedor conectado) o al importar sus XML." actionLabel="Importar XML" actionLink="/ecf/import" /></td></tr> } }
        </tbody>
      </table></div></section>
    </div>
  `,
})
export class EcfInbox {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly auth = inject(Auth);
  protected readonly canRetry = this.auth.has('ADMIN', 'ACCOUNTANT');
  protected readonly LOOK = LOOK;
  protected readonly STATES = Object.entries(LOOK);
  protected readonly status = signal('');
  protected readonly docs = signal<Doc[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal<unknown>(null);

  constructor() { void this.load(); }

  protected async load(): Promise<void> {
    this.loading.set(true); this.error.set(null);
    try { this.docs.set(await this.api.getP<Doc[]>('/ecf/documents', this.status() ? { status: this.status() } : {})); } catch (e) { this.error.set(e); }
    this.loading.set(false);
  }
  protected async retry(d: Doc): Promise<void> {
    try {
      const r = await firstValueFrom(this.api.post<{ status: string; lastError: string | null }>(`/ecf/documents/${d.id}/retry`, {}));
      this.notify.ok(`Estado: ${LOOK[r.status]?.text ?? r.status}`);
      await this.load();
    } catch (e) { this.error.set(e); }
  }
}
