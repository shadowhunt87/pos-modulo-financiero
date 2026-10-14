import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean, dec, isoDate, sumDec } from '../../shared/format';
import { ENTRY_STATUS, INVOICE_STATUS, INVOICE_TYPE, PAYMENT_METHOD, PAYMENT_STATUS } from '../../shared/labels';
import { AttachmentsPanel, UI } from '../../shared/ui';
import { DGII_EXPENSE_TYPE, DGII_INCOME_TYPE, InvoiceFull, NcfType, VOID_REASON_CODE } from './invoice-types';

interface PaymentLite {
  id: string; number: string | null; date: string; direction: string; method: string; status: string;
  allocations: { invoiceId: string; amount: string }[];
}
interface AppliedPayment { payment: PaymentLite; amount: string }

// Serie E fuera mientras no haya proveedor e-CF conectado: el backend la rechaza (PLAN-v0.3 §7.1)
const SALES_NCF = ['B01', 'B02', 'B12', 'B14', 'B15', 'B16'];
const OPEN = ['ISSUED', 'PARTIALLY_PAID', 'OVERDUE'];

/**
 * Detalle de una factura: líneas, impuestos, asiento, pagos aplicados y acciones según estado y rol.
 * GET /invoices/:id, POST /invoices/:id/issue, POST /invoices/:id/void, DELETE /invoices/:id, GET /payments (+ detalle) para los pagos aplicados.
 */
