import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean, dec, fmtDate, isoDate, sumDec } from '../../shared/format';
import { BANK_TX_STATUS, RECON_STATUS } from '../../shared/labels';
import { AttachmentsPanel, ComboOption, UI } from '../../shared/ui';
import { BankTx, errorLines, ReconciliationFull, ReconItem, Suggestion } from './types';

type Tab = 'unmatched' | 'book' | 'matched';

/** Detalle de una conciliación: diferencia en vivo, sugerencias, enlace manual y automático, completar y reabrir. */
@Component({
  selector: 'app-reconciliation-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AttachmentsPanel, ...UI],
  templateUrl: './reconciliation-detail.html',
})
export class ReconciliationDetail {
  /** Id de la conciliación (parámetro de ruta). */
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  private readonly router = inject(Router);
  private readonly auth = inject(Auth);

  protected readonly STATUS = RECON_STATUS;
  protected readonly TX_STATUS = BANK_TX_STATUS;
  // Quién puede qué (según los @Roles del backend)
  protected readonly canMatch = this.auth.has('ADMIN', 'ACCOUNTANT', 'APPROVER');
  protected readonly canCategorize = this.auth.has('ADMIN', 'ACCOUNTANT');
  protected readonly canComplete = this.auth.has('ADMIN', 'APPROVER');
  protected readonly canReopen = this.auth.has('ADMIN');
  protected readonly canDelete = this.auth.has('ADMIN', 'ACCOUNTANT');

  protected readonly rec = signal<ReconciliationFull | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly tab = signal<Tab>('unmatched');
  protected readonly busy = signal(false);
  protected readonly blockerLines = signal<string[]>([]);

  protected readonly isDraft = computed(() => this.rec()?.status === 'DRAFT');
  protected readonly summary = computed(() => this.rec()?.summary ?? null);
  /** Diferencia calculada con las partidas visibles: extracto − (libros − pendientes en libros + banco sin registrar). */
  protected readonly liveDifference = computed(() => {
    const s = this.summary();
    if (!s) return dec(0);
    return dec(s.statementBalance).minus(dec(s.bookBalance).minus(dec(s.outstandingNet)).plus(dec(s.unmatchedSum)));
  });
  protected readonly balanced = computed(() => this.liveDifference().isZero());

  // sugerencias
  protected readonly days = signal(5);
  protected readonly suggestions = signal<Map<string, Suggestion['candidates']>>(new Map());
  protected readonly loadingSugg = signal(false);
  // enlazados
  protected readonly matched = signal<BankTx[]>([]);
  protected readonly matchedTotal = signal(0);

  // enlace manual
  protected readonly manualTx = signal<BankTx | null>(null);
  protected readonly picked = signal<ReadonlySet<string>>(new Set());
  protected readonly manualError = signal('');
  protected readonly manualBusy = signal(false);
  protected readonly manualItems = computed<ReconItem[]>(() => {
    const t = this.manualTx(); const s = this.summary();
    if (!t || !s) return [];
    return dec(t.amount).gt(0) ? s.depositsInTransit : s.outstandingPayments;
  });
  protected readonly pickedSum = computed(() => sumDec(this.manualItems().filter((i) => this.picked().has(i.journalEntryLineId)).map((i) => i.amount)));
  protected readonly manualMatches = computed(() => { const t = this.manualTx(); return !!t && this.picked().size > 0 && this.pickedSum().equals(dec(t.amount)); });

  // categorizar
  protected readonly catTx = signal<BankTx | null>(null);
  protected readonly catBusy = signal(false);
  protected readonly catError = signal('');
  protected readonly catForm = this.fb.nonNullable.group({ accountId: ['', Validators.required], description: [''] });
  protected readonly accountOptions = computed<ComboOption[]>(() => {
    const gl = this.rec()?.bankAccount.glAccountId;
    return this.lookups.accounts().filter((a) => a.active && a.isPostable && a.id !== gl).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
  });

  constructor() {
    void this.lookups.ensureAccounts();
    void this.reload();
  }

  protected setTab(t: Tab): void { this.tab.set(t); }
  protected setDays(v: string): void {
    const n = Math.min(30, Math.max(0, Math.trunc(Number(v)) || 0));
    this.days.set(n);
    void this.loadSuggestions();
  }
  protected itemLabel(i: ReconItem): string { return `${i.entryNumber} · ${fmtDate(i.date)}${i.reference ? ' · ' + i.reference : ''}`; }

  private send<T = unknown>(path: string, body?: unknown): Promise<T> { return firstValueFrom(this.api.post<T>(path, body)); }

