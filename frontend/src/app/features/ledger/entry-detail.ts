import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { ENTRY_STATUS, ENTRY_TYPE, SOURCE_DOC } from '../../shared/labels';
import { AttachmentsPanel, UI } from '../../shared/ui';
import { ErrorNotice } from '../../shared/ui/error-notice';
import { FieldHelp } from '../../shared/ui/field-help';
import { Entry, balanceOf, send } from './ledger-shared';

/** Detalle de un asiento con sus líneas, soportes y las acciones que permite su estado y tu rol. */
@Component({
  selector: 'app-entry-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, AttachmentsPanel, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      <app-error-notice [error]="error()" />
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
            @if (canVoid()) { <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="openFix()">Corregir con reverso</button> }
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
        @if (e.reversedBy; as r) {
          <div class="notice warn" role="status">Reversado por el asiento <a [routerLink]="['/entries', r.id]">{{ r.number || 'sin número' }}</a>: ya no suma en los saldos, pero los dos se ven en los libros.</div>
        }
        @if (e.status === 'POSTED' && !e.reversedBy && fromDocument()) {
          <div class="notice info" role="status">Este asiento viene de un documento. Para corregirlo, anula o corrige el documento (factura o pago) con una nota de crédito.</div>
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
              <thead><tr><th>Cuenta</th><th>Descripción</th><th>Cliente / proveedor</th><th class="num">Débito</th><th class="num">Crédito</th></tr></thead>
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

        <app-modal [open]="fixOpen()" title="Corregir un asiento contabilizado" width="560px" (closed)="fixOpen.set(false)">
          <p>Lo contabilizado no se borra: se registra un <strong>reverso</strong> (el mismo asiento con débitos y créditos invertidos). El original y el reverso quedan a la vista en los libros.</p>
          <div class="field"><label for="fx-reason">Motivo</label><textarea id="fx-reason" class="input" rows="2" maxlength="500" [value]="fixReason()" (input)="fixReason.set($any($event.target).value)"></textarea></div>
          <div class="field"><label for="fx-date">Fecha del reverso (opcional) <app-field-help text="Déjala vacía para usar la fecha del asiento. Si ese mes ya está cerrado, elige una fecha de un mes abierto." /></label>
            <app-date-input id="fx-date" [value]="fixDate()" (dateChange)="fixDate.set($event)" /></div>
          <app-error-notice [error]="fixError()" />
          <div class="btn-row" style="margin-top:12px">
            <button type="button" class="btn" (click)="fixOpen.set(false)">Cancelar</button>
            <button type="button" class="btn btn-danger" [disabled]="busy()" (click)="reverse(false)">Solo reversar</button>
            <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="reverse(true)">Reversar y crear la copia para corregir</button>
          </div>
        </app-modal>

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
  private readonly router = inject(Router);

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
    return !!e && e.status === 'POSTED' && !e.reconciled && e.type !== 'CLOSING' && e.type !== 'REVERSAL' && !e.reversedBy && !this.fromDocument() && this.auth.has('ADMIN', 'APPROVER');
  });
  /** Los asientos de factura, pago, cierre o vertical se corrigen desde su documento (el backend da 422). */
  protected readonly fromDocument = computed(() => !['MANUAL', 'BANK_TRANSACTION', 'OTHER'].includes(this.entry()?.sourceType ?? 'MANUAL'));
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
  // ---------- Corregir con reverso (N1) ----------
  protected readonly fixOpen = signal(false);
  protected readonly fixReason = signal('');
  protected readonly fixDate = signal('');
  protected readonly fixError = signal<unknown>(null);

  protected openFix(): void { this.fixReason.set(''); this.fixDate.set(''); this.fixError.set(null); this.fixOpen.set(true); }

  protected async reverse(andCopy: boolean): Promise<void> {
    const e = this.entry();
    const reason = this.fixReason().trim();
    if (!e || this.busy()) return;
    if (!reason) { this.fixError.set('Escribe el motivo de la corrección.'); return; }
    this.busy.set(true); this.fixError.set(null);
    try {
      await send(this.api.post(`/accounting/journal-entries/${e.id}/void`, { reason, ...(this.fixDate() ? { reverseOn: this.fixDate() } : {}) }));
      this.fixOpen.set(false);
      this.notify.ok('Asiento reversado.');
      if (andCopy) await this.router.navigate(['/entries/new'], { queryParams: { copy: e.id } });
      else await this.load(e.id);
    } catch (err) { this.fixError.set(err); }
    this.busy.set(false);
  }

}
