import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { firstValueFrom, startWith } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Lookups } from '../../core/lookups';
import { Company, Partner } from '../../core/models';
import { Notify } from '../../core/notify';
import { clean, dec, sumDec, today } from '../../shared/format';
import { opts } from '../../shared/labels';
import { ComboOption, ErrorNotice, UI } from '../../shared/ui';
import { ReadinessNotice } from '../../shared/ui/readiness-notice';
import { PartnerDialog } from '../catalog/partner-dialog';
import { autoDistribute, loadOpenInvoices, OpenInvoice, toAllocations } from './payment-shared';

@Component({
  selector: 'app-payment-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, PartnerDialog, ErrorNotice, ReadinessNotice, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>{{ received() ? 'Nuevo cobro' : 'Nuevo pago' }}</h1><p class="sub">{{ received() ? 'Registra el dinero que recibes de un cliente.' : 'Registra el dinero que entregas a un proveedor.' }}</p></div>
        <a routerLink="/payments" class="btn">Volver al listado</a>
      </div>

      <app-readiness-notice [needs]="['accounting', 'money']" action="Para registrar cobros y pagos" />
      <form [formGroup]="form" (ngSubmit)="save()" novalidate>
        <section class="panel panel-pad">
          <div class="form-grid">
            <div class="field"><label for="p-dir">Tipo</label>
              <select id="p-dir" class="select" formControlName="direction">@for (o of dirOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
            <div class="field span-2"><span class="label">{{ received() ? 'Cliente' : 'Proveedor' }}</span>
              <app-combobox formControlName="partnerId" [options]="partnerOptions()" [clearable]="false" placeholder="Buscar por nombre o RNC" />
              @if (form.controls.partnerId.touched && form.controls.partnerId.invalid) { <span class="error-text">{{ received() ? 'Elige el cliente.' : 'Elige el proveedor.' }}</span> }
              <div class="btn-row" style="margin-top:6px">
                @if (canEdit) {
                  <button type="button" class="btn btn-ghost btn-sm" (click)="openCreatePartner()">Crear</button>
                  <button type="button" class="btn btn-ghost btn-sm" [disabled]="!selectedPartner()" (click)="openEditPartner()">Editar</button>
                }
                <a class="btn btn-ghost btn-sm" href="/partners" target="_blank" rel="noopener">Ir a clientes y proveedores</a>
                <button type="button" class="btn btn-ghost btn-sm" (click)="refreshPartners()">Actualizar lista</button>
              </div></div>
            <div class="field"><label for="p-date">Fecha</label><input id="p-date" class="input" type="date" formControlName="date" />
              @if (form.controls.date.touched && form.controls.date.invalid) { <span class="error-text">Indica la fecha.</span> }</div>
            <div class="field"><label for="p-method">Método</label>
              <select id="p-method" class="select" formControlName="method">@for (o of methodOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
            <div class="field span-2"><span class="label">{{ received() ? 'Depositar en' : 'Pagar desde' }}</span>
              <app-combobox formControlName="source" [options]="sourceOptions()" [clearable]="false" placeholder="Cuenta bancaria o caja" />
              @if (form.controls.source.touched && form.controls.source.invalid) { <span class="error-text">Elige la cuenta bancaria o la caja.</span> }</div>
            <div class="field"><label for="p-amount">Monto {{ currency() }}</label><input id="p-amount" class="input num" type="number" min="0.01" step="0.01" formControlName="amount" />
              @if (form.controls.amount.touched && form.controls.amount.invalid) { <span class="error-text">El monto debe ser mayor que cero.</span> }</div>
            @if (foreign()) {
              <div class="field"><label for="p-rate">Tasa de cambio</label><input id="p-rate" class="input num" type="number" min="0" step="0.000001" formControlName="exchangeRate" />
                <span class="hint">Déjala vacía para usar la tasa registrada de la fecha.</span></div>
            }
            <div class="field"><label for="p-ref">Referencia</label><input id="p-ref" class="input mono" formControlName="reference" maxlength="100" placeholder="Nº de cheque o transferencia" /></div>
            <div class="field span-all"><label for="p-notes">Notas</label><textarea id="p-notes" class="textarea" formControlName="notes" maxlength="1000"></textarea></div>
          </div>
        </section>

        <section class="panel" style="margin-top:16px">
          <div class="panel-head">
            <h2>Aplicar a facturas</h2>
            <button type="button" class="btn btn-sm" [disabled]="!open().length || !(amountNum() > 0)" (click)="auto()">Aplicar automáticamente</button>
          </div>
          @if (!partnerId()) {
            <p class="dim panel-pad">{{ received() ? 'Elige el cliente' : 'Elige el proveedor' }} para ver sus facturas pendientes.</p>
          } @else if (!source()) {
            <p class="dim panel-pad">Elige la cuenta bancaria o la caja: las facturas se muestran en su moneda.</p>
          } @else if (loadingOpen()) {
            <div class="loading"><span class="spinner"></span> Cargando facturas…</div>
          } @else {
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Factura</th><th>Emisión</th><th>Vence</th><th class="num">Total</th><th class="num">Saldo pendiente</th><th class="num">Monto a aplicar</th></tr></thead>
                <tbody>
                  @for (i of open(); track i.id) {
                    <tr>
                      <td><a class="mono" [routerLink]="['/invoices', i.id]" target="_blank">{{ i.number }}</a>@if (i.ncf) { <div class="dim mono">{{ i.ncf }}</div> }</td>
                      <td>{{ i.issueDate | fdate }}</td>
                      <td>{{ i.dueDate | fdate }} @if (i.status === 'OVERDUE') { <span class="badge neg">Vencida</span> }</td>
                      <td class="num">{{ i.total | money }}</td>
                      <td class="num">{{ i.balance | money }}</td>
                      <td class="num"><input class="input num" type="number" min="0" step="0.01" [attr.aria-label]="'Monto a aplicar a ' + i.number"
                        [value]="alloc()[i.id] ?? ''" (input)="setAlloc(i, $any($event.target).value)" /></td>
                    </tr>
                  } @empty {
                    <tr><td colspan="6" class="table-empty">{{ partnerName() }} no tiene facturas pendientes en {{ currency() }}. Todo el monto quedará como anticipo.</td></tr>
                  }
                </tbody>
                <tfoot>
                  <tr><td colspan="5">Aplicado a facturas</td><td class="num">{{ allocated() | money }}</td></tr>
                  <tr><td colspan="5">Anticipo (lo que sobra del monto)</td><td class="num">{{ advance() | money }}</td></tr>
                </tfoot>
              </table>
            </div>
          }
          @if (overApplied()) { <div class="notice neg" style="margin:14px" role="alert">Lo aplicado a facturas supera el monto del {{ received() ? 'cobro' : 'pago' }}. Reduce los montos o aumenta el monto total.</div> }
          @if (advance().gt(0) && allocated().isZero() && open().length && !overApplied()) {
            <div class="notice info" style="margin:14px">No aplicaste nada a facturas: el monto completo se registrará como anticipo y podrás aplicarlo después desde el detalle.</div>
          }
        </section>

        @if (formError()) { <app-error-notice style="display:block;margin-top:14px" [error]="formError()" /> }
        <div class="btn-row" style="margin-top:16px">
          <button type="submit" class="btn btn-primary" [disabled]="saving() || overApplied()">{{ saving() ? 'Guardando…' : (received() ? 'Registrar cobro' : 'Registrar pago') }}</button>
          <a routerLink="/payments" class="btn">Cancelar</a>
        </div>
      </form>
    </div>

    <app-partner-dialog [open]="partnerDialog()" [partner]="editingPartner()" [defaultType]="received() ? 'CUSTOMER' : 'SUPPLIER'" (saved)="onPartnerSaved($event)" (closed)="partnerDialog.set(false)" />
  `,
})
export class PaymentForm {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  protected readonly dirOptions = opts.paymentDirection;
  protected readonly methodOptions = opts.paymentMethod;
  protected readonly saving = signal(false);
  protected readonly formError = signal<unknown>('');
  protected readonly loadingOpen = signal(false);
  protected readonly open = signal<OpenInvoice[]>([]);
  protected readonly alloc = signal<Record<string, string>>({});
  private readonly baseCurrency = signal('DOP');

  protected readonly form = this.fb.nonNullable.group({
    direction: ['RECEIVED', Validators.required],
    partnerId: [null as string | null, Validators.required],
    date: [today(), Validators.required],
    method: ['BANK_TRANSFER', Validators.required],
    source: [null as string | null, Validators.required],
    amount: [null as number | null, [Validators.required, Validators.min(0.01)]],
    exchangeRate: [null as number | null],
    reference: [''],
    notes: [''],
  });

  private readonly direction = toSignal(this.form.controls.direction.valueChanges.pipe(startWith(this.form.controls.direction.value)), { initialValue: 'RECEIVED' });
  protected readonly partnerId = toSignal(this.form.controls.partnerId.valueChanges.pipe(startWith(this.form.controls.partnerId.value)), { initialValue: null });
  protected readonly source = toSignal(this.form.controls.source.valueChanges.pipe(startWith(this.form.controls.source.value)), { initialValue: null });
  private readonly amountRaw = toSignal(this.form.controls.amount.valueChanges.pipe(startWith(this.form.controls.amount.value)), { initialValue: null });

  protected readonly received = computed(() => this.direction() === 'RECEIVED');
  protected readonly amountNum = computed(() => Number(this.amountRaw() ?? 0));

  protected readonly partnerOptions = computed<ComboOption[]>(() => {
    const received = this.received();
    return this.lookups.partners()
      .filter((p) => p.active && (received ? p.type !== 'SUPPLIER' : p.type !== 'CUSTOMER'))
      .map((p) => ({ value: p.id, label: p.name, hint: p.taxId ?? undefined }));
  });
  protected readonly sourceOptions = computed<ComboOption[]>(() => [
    ...this.lookups.bankAccounts().filter((b) => b.active).map((b) => ({ value: `bank:${b.id}`, label: `${b.bankName} · ${b.accountNumber}`, hint: `Banco · ${b.currency}` })),
    ...this.lookups.cashRegisters().filter((c) => c.active).map((c) => ({ value: `cash:${c.id}`, label: c.name, hint: `Caja · ${c.currency}` })),
  ]);
  protected readonly currency = computed(() => {
    const s = this.source();
    if (!s) return this.baseCurrency();
    const id = s.slice(5);
    return (s.startsWith('bank:') ? this.lookups.bankAccounts().find((b) => b.id === id)?.currency : this.lookups.cashRegisters().find((c) => c.id === id)?.currency) ?? this.baseCurrency();
  });
  protected readonly foreign = computed(() => this.currency() !== this.baseCurrency());
  protected readonly partnerName = computed(() => this.lookups.partnerName(this.partnerId()) || (this.received() ? 'El cliente' : 'El proveedor'));

  // Crear / editar cliente o proveedor sin salir del formulario (lo escrito no se toca).
  protected readonly partnerDialog = signal(false);
  protected readonly editingPartner = signal<Partner | null>(null);
  protected readonly selectedPartner = computed(() => this.lookups.partners().find((x) => x.id === this.partnerId()) ?? null);
  protected openCreatePartner(): void { this.editingPartner.set(null); this.partnerDialog.set(true); }
  protected openEditPartner(): void {
    const p = this.selectedPartner();
    if (!p) return;
    this.editingPartner.set(p);
    this.partnerDialog.set(true);
  }
  protected onPartnerSaved(p: Partner): void {
    this.partnerDialog.set(false);
    const fits = this.received() ? p.type !== 'SUPPLIER' : p.type !== 'CUSTOMER';
    if (!this.editingPartner()) {
      if (fits) this.form.controls.partnerId.setValue(p.id);
      else this.notify.info(`Se guardó ${p.name} como ${p.type === 'SUPPLIER' ? 'proveedor' : 'cliente'}; en ${this.received() ? 'un cobro solo se pueden elegir clientes' : 'un pago solo se pueden elegir proveedores'}. Edítalo y márcalo como ${this.received() ? 'cliente' : 'proveedor'} o ambos.`);
    } else if (!fits) {
      this.form.controls.partnerId.setValue(null);
      this.notify.info(`${p.name} ya no es ${this.received() ? 'cliente' : 'proveedor'}, así que se quitó. Elige otro.`);
    }
  }
  protected refreshPartners(): void { void this.lookups.ensurePartners(true); }

  protected readonly allocated = computed(() => sumDec(Object.values(this.alloc())));
  protected readonly advance = computed(() => dec(this.amountRaw()).minus(this.allocated()));
  protected readonly overApplied = computed(() => this.advance().lt(0));

  constructor() {
    void this.lookups.ensureAll();
    void this.api.getP<Company>('/company').then((c) => this.baseCurrency.set(c.baseCurrency)).catch(() => undefined);
    const qp = this.route.snapshot.queryParamMap;
    if (qp.get('direction') === 'MADE') this.form.controls.direction.setValue('MADE');

    // Al cambiar de tipo, el cliente / proveedor elegido puede no corresponder.
    this.form.controls.direction.valueChanges.subscribe(() => { this.form.controls.partnerId.reset(null); });

    // Recarga las facturas abiertas cuando cambian cliente / proveedor, tipo o moneda.
    effect(() => {
      const partner = this.partnerId(); const dir = this.direction() as 'RECEIVED' | 'MADE'; const cur = this.currency(); const hasSource = !!this.source();
      untracked(() => void this.loadOpen(partner, dir, cur, hasSource));
    });
  }

  private async loadOpen(partner: string | null, dir: 'RECEIVED' | 'MADE', cur: string, hasSource: boolean): Promise<void> {
    this.alloc.set({});
    this.open.set([]);
    if (!partner || !hasSource) return;
    this.loadingOpen.set(true);
    try { this.open.set(await loadOpenInvoices(this.api, partner, dir, cur)); }
    catch (e) { this.formError.set(e); }
    this.loadingOpen.set(false);
  }

  protected setAlloc(i: OpenInvoice, raw: string): void {
    this.alloc.update((a) => {
      const next = { ...a };
      const v = dec(raw);
      if (v.lte(0)) delete next[i.id];
      else next[i.id] = (v.gt(dec(i.balance)) ? dec(i.balance) : v).toString();
      return next;
    });
  }
  protected auto(): void { this.alloc.set(autoDistribute(this.open(), this.amountRaw() ?? 0)); }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving() || this.overApplied()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const src = v.source ?? '';
    const allocations = toAllocations(this.alloc());
    const body = clean({
      direction: v.direction, partnerId: v.partnerId, date: v.date, amount: Number(v.amount), method: v.method, currency: this.currency(),
      exchangeRate: this.foreign() && v.exchangeRate ? Number(v.exchangeRate) : '',
      reference: v.reference.trim(), notes: v.notes.trim(),
      bankAccountId: src.startsWith('bank:') ? src.slice(5) : '',
      cashRegisterId: src.startsWith('cash:') ? src.slice(5) : '',
      allocations: allocations.length ? allocations : undefined,
    });
    try {
      const res = await firstValueFrom(this.api.post<{ id: string }>('/payments', body));
      this.notify.ok(v.direction === 'RECEIVED' ? 'Cobro registrado.' : 'Pago registrado.');
      await this.router.navigate(['/payments', res.id]);
    } catch (e) { this.formError.set(e); }
    this.saving.set(false);
  }
}
