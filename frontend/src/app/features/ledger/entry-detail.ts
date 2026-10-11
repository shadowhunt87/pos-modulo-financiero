import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { ENTRY_STATUS, ENTRY_TYPE, SOURCE_DOC } from '../../shared/labels';
import { AttachmentsPanel, UI } from '../../shared/ui';
import { Entry, balanceOf, send } from './ledger-shared';

/** Detalle de un asiento con sus líneas, soportes y las acciones que permite su estado y tu rol. */
@Component({
  selector: 'app-entry-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AttachmentsPanel, ...UI],
  template: `
    <div class="page">
      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      @if (loading() && !entry()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
      @if (entry(); as e) {
        <div class="page-head">
          <div>
            <h1>Asiento {{ e.number || '(sin número)' }} <app-status [value]="e.status" [map]="ENTRY_STATUS" /></h1>
            <p class="sub">{{ e.description }}</p>
          </div>
          <div class="btn-row">
            <a class="btn" routerLink="/entries">Volver al listado</a>
            @if (canEdit()) { <a class="btn" [routerLink]="['/entries', e.id, 'edit']">Corregir</a> }
            @if (canApprove()) { <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="approve()">Aprobar</button> }
            @if (canReject()) { <button type="button" class="btn" [disabled]="busy()" (click)="reject()">Rechazar</button> }
            @if (canVoid()) { <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="voidEntry()">Anular</button> }
          </div>
        </div>

        @if (e.status === 'DRAFT') {
          <div class="notice info" role="status">
            Pendiente de aprobación: todavía no tiene número y no afecta los libros ni los reportes.
            @if (isOwn() && auth.has('ADMIN', 'APPROVER')) { Como lo creaste tú, otra persona debe aprobarlo. }
          </div>
        }
        @if (e.status === 'REJECTED') {
          <div class="notice neg" role="status">Rechazado{{ e.rejectedAt ? ' el ' + (e.rejectedAt | fdate) : '' }}. Motivo: {{ e.rejectReason }}. Corrígelo y vuelve a enviarlo.</div>
        }
        @if (e.status === 'VOIDED') {
          <div class="notice neg" role="status">Anulado{{ e.voidedAt ? ' el ' + (e.voidedAt | fdate) : '' }}. Ya no cuenta en los libros.</div>
        }
        @if (e.type === 'CLOSING' && e.status === 'POSTED') {
          <div class="notice info" role="status">Es el asiento de cierre del año fiscal. Solo se anula reabriendo el año en “Años fiscales y cierre”.</div>
        }
        @if (e.reconciled && e.status === 'POSTED') {
          <div class="notice info" role="status">Está conciliado con el banco, por eso no se puede anular.</div>
        }

        <section class="panel panel-pad">
          <dl class="kv">
            <dt>Fecha</dt><dd>{{ e.date | fdate }}</dd>
            <dt>Tipo</dt><dd>{{ e.type | lbl: ENTRY_TYPE }}</dd>
            <dt>Diario</dt><dd>{{ journalName() || '—' }}</dd>
            <dt>Referencia</dt><dd>{{ e.reference || '—' }}</dd>
            <dt>Origen</dt><dd>{{ e.sourceType | lbl: SOURCE_DOC }}@if (sourceLink(); as l) { · <a [routerLink]="l">Ver documento</a> }</dd>
            <dt>Moneda</dt><dd>{{ e.currency }}</dd>
            @if (e.reversalOfId) { <dt>Reversa a</dt><dd><a [routerLink]="['/entries', e.reversalOfId]">Ver asiento original</a></dd> }
            @if (e.postedAt) { <dt>Contabilizado</dt><dd>{{ e.postedAt | fdatetime }}</dd> }
            @if (e.approvedAt) { <dt>Aprobado</dt><dd>{{ e.approvedAt | fdatetime }}</dd> }
            @if (e.voidReason) { <dt>Motivo de anulación</dt><dd>{{ e.voidReason }}</dd> }
          </dl>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Líneas</h2></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Cuenta</th><th>Descripción</th><th>Tercero</th><th class="num">Débito</th><th class="num">Crédito</th></tr></thead>
              <tbody>
                @for (l of e.lines; track l.id) {
                  <tr>
                    <td><span class="mono">{{ l.account?.code }}</span> {{ l.account?.name }}</td>
                    <td>{{ l.description }}</td>
                    <td>{{ partnerName(l.partnerId) }}</td>
                    <td class="num">{{ l.debit | money: 'blank' }}</td>
                    <td class="num">{{ l.credit | money: 'blank' }}</td>
                  </tr>
                }
              </tbody>
              <tfoot>
                <tr><td colspan="3">Totales {{ bal().balanced ? '(cuadrado)' : '(no cuadra)' }}</td>
                  <td class="num">{{ bal().debit.toString() | money }}</td><td class="num">{{ bal().credit.toString() | money }}</td></tr>
              </tfoot>
            </table>
          </div>
        </section>

        <app-attachments parent="journalEntryId" [parentId]="e.id" [canEdit]="canAttach()" />
      }
    </div>
  `,
})
export class EntryDetail {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  protected readonly auth = inject(Auth);

