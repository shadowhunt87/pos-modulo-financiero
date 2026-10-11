import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, input, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Subject, debounceTime } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean, today } from '../../shared/format';
import { BANK_ACCOUNT_TYPE, BANK_TX_SOURCE, BANK_TX_STATUS, opts } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { BankAccountDetailData, BankTx, errorLines } from './types';

const MAX_CSV_CHARS = 5_000_000;

/** Detalle de una cuenta bancaria: movimientos, importación de extractos, reglas, categorizar e ignorar. */
@Component({
  selector: 'app-bank-account-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  templateUrl: './bank-account-detail.html',
})
export class BankAccountDetail {
  /** Id de la cuenta (parámetro de ruta). */
  readonly id = input.required<string>();

  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  private readonly destroyRef = inject(DestroyRef);
  private readonly auth = inject(Auth);

  protected readonly TYPES = BANK_ACCOUNT_TYPE;
  protected readonly TX_STATUS = BANK_TX_STATUS;
  protected readonly TX_SOURCE = BANK_TX_SOURCE;
  protected readonly statusOptions = opts.bankTxStatus;
  protected readonly canWrite = this.auth.has('ADMIN', 'ACCOUNTANT');
  protected readonly canMatch = this.auth.has('ADMIN', 'ACCOUNTANT', 'APPROVER');
  protected readonly limit = 50;

  protected readonly account = signal<BankAccountDetailData | null>(null);
  protected readonly accountError = signal('');
  protected readonly rows = signal<BankTx[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly notice = signal('');
  private filters: Record<string, string> = {};
  protected readonly search$ = new Subject<string>();
  protected readonly busyId = signal('');
  protected readonly applying = signal(false);

  // ---- importar ----
  protected readonly importOpen = signal(false);
  protected readonly importing = signal(false);
  protected readonly importError = signal('');
  protected readonly importLines = signal<string[]>([]);
  protected readonly file = signal<{ name: string; text: string; rows: number } | null>(null);
  protected readonly importForm = this.fb.nonNullable.group({
    delimiter: [''], hasHeader: [true], dateFormat: ['DMY'], decimalSeparator: ['.'], applyRules: [true],
    colDate: [''], colDescription: [''], colAmount: [''], colDebit: [''], colCredit: [''], colReference: [''], colBalance: [''],
  });

  // ---- agregar movimiento ----
  protected readonly addOpen = signal(false);
  protected readonly adding = signal(false);
  protected readonly addError = signal('');
  protected readonly addForm = this.fb.nonNullable.group({
    date: [today(), Validators.required], description: ['', [Validators.required, Validators.maxLength(300)]],
    amount: [null as number | null, Validators.required], reference: [''], balanceAfter: [null as number | null], externalId: [''],
  });

  // ---- categorizar ----
  protected readonly catTx = signal<BankTx | null>(null);
  protected readonly categorizing = signal(false);
  protected readonly catError = signal('');
  protected readonly catForm = this.fb.nonNullable.group({ accountId: ['', Validators.required], description: [''] });
  protected readonly accountOptions = computed<ComboOption[]>(() => {
    const gl = this.account()?.glAccountId;
    return this.lookups.accounts().filter((a) => a.active && a.isPostable && a.id !== gl).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
  });
  protected readonly glName = computed(() => this.lookups.accountName(this.account()?.glAccountId));

  constructor() {
    void this.lookups.ensureAccounts();
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((q) => this.setFilter('q', q));
    void this.loadAccount();
    void this.load();
  }

  protected setFilter(key: string, value: string): void { this.filters = { ...this.filters, [key]: value }; this.page.set(1); void this.load(); }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async loadAccount(): Promise<void> {
    try { this.account.set(await this.api.getP<BankAccountDetailData>(`/bank-accounts/${this.id()}`)); this.accountError.set(''); }
    catch (e) { this.accountError.set(errorMessage(e)); }
  }
  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const res = await this.api.getP<Page<BankTx>>(`/bank-accounts/${this.id()}/transactions`, { ...this.filters, page: this.page(), limit: this.limit });
      this.rows.set(res.data); this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }
  private async refresh(): Promise<void> { await Promise.all([this.loadAccount(), this.load()]); }
  private send(method: 'post', path: string, body?: unknown): Promise<unknown> {
    return new Promise<unknown>((ok, bad) => this.api[method](path, body).subscribe({ next: ok, error: bad }));
  }