  /** Recarga todo: la conciliación (con su resumen), las sugerencias y los movimientos enlazados. */
  protected async reload(): Promise<void> {
    this.error.set('');
    try {
      const r = await this.api.getP<ReconciliationFull>(`/bank-reconciliations/${this.id()}`);
      this.rec.set(r);
      this.loading.set(false);
      await Promise.all([this.loadSuggestions(), this.loadMatched()]);
    } catch (e) { this.error.set(errorMessage(e)); this.loading.set(false); }
  }
  private async loadSuggestions(): Promise<void> {
    const r = this.rec();
    if (!r || r.status !== 'DRAFT') { this.suggestions.set(new Map()); return; }
    this.loadingSugg.set(true);
    try {
      const list = await this.api.getP<Suggestion[]>(`/bank-accounts/${r.bankAccountId}/suggestions`, { days: this.days() });
      this.suggestions.set(new Map(list.map((s) => [s.transaction.id, s.candidates])));
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.loadingSugg.set(false);
  }
  private async loadMatched(): Promise<void> {
    const r = this.rec();
    if (!r || r.status !== 'DRAFT') { this.matched.set([]); this.matchedTotal.set(0); return; }
    try {
      const res = await this.api.getP<Page<BankTx>>(`/bank-accounts/${r.bankAccountId}/transactions`, { status: 'MATCHED', to: isoDate(r.statementDate), limit: 200 });
      this.matched.set(res.data); this.matchedTotal.set(res.total);
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

  // ---- acciones de la conciliación ----
  protected async autoMatch(): Promise<void> {
    const r = this.rec();
    if (!r) return;
    if (!(await this.confirm.ask({ title: 'Enlazar automáticamente', message: `Se enlazan solo los pares sin ambigüedad: mismo monto, hasta ${this.days()} día(s) de diferencia y un único candidato. El resto queda para revisión manual.`, confirmText: 'Enlazar' }))) return;
    this.busy.set(true);
    try {
      const x = await this.send<{ matched: number; ambiguous: number; unmatched: number }>(`/bank-accounts/${r.bankAccountId}/auto-match?days=${this.days()}`);
      this.notify.ok(`Enlazados ${x.matched}. Ambiguos: ${x.ambiguous}. Sin candidato: ${x.unmatched}.`);
      await this.reload();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async matchOne(t: { id: string }, lineId: string): Promise<void> {
    this.busy.set(true);
    try { await this.send(`/bank-transactions/${t.id}/match`, { journalEntryLineIds: [lineId] }); this.notify.ok('Movimiento enlazado.'); await this.reload(); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async unmatch(t: BankTx): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Deshacer enlace', message: 'El movimiento vuelve a pendiente. Si lo creó una categorización, el asiento sigue existiendo: anúlalo desde Asientos si no corresponde.', confirmText: 'Deshacer enlace', danger: true }))) return;
    this.busy.set(true);
    try { await this.send(`/bank-transactions/${t.id}/unmatch`); this.notify.ok('Enlace deshecho.'); await this.reload(); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async ignore(t: BankTx): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Ignorar movimiento', message: 'No se tomará en cuenta en la conciliación. Podrás restaurarlo desde el detalle de la cuenta.', confirmText: 'Ignorar' }))) return;
    this.busy.set(true);
    try { await this.send(`/bank-transactions/${t.id}/ignore`); this.notify.ok('Movimiento ignorado.'); await this.reload(); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async complete(): Promise<void> {
    const r = this.rec();
    if (!r) return;
    if (!(await this.confirm.ask({ title: 'Completar conciliación', message: `Los movimientos enlazados pasan a conciliados y sus asientos ya no se podrán anular. Corte al ${fmtDate(r.statementDate)}.`, confirmText: 'Completar' }))) return;
    this.busy.set(true); this.blockerLines.set([]);
    try {
      await this.send(`/bank-reconciliations/${r.id}/complete`);
      this.notify.ok('Conciliación completada.');
      await this.reload();
    } catch (e) { const x = errorLines(e); this.blockerLines.set(x.lines); this.notify.error(x.message); await this.reload(); }
    this.busy.set(false);
  }

  protected async reopen(): Promise<void> {
    const r = this.rec();
    if (!r) return;
    if (!(await this.confirm.ask({ title: 'Reabrir conciliación', message: 'Vuelve a estar en proceso y los movimientos conciliados quedan solo enlazados. Solo se puede reabrir la última conciliación completada de la cuenta.', confirmText: 'Reabrir', danger: true }))) return;
    this.busy.set(true);
    try { await this.send(`/bank-reconciliations/${r.id}/reopen`); this.notify.ok('Conciliación reabierta.'); await this.reload(); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async remove(): Promise<void> {
    const r = this.rec();
    if (!r) return;
    if (!(await this.confirm.ask({ title: 'Eliminar conciliación', message: 'Se elimina este borrador. Los movimientos y enlaces no cambian.', confirmText: 'Eliminar', danger: true }))) return;
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.delete(`/bank-reconciliations/${r.id}`));
      this.notify.ok('Conciliación eliminada.');
      await this.router.navigate(['/reconciliations']);
    } catch (e) { this.notify.error(errorMessage(e)); this.busy.set(false); }
  }

  // ---- enlace manual ----
  protected openManual(t: BankTx): void { this.manualTx.set(t); this.picked.set(new Set()); this.manualError.set(''); }
  protected togglePick(id: string): void {
    this.picked.update((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  protected async saveManual(): Promise<void> {
    const t = this.manualTx();
    if (!t || this.manualBusy()) return;
    if (!this.manualMatches()) { this.manualError.set('Las líneas elegidas deben sumar exactamente el monto del movimiento.'); return; }
    this.manualBusy.set(true); this.manualError.set('');
    try {
      await this.send(`/bank-transactions/${t.id}/match`, { journalEntryLineIds: [...this.picked()] });
      this.notify.ok('Movimiento enlazado.');
      this.manualTx.set(null);
      await this.reload();
    } catch (e) { this.manualError.set(errorMessage(e)); }
    this.manualBusy.set(false);
  }

  // ---- categorizar ----
  protected openCategorize(t: BankTx): void { this.catTx.set(t); this.catError.set(''); this.catForm.reset({ description: t.description }); }
  protected async saveCategorize(): Promise<void> {
    const t = this.catTx();
    this.catForm.markAllAsTouched();
    if (!t || this.catForm.invalid || this.catBusy()) return;
    this.catBusy.set(true); this.catError.set('');
    const v = this.catForm.getRawValue();
    try {
      await this.send(`/bank-transactions/${t.id}/categorize`, clean({ accountId: v.accountId, description: v.description.trim() }));
      this.notify.ok('Movimiento categorizado.');
      this.catTx.set(null);
      await this.reload();
    } catch (e) { this.catError.set(errorMessage(e)); }
    this.catBusy.set(false);
  }
}