  readonly id = input.required<string>();
  protected readonly ENTRY_STATUS = ENTRY_STATUS;
  protected readonly ENTRY_TYPE = ENTRY_TYPE;
  protected readonly SOURCE_DOC = SOURCE_DOC;

  protected readonly entry = signal<Entry | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly busy = signal(false);

  protected readonly bal = computed(() => balanceOf(this.entry()?.lines ?? []));
  protected readonly isOwn = computed(() => this.entry()?.createdById === this.auth.user()?.id);

  // Reglas del backend: aprueba ADMIN/APPROVER (nunca quien lo creó); rechaza ADMIN/APPROVER o el contador dueño;
  // anula ADMIN/APPROVER solo lo contabilizado, no conciliado y que no sea de cierre; corrige ADMIN o el contador dueño.
  protected readonly canApprove = computed(() => this.entry()?.status === 'DRAFT' && this.auth.has('ADMIN', 'APPROVER') && !this.isOwn());
  protected readonly canReject = computed(() =>
    this.entry()?.status === 'DRAFT' && (this.auth.has('ADMIN', 'APPROVER') || (this.auth.has('ACCOUNTANT') && this.isOwn())));
  protected readonly canVoid = computed(() => {
    const e = this.entry();
    return !!e && e.status === 'POSTED' && !e.reconciled && e.type !== 'CLOSING' && this.auth.has('ADMIN', 'APPROVER');
  });
  protected readonly canEdit = computed(() => {
    const s = this.entry()?.status;
    return (s === 'DRAFT' || s === 'REJECTED') && (this.auth.has('ADMIN') || (this.auth.has('ACCOUNTANT') && this.isOwn()));
  });
  protected readonly canAttach = computed(() => this.entry()?.status !== 'VOIDED' && this.auth.has('ADMIN', 'ACCOUNTANT', 'APPROVER'));

  protected readonly journalName = computed(() => {
    const j = this.lookups.journals().find((x) => x.id === this.entry()?.journalId);
    return j ? `${j.code} · ${j.name}` : '';
  });
  protected readonly sourceLink = computed<string[] | null>(() => {
    const e = this.entry();
    if (!e?.sourceId) return null;
    if (e.sourceType === 'INVOICE') return ['/invoices', e.sourceId];
    if (e.sourceType === 'PAYMENT') return ['/payments', e.sourceId];
    return null;
  });

  constructor() {
    void Promise.all([this.lookups.ensureJournals(), this.lookups.ensurePartners()]).catch(() => undefined);
    effect(() => { const id = this.id(); if (id) void this.load(id); });
  }

  protected partnerName(id: string | null): string { return id ? this.lookups.partnerName(id) : ''; }

  private async load(id: string): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.entry.set(await this.api.getP<Entry>(`/accounting/journal-entries/${id}`)); }
    catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  private async act(path: string, body: unknown, done: string): Promise<void> {
    const e = this.entry();
    if (!e || this.busy()) return;
    this.busy.set(true);
    try {
      await send(this.api.post(`/accounting/journal-entries/${e.id}/${path}`, body));
      this.notify.ok(done);
    } catch (err) { this.notify.error(errorMessage(err)); }
    await this.load(e.id);
    this.busy.set(false);
  }

  protected async approve(): Promise<void> {
    const e = this.entry();
    if (!e) return;
    const ok = await this.confirm.ask({
      title: 'Aprobar asiento', message: 'Se contabilizará con fecha del asiento, recibirá su número y empezará a contar en los libros y reportes.', confirmText: 'Aprobar',
    });
    if (ok) await this.act('approve', undefined, 'Asiento aprobado y contabilizado.');
  }
  protected async reject(): Promise<void> {
    const reason = await this.confirm.reason({
      title: 'Rechazar asiento', message: 'El asiento no entrará a los libros. Quien lo creó podrá corregirlo y volver a enviarlo.', confirmText: 'Rechazar', danger: true, label: 'Motivo del rechazo',
    });
    if (reason === null) return;
    if (reason.length > 500) { this.notify.error('El motivo admite máximo 500 caracteres.'); return; }
    await this.act('reject', { reason }, 'Asiento rechazado.');
  }
  protected async voidEntry(): Promise<void> {
    const reason = await this.confirm.reason({
      title: 'Anular asiento', message: 'Dejará de contar en los libros y reportes. Esta acción no se puede deshacer.', confirmText: 'Anular asiento', danger: true, label: 'Motivo de la anulación',
    });
    if (reason === null) return;
    if (reason.length > 500) { this.notify.error('El motivo admite máximo 500 caracteres.'); return; }
    await this.act('void', { reason }, 'Asiento anulado.');
  }
}