  // ---- importar ----
  protected openImport(): void {
    this.importError.set(''); this.importLines.set([]); this.file.set(null);
    this.importForm.reset({ hasHeader: true, dateFormat: 'DMY', decimalSeparator: '.', applyRules: true });
    this.importOpen.set(true);
  }
  protected async pickFile(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    this.importError.set(''); this.importLines.set([]);
    if (!f) return;
    try {
      const text = await f.text();
      if (text.length > MAX_CSV_CHARS) { this.file.set(null); this.importError.set('El archivo es demasiado grande (máximo 5 MB). Divídelo en varios extractos.'); return; }
      const rows = text.split(/\r?\n/).filter((l) => l.trim() !== '').length;
      this.file.set({ name: f.name, text, rows });
    } catch { this.file.set(null); this.importError.set('No se pudo leer el archivo. Verifica que sea un CSV de texto.'); }
  }
  protected async runImport(): Promise<void> {
    const f = this.file();
    if (!f) { this.importError.set('Elige el archivo del extracto (CSV).'); return; }
    if (this.importing()) return;
    this.importing.set(true); this.importError.set(''); this.importLines.set([]);
    const v = this.importForm.getRawValue();
    const columns = clean({ date: v.colDate.trim(), description: v.colDescription.trim(), amount: v.colAmount.trim(), debit: v.colDebit.trim(), credit: v.colCredit.trim(), reference: v.colReference.trim(), balance: v.colBalance.trim() });
    const body = clean({
      csv: f.text, delimiter: v.delimiter, hasHeader: v.hasHeader, dateFormat: v.dateFormat, decimalSeparator: v.decimalSeparator, applyRules: v.applyRules,
      columns: Object.keys(columns).length ? columns : '',
    });
    try {
      const r = await this.send('post', `/bank-accounts/${this.id()}/import`, body) as { total: number; imported: number; skipped: number; rules?: { categorized: number; failed: unknown[] } };
      let msg = `Se importaron ${r.imported} de ${r.total} movimientos.`;
      if (r.skipped) msg += ` ${r.skipped} ya existían y se omitieron.`;
      if (r.rules) msg += ` Las reglas categorizaron ${r.rules.categorized}${r.rules.failed.length ? ` y ${r.rules.failed.length} no se pudieron categorizar` : ''}.`;
      this.notice.set(msg);
      this.notify.ok('Extracto importado.');
      this.importOpen.set(false);
      this.page.set(1);
      await this.refresh();
    } catch (e) { const x = errorLines(e); this.importError.set(x.message); this.importLines.set(x.lines); }
    this.importing.set(false);
  }

  // ---- reglas ----
  protected async applyRules(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Aplicar reglas bancarias', message: 'Se categorizarán los movimientos pendientes que coincidan con una regla activa y se creará el asiento de cada uno.', confirmText: 'Aplicar reglas' }))) return;
    this.applying.set(true);
    try {
      const r = await this.send('post', `/bank-accounts/${this.id()}/apply-rules`) as { categorized: number; failed: { id: string; reason: string }[] };
      this.notice.set(`Las reglas categorizaron ${r.categorized} movimiento(s).${r.failed.length ? ` ${r.failed.length} no se pudieron categorizar: ${r.failed.slice(0, 3).map((f) => f.reason).join('; ')}.` : ''}`);
      await this.refresh();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.applying.set(false);
  }

  // ---- agregar movimiento ----
  protected openAdd(): void {
    this.addError.set('');
    this.addForm.reset({ date: today(), amount: null, balanceAfter: null });
    this.addOpen.set(true);
  }
  protected async saveAdd(): Promise<void> {
    this.addForm.markAllAsTouched();
    const v = this.addForm.getRawValue();
    if (this.addForm.invalid || this.adding()) return;
    if (!v.amount || Number(v.amount) === 0) { this.addError.set('El monto no puede ser cero. Usa positivo para entradas y negativo para salidas.'); return; }
    this.adding.set(true); this.addError.set('');
    const body = clean({
      date: v.date, description: v.description.trim(), amount: Number(v.amount), reference: v.reference.trim(),
      balanceAfter: v.balanceAfter === null ? '' : Number(v.balanceAfter), externalId: v.externalId.trim(),
    });
    try {
      await this.send('post', `/bank-accounts/${this.id()}/transactions`, body);
      this.notify.ok('Movimiento agregado.');
      this.addOpen.set(false);
      await this.refresh();
    } catch (e) { this.addError.set(errorMessage(e)); }
    this.adding.set(false);
  }

  // ---- categorizar ----
  protected openCategorize(t: BankTx): void {
    this.catTx.set(t); this.catError.set('');
    this.catForm.reset({ description: t.description });
  }
  protected async saveCategorize(): Promise<void> {
    const t = this.catTx();
    this.catForm.markAllAsTouched();
    if (!t || this.catForm.invalid || this.categorizing()) return;
    this.categorizing.set(true); this.catError.set('');
    const v = this.catForm.getRawValue();
    try {
      const r = await this.send('post', `/bank-transactions/${t.id}/categorize`, clean({ accountId: v.accountId, description: v.description.trim() })) as { entryNumber?: string };
      this.notify.ok(r.entryNumber ? `Movimiento categorizado. Asiento ${r.entryNumber}.` : 'Movimiento categorizado.');
      this.catTx.set(null);
      await this.refresh();
    } catch (e) { this.catError.set(errorMessage(e)); }
    this.categorizing.set(false);
  }

  // ---- ignorar / restaurar / deshacer enlace ----
  protected async ignore(t: BankTx): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Ignorar movimiento', message: 'El movimiento no se tomará en cuenta en la conciliación. Podrás restaurarlo después.', confirmText: 'Ignorar' }))) return;
    await this.act(t, 'ignore', 'Movimiento ignorado.');
  }
  protected restore(t: BankTx): Promise<void> { return this.act(t, 'restore', 'Movimiento restaurado.'); }
  protected async unmatch(t: BankTx): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Deshacer enlace', message: 'El movimiento vuelve a pendiente. El asiento enlazado no se borra: si lo creó una categorización, anúlalo desde Asientos.', confirmText: 'Deshacer enlace', danger: true }))) return;
    await this.act(t, 'unmatch', 'Enlace deshecho.');
  }
  private async act(t: BankTx, action: 'ignore' | 'restore' | 'unmatch', okMsg: string): Promise<void> {
    this.busyId.set(t.id);
    try { await this.send('post', `/bank-transactions/${t.id}/${action}`); this.notify.ok(okMsg); await this.refresh(); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.busyId.set('');
  }
}