@Component({
  selector: 'app-invoice-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, AttachmentsPanel, ...UI],
  templateUrl: './invoice-detail.html',
})
export class InvoiceDetail {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);
  private readonly auth = inject(Auth);

  readonly id = input.required<string>();

  protected readonly INVOICE_TYPE = INVOICE_TYPE;
  protected readonly INVOICE_STATUS = INVOICE_STATUS;
  protected readonly ENTRY_STATUS = ENTRY_STATUS;
  protected readonly PAYMENT_METHOD = PAYMENT_METHOD;
  protected readonly PAYMENT_STATUS = PAYMENT_STATUS;
  protected readonly DGII_EXPENSE_TYPE = DGII_EXPENSE_TYPE;
  protected readonly DGII_INCOME_TYPE = DGII_INCOME_TYPE;
  protected readonly voidCodes = Object.entries(VOID_REASON_CODE);

  protected readonly canWrite = this.auth.has('ADMIN', 'ACCOUNTANT');
  protected readonly canVoid = this.auth.has('ADMIN', 'APPROVER');
  protected readonly canAttach = this.auth.has('ADMIN', 'ACCOUNTANT', 'APPROVER');

  protected readonly inv = signal<InvoiceFull | null>(null);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly payments = signal<AppliedPayment[]>([]);
  protected readonly paymentsNote = signal('');
  protected readonly ncfTypes = signal<NcfType[]>([]);
  protected readonly busy = signal(false);

  protected readonly isDraft = computed(() => this.inv()?.status === 'DRAFT');
  protected readonly isOpen = computed(() => OPEN.includes(this.inv()?.status ?? ''));
  protected readonly isNote = computed(() => ['CREDIT_NOTE', 'DEBIT_NOTE'].includes(this.inv()?.type ?? ''));
  protected readonly canMakeNote = computed(() => this.canWrite && this.isOpen() && ['SALE', 'PURCHASE'].includes(this.inv()?.type ?? ''));
  /** Comprobante electrónico: no se anula; se corrige con una nota E34 emitida en el portal e importada. */
  protected readonly isEcf = computed(() => !!this.inv()?.ncf?.startsWith('E'));
  protected readonly isPurchase = computed(() => this.inv()?.type === 'PURCHASE');
  protected readonly salesNcf = computed(() => this.ncfTypes().filter((n) => SALES_NCF.includes(n.code)));
  protected readonly lineTotal = computed(() => sumDec(this.inv()?.lines.map((l) => l.total) ?? []).toFixed(2));
  protected readonly paidDisplay = computed(() => dec(this.inv()?.amountPaid).toFixed(2));
  /** El código de anulación DGII es obligatorio cuando el comprobante lo emitió la empresa. */
  protected readonly needsVoidCode = computed(() => {
    const i = this.inv();
    return !!i?.ncf && (['B11', 'B13', 'B17', 'E41', 'E43', 'E47'].includes(i.ncfType ?? '') || i.type !== 'PURCHASE');
  });

  protected readonly issueOpen = signal(false);
  protected readonly voidOpen = signal(false);
  protected readonly actionError = signal('');
  protected readonly issueForm = this.fb.nonNullable.group({ ncfType: [''], ncf: ['', Validators.maxLength(13)] });
  protected readonly voidForm = this.fb.nonNullable.group({ reason: ['', [Validators.required, Validators.maxLength(500)]], reasonCode: [''] });

  constructor() {
    effect(() => { const id = this.id(); untracked(() => void this.load(id)); });
  }

  private async load(id: string): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [inv, ncf] = await Promise.all([
        this.api.getP<InvoiceFull>(`/invoices/${id}`), this.api.getP<NcfType[]>('/ncf/types'),
        this.lookups.ensureAccounts(), this.lookups.ensureTaxRates(),
      ]);
      this.inv.set(inv); this.ncfTypes.set(ncf);
      void this.loadPayments(inv);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  /** El backend no filtra pagos por factura: se revisan los pagos del tercero desde la fecha de emisión. */
  private async loadPayments(inv: InvoiceFull): Promise<void> {
    this.payments.set([]); this.paymentsNote.set('');
    if (dec(inv.amountPaid).isZero()) return;
    try {
      const list = await this.api.getAll<{ id: string; status: string }>('/payments', { partnerId: inv.partner.id, from: isoDate(inv.issueDate) });
      const live = list.filter((p) => p.status !== 'VOIDED');
      if (live.length > 60) this.paymentsNote.set('Hay muchos pagos de este tercero: se muestran solo los primeros 60 revisados.');
      const details = await Promise.all(live.slice(0, 60).map((p) => this.api.getP<PaymentLite>(`/payments/${p.id}`)));
      this.payments.set(details.flatMap((p) => p.allocations.filter((a) => a.invoiceId === inv.id).map((a) => ({ payment: p, amount: a.amount }))));
    } catch { this.paymentsNote.set('No se pudo cargar el detalle de los pagos aplicados.'); }
  }

  protected print(): void { window.print(); }

  protected openIssue(): void {
    const i = this.inv();
    if (!i) return;
    this.actionError.set('');
    this.issueForm.reset({ ncfType: i.type === 'SALE' ? (i.ncfType ?? i.partner.defaultNcfType ?? '') : (i.ncfType ?? ''), ncf: i.ncf ?? '' });
    this.issueOpen.set(true);
  }
  protected async issue(): Promise<void> {
    const i = this.inv();
    if (!i || this.busy()) return;
    const v = this.issueForm.getRawValue();
    if (i.type === 'SALE' && !v.ncfType) { this.actionError.set('Elige el tipo de comprobante (NCF) de la venta.'); return; }
    if (i.type === 'PURCHASE' && !v.ncf.trim() && !v.ncfType) { this.actionError.set('Escribe el NCF del proveedor o elige un comprobante propio (B11, B13 o B17).'); return; }
    this.busy.set(true); this.actionError.set('');
    try {
      const body = clean({ ncfType: i.type === 'SALE' || i.type === 'PURCHASE' ? v.ncfType : '', ncf: i.type === 'SALE' ? '' : v.ncf.trim().toUpperCase() });
      const res = await firstValueFrom(this.api.post<InvoiceFull>(`/invoices/${i.id}/issue`, body));
      this.inv.set(res); this.issueOpen.set(false);
      this.notify.ok(`Factura ${res.number} emitida.`);
      void this.loadPayments(res);
    } catch (e) { this.actionError.set(errorMessage(e)); }
    this.busy.set(false);
  }

  protected openVoid(): void {
    this.actionError.set('');
    this.voidForm.reset({ reason: '', reasonCode: '' });
    this.voidOpen.set(true);
  }
  protected async doVoid(): Promise<void> {
    const i = this.inv();
    this.voidForm.markAllAsTouched();
    if (!i || this.busy() || this.voidForm.invalid) return;
    const v = this.voidForm.getRawValue();
    if (this.needsVoidCode() && !v.reasonCode) { this.actionError.set('Elige el código de anulación DGII: es obligatorio para comprobantes emitidos por ti.'); return; }
    this.busy.set(true); this.actionError.set('');
    try {
      const res = await firstValueFrom(this.api.post<InvoiceFull>(`/invoices/${i.id}/void`, clean({ reason: v.reason.trim(), reasonCode: v.reasonCode })));
      this.inv.set(res); this.voidOpen.set(false);
      this.notify.ok('Factura anulada y asiento revertido.');
    } catch (e) { this.actionError.set(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async remove(): Promise<void> {
    const i = this.inv();
    if (!i) return;
    if (!(await this.confirm.ask({ title: 'Eliminar borrador', message: 'El borrador se borra por completo y no se puede recuperar.', confirmText: 'Eliminar borrador', danger: true }))) return;
    try {
      await new Promise<void>((ok, bad) => this.api.delete(`/invoices/${i.id}`).subscribe({ next: () => ok(), error: bad }));
      this.notify.ok('Borrador eliminado.');
      await this.router.navigate(['/invoices']);
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

  protected accountName(id: string | null): string { return this.lookups.accountName(id); }
}
