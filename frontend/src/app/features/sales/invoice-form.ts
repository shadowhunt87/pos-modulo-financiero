import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import Decimal from 'decimal.js';
import { firstValueFrom, map } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Company } from '../../core/models';
import { Notify } from '../../core/notify';
import { clean, dec, isoDate, money, today } from '../../shared/format';
import { INVOICE_TYPE, opts } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { DGII_EXPENSE_TYPE, DGII_INCOME_TYPE, InvoiceFull, InvoiceRow, NcfType } from './invoice-types';

type Side = 'SALES' | 'PURCHASES';
const r2 = (d: Decimal): Decimal => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
/** Comprobantes que puede pedir una venta (el resto los usan notas y compras). */
const SALES_NCF = ['B01', 'B02', 'B14', 'B15', 'B16', 'E31', 'E32', 'E44', 'E45', 'E46'];
const NOTE_TYPES = ['CREDIT_NOTE', 'DEBIT_NOTE'];

/**
 * Alta y edición (solo borradores) de facturas, compras y notas.
 * POST /invoices, PATCH /invoices/:id, POST /invoices/:id/issue. Los totales se calculan en vivo igual que el backend.
 */
@Component({
  selector: 'app-invoice-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  templateUrl: './invoice-form.html',
  styles: `
    .line { display: grid; gap: 10px 12px; grid-template-columns: minmax(180px, 3fr) 90px 120px 110px minmax(150px, 1.4fr) minmax(190px, 1.8fr) 120px 36px; align-items: end; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    .line:last-child { border-bottom: 0; }
    .line .amount { text-align: right; padding-bottom: 8px; font-variant-numeric: tabular-nums; font-weight: 600; }
    .wh { display: grid; gap: 10px 12px; grid-template-columns: minmax(200px, 2fr) minmax(140px, 1fr) 120px 36px; align-items: end; padding: 12px 16px; border-bottom: 1px solid var(--line); }
    .wh:last-child { border-bottom: 0; }
    .totals { margin-left: auto; width: min(380px, 100%); padding: 14px 20px; }
    .totals div { display: flex; justify-content: space-between; gap: 16px; padding: 3px 0; font-variant-numeric: tabular-nums; }
    .totals .grand { border-top: 1px solid var(--line-strong); margin-top: 6px; padding-top: 8px; font-size: 17px; font-weight: 600; }
    @media (max-width: 1100px) { .line { grid-template-columns: 1fr 1fr; } .line .desc { grid-column: 1 / -1; } .wh { grid-template-columns: 1fr 1fr; } }
  `,
})
export class InvoiceForm {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);
  protected readonly lookups = inject(Lookups);
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  /** Parámetros de la ruta: :id (edición) y ?type=&related= (nota creada desde una factura). */
  readonly id = input<string | undefined>(undefined);
  readonly type = input<string | undefined>(undefined);
  readonly related = input<string | undefined>(undefined);

  protected readonly INVOICE_TYPE = INVOICE_TYPE;
  protected readonly typeOptions = opts.invoiceType;
  protected readonly expenseTypes = Object.entries(DGII_EXPENSE_TYPE);
  protected readonly incomeTypes = Object.entries(DGII_INCOME_TYPE);

  protected readonly loading = signal(true);
  protected readonly saving = signal(false);
  protected readonly loadError = signal('');
  protected readonly formError = signal('');
  protected readonly current = signal<InvoiceFull | null>(null);
  protected readonly baseCurrency = signal('DOP');
  protected readonly ncfTypes = signal<NcfType[]>([]);
  protected readonly relatedInvoices = signal<InvoiceRow[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    type: ['SALE', Validators.required],
    partnerId: ['', Validators.required],
    issueDate: [today(), Validators.required],
    dueDate: [''],
    currency: ['DOP', [Validators.required, Validators.pattern(/^[A-Z]{3}$/)]],
    exchangeRate: [null as number | null],
    ncfType: [''],
    ncf: ['', [Validators.maxLength(13)]],
    relatedInvoiceId: [''],
    dgiiExpenseType: [''],
    dgiiIncomeType: [''],
    notes: ['', Validators.maxLength(1000)],
    lines: this.fb.array([this.newLine()]),
    withholdings: this.fb.array([] as ReturnType<InvoiceForm['newWithholding']>[]),
  });
  protected get lines() { return this.form.controls.lines; }
  protected get withholdings() { return this.form.controls.withholdings; }

  private readonly raw = toSignal(this.form.valueChanges.pipe(map(() => this.form.getRawValue())), { initialValue: this.form.getRawValue() });

  protected readonly editing = computed(() => !!this.id());
  protected readonly isNote = computed(() => NOTE_TYPES.includes(this.raw().type));
  /** Lado del documento: las notas heredan el de la factura que modifican. */
  protected readonly side = computed<Side | null>(() => {
    const t = this.raw().type;
    if (t === 'SALE') return 'SALES';
    if (t === 'PURCHASE') return 'PURCHASES';
    const rel = this.relatedInvoices().find((r) => r.id === this.raw().relatedInvoiceId);
    return rel ? (rel.type === 'SALE' ? 'SALES' : 'PURCHASES') : null;
  });
  protected readonly foreign = computed(() => this.raw().currency !== this.baseCurrency() && this.raw().currency.length === 3);

  protected readonly currencyOptions = computed(() => [...new Set([this.baseCurrency(), 'DOP', 'USD', 'EUR'])]);
  protected readonly partnerOptions = computed<ComboOption[]>(() => {
    const side = this.side();
    return this.lookups.partners()
      .filter((p) => p.active && (side === 'SALES' ? p.type !== 'SUPPLIER' : side === 'PURCHASES' ? p.type !== 'CUSTOMER' : true))
      .map((p) => ({ value: p.id, label: p.name, hint: p.taxId ?? undefined }));
  });
  protected readonly relatedOptions = computed<ComboOption[]>(() =>
    this.relatedInvoices().map((r) => ({ value: r.id, label: `${r.number}${r.ncf ? ' · ' + r.ncf : ''}`, hint: `${money(r.total)} ${r.currency}` })));
  protected readonly accountOptions = computed<ComboOption[]>(() => {
    const side = this.side();
    const types = side === 'PURCHASES' ? ['EXPENSE', 'ASSET'] : side === 'SALES' ? ['INCOME'] : ['INCOME', 'EXPENSE', 'ASSET'];
    return this.lookups.accounts().filter((a) => a.active && a.isPostable && types.includes(a.type)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
  });
  protected readonly lineTaxes = computed(() => {
    const side = this.side();
    return this.lookups.taxRates().filter((t) => t.active && !t.isWithholding && (t.appliesTo === 'BOTH' || !side || t.appliesTo === side));
  });
  protected readonly withholdingTaxes = computed(() => {
    const side = this.side();
    return this.lookups.taxRates().filter((t) => t.active && t.isWithholding && (t.appliesTo === 'BOTH' || !side || t.appliesTo === side));
  });
  protected readonly salesNcf = computed(() => this.ncfTypes().filter((n) => SALES_NCF.includes(n.code)));

  /** Totales en vivo (misma fórmula del backend: redondeo a 2 decimales por línea). */
  protected readonly calc = computed(() => {
    const v = this.raw();
    const rates = new Map(this.lookups.taxRates().map((t) => [t.id, t]));
    let subtotal = dec(0), discount = dec(0), tax = dec(0);
    const problems: string[] = [];
    const nets = v.lines.map((l, i) => {
      const gross = dec(l.quantity).times(dec(l.unitPrice));
      const d = dec(l.discount);
      if (d.gt(gross)) problems.push(`El descuento de la línea ${i + 1} es mayor que su importe.`);
      const net = r2(gross.minus(d));
      const rate = l.taxRateId ? rates.get(l.taxRateId)?.rate : undefined;
      tax = tax.plus(rate ? r2(net.times(dec(rate)).div(100)) : 0);
      subtotal = subtotal.plus(net); discount = discount.plus(d);
      return net;
    });
    subtotal = r2(subtotal); tax = r2(tax);
    let withheld = dec(0);
    const whAmounts = v.withholdings.map((w) => {
      const t = rates.get(w.taxRateId);
      const base = w.base !== null && String(w.base) !== '' ? dec(w.base) : t?.type === 'ITBIS_WITHHOLDING' ? tax : subtotal;
      const amount = t ? r2(base.times(dec(t.rate)).div(100)) : dec(0);
      withheld = withheld.plus(amount);
      return amount;
    });
    const total = subtotal.plus(tax);
    if (total.lte(0)) problems.push('El total debe ser mayor a cero.');
    if (withheld.gt(total)) problems.push('Las retenciones no pueden superar el total.');
    return { nets, whAmounts, subtotal, discount, tax, withheld, total, balance: total.minus(withheld), problems };
  });

  constructor() {
    effect(() => {
      const id = this.id(); const type = this.type(); const related = this.related();
      untracked(() => void this.init(id, type, related));
    });
    // Al cambiar el tercero o el tipo, se vuelve a buscar qué facturas puede modificar una nota
    this.form.controls.partnerId.valueChanges.subscribe((v) => { this.partnerSig.set(v); void this.loadRelated(); });
    this.form.controls.type.valueChanges.subscribe(() => {
      this.form.patchValue({ ncfType: '', ncf: '', relatedInvoiceId: '', dgiiExpenseType: '', dgiiIncomeType: '' });
      void this.loadRelated();
    });
  }

  private newLine() {
    return this.fb.nonNullable.group({
      description: ['', [Validators.required, Validators.maxLength(300)]],
      quantity: [1, [Validators.required, Validators.min(0.0001)]],
      unitPrice: [0, [Validators.required, Validators.min(0)]],
      discount: [0, [Validators.min(0)]],
      taxRateId: [''],
      accountId: [''],
    });
  }
  private newWithholding() {
    return this.fb.nonNullable.group({ taxRateId: ['', Validators.required], base: [null as number | null] });
  }

  protected addLine(): void { this.lines.push(this.newLine()); }
  protected removeLine(i: number): void { if (this.lines.length > 1) this.lines.removeAt(i); }
  protected addWithholding(): void { this.withholdings.push(this.newWithholding()); }
  protected removeWithholding(i: number): void { this.withholdings.removeAt(i); }

  private async init(id: string | undefined, type: string | undefined, related: string | undefined): Promise<void> {
    this.loading.set(true); this.loadError.set('');
    try {
      const [company, ncf] = await Promise.all([
        this.api.getP<Company>('/company'), this.api.getP<NcfType[]>('/ncf/types'),
        this.lookups.ensureAccounts(), this.lookups.ensurePartners(), this.lookups.ensureTaxRates(),
      ]);
      this.baseCurrency.set(company.baseCurrency);
      this.ncfTypes.set(ncf);
      if (id) {
        const inv = await this.api.getP<InvoiceFull>(`/invoices/${id}`);
        this.current.set(inv);
        if (inv.status !== 'DRAFT') { this.loadError.set('Solo se pueden editar facturas en borrador. Abre el detalle para ver esta factura.'); }
        else this.fill(inv);
      } else {
        this.current.set(null);
        this.resetNew(company.baseCurrency);
        if (type && NOTE_TYPES.includes(type) && related) await this.prefillNote(type, related);
        else if (type && ['SALE', 'PURCHASE'].includes(type)) this.form.patchValue({ type });
      }
    } catch (e) { this.loadError.set(errorMessage(e)); }
    this.loading.set(false);
  }

  private resetNew(base: string): void {
    this.lines.clear(); this.withholdings.clear(); this.addLine();
    this.form.reset({ type: 'SALE', issueDate: today(), currency: base, exchangeRate: null });
    this.form.controls.type.enable();
    this.relatedInvoices.set([]);
  }

  private async prefillNote(type: string, relatedId: string): Promise<void> {
    const rel = await this.api.getP<InvoiceFull>(`/invoices/${relatedId}`);
    this.relatedInvoices.set([rel as unknown as InvoiceRow]);
    this.lines.clear();
    if (type === 'CREDIT_NOTE') for (const l of rel.lines) this.lines.push(this.fb.nonNullable.group({
      description: [l.description, [Validators.required, Validators.maxLength(300)]], quantity: [Number(l.quantity), [Validators.required, Validators.min(0.0001)]],
      unitPrice: [Number(l.unitPrice), [Validators.required, Validators.min(0)]], discount: [Number(l.discount), [Validators.min(0)]],
      taxRateId: [l.taxRateId ?? ''], accountId: [l.accountId ?? ''],
    }));
    if (!this.lines.length) this.addLine();
    this.form.patchValue({
      type, partnerId: rel.partner.id, relatedInvoiceId: rel.id, currency: rel.currency,
      exchangeRate: rel.currency === this.baseCurrency() ? null : Number(rel.exchangeRate),
    });
  }

  private fill(inv: InvoiceFull): void {
    this.lines.clear(); this.withholdings.clear();
    for (const l of inv.lines) this.lines.push(this.fb.nonNullable.group({
      description: [l.description, [Validators.required, Validators.maxLength(300)]], quantity: [Number(l.quantity), [Validators.required, Validators.min(0.0001)]],
      unitPrice: [Number(l.unitPrice), [Validators.required, Validators.min(0)]], discount: [Number(l.discount), [Validators.min(0)]],
      taxRateId: [l.taxRateId ?? ''], accountId: [l.accountId ?? ''],
    }));
    if (!this.lines.length) this.addLine();
    const rates = new Map(this.lookups.taxRates().map((t) => [t.id, t]));
    const subtotal = dec(inv.subtotal), tax = dec(inv.taxTotal);
    for (const w of inv.withholdings) {
      // La base solo se fija a mano si difiere de la que el backend calcula por defecto
      const def = rates.get(w.taxRateId)?.type === 'ITBIS_WITHHOLDING' ? tax : subtotal;
      this.withholdings.push(this.fb.nonNullable.group({ taxRateId: [w.taxRateId, Validators.required], base: [dec(w.base).equals(def) ? null : Number(w.base)] }));
    }
    this.relatedInvoices.set(inv.relatedInvoice ? [{ id: inv.relatedInvoice.id, number: inv.relatedInvoice.number, ncf: inv.relatedInvoice.ncf, type: inv.type === 'PURCHASE' ? 'PURCHASE' : 'SALE', total: '0', currency: inv.currency } as unknown as InvoiceRow] : []);
    this.form.patchValue({
      type: inv.type, partnerId: inv.partner.id, issueDate: isoDate(inv.issueDate), dueDate: isoDate(inv.dueDate), currency: inv.currency,
      exchangeRate: inv.currency === this.baseCurrency() ? null : Number(inv.exchangeRate), ncfType: inv.ncfType ?? '', ncf: inv.ncf ?? '',
      relatedInvoiceId: inv.relatedInvoiceId ?? '', dgiiExpenseType: inv.dgiiExpenseType ?? '', dgiiIncomeType: inv.dgiiIncomeType ?? '', notes: inv.notes ?? '',
    }, { emitEvent: false });
    this.form.controls.type.disable({ emitEvent: false });
    this.form.updateValueAndValidity();
    void this.loadRelated(inv.relatedInvoiceId);
  }

  private async loadRelated(keep?: string | null): Promise<void> {
    const v = this.form.getRawValue();
    if (!NOTE_TYPES.includes(v.type) || !v.partnerId) return;
    try {
      const all = await this.api.getAll<InvoiceRow>('/invoices', { partnerId: v.partnerId });
      const list = all.filter((r) => (r.type === 'SALE' || r.type === 'PURCHASE') && r.status !== 'DRAFT' && r.status !== 'VOIDED');
      const sel = keep ?? v.relatedInvoiceId;
      const old = this.relatedInvoices().find((r) => r.id === sel);
      this.relatedInvoices.set(old && !list.some((r) => r.id === old.id) ? [old, ...list] : list);
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

  private readonly partnerSig = signal('');
  /** Tipo de NCF por defecto del tercero elegido ('' si no tiene). */
  protected partnerDefaultNcf(): string {
    const id = this.partnerSig();
    return this.lookups.partners().find((x) => x.id === id)?.defaultNcfType ?? '';
  }

  protected async submit(issue: boolean): Promise<void> {
    this.form.markAllAsTouched();
    this.formError.set('');
    const v = this.form.getRawValue();
    if (this.saving()) return;
    if (this.form.invalid) { this.formError.set('Revisa los campos marcados en rojo.'); return; }
    if (this.isNote() && !v.relatedInvoiceId) { this.formError.set('Elige la factura que modifica esta nota.'); return; }
    const problems = this.calc().problems;
    if (problems.length) { this.formError.set(problems[0]); return; }
    if (this.side() === 'SALES' && !this.isNote() && !v.ncfType && !this.partnerDefaultNcf()) {
      this.formError.set('Elige el tipo de comprobante (NCF): este cliente no tiene uno por defecto.'); return;
    }

    const side = this.side();
    const body: Record<string, unknown> = clean({
      partnerId: v.partnerId, issueDate: v.issueDate, dueDate: v.dueDate, currency: v.currency,
      exchangeRate: this.foreign() && v.exchangeRate ? Number(v.exchangeRate) : '',
      ncfType: v.ncfType, ncf: side === 'PURCHASES' ? v.ncf.trim().toUpperCase() : '',
      relatedInvoiceId: this.isNote() ? v.relatedInvoiceId : '',
      dgiiExpenseType: side === 'PURCHASES' ? v.dgiiExpenseType : '', dgiiIncomeType: side === 'SALES' ? v.dgiiIncomeType : '',
      notes: v.notes.trim(),
      lines: v.lines.map((l) => clean({
        description: l.description.trim(), quantity: dec(l.quantity).toNumber(), unitPrice: dec(l.unitPrice).toNumber(),
        discount: dec(l.discount).toNumber(), taxRateId: l.taxRateId, accountId: l.accountId,
      })),
      withholdings: v.withholdings.map((w) => clean({ taxRateId: w.taxRateId, base: w.base === null || String(w.base) === '' ? '' : dec(w.base).toNumber() })),
    });
    const cur = this.current();
    if (cur) body['notes'] = v.notes.trim();
    this.saving.set(true);
    try {
      let saved: InvoiceFull;
      if (cur) {
        saved = await firstValueFrom(this.api.patch<InvoiceFull>(`/invoices/${cur.id}`, body));
        if (issue) saved = await firstValueFrom(this.api.post<InvoiceFull>(`/invoices/${cur.id}/issue`, {}));
      } else {
        saved = await firstValueFrom(this.api.post<InvoiceFull>('/invoices', { ...body, type: v.type, ...(issue ? { issueNow: true } : {}) }));
      }
      this.notify.ok(issue ? `Factura ${saved.number} emitida.` : cur ? 'Borrador actualizado.' : 'Borrador guardado.');
      await this.router.navigate(['/invoices', saved.id]);
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }
}
