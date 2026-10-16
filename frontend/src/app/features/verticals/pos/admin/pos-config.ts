import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../../core/api';
import { Auth } from '../../../../core/auth';
import { errorMessage } from '../../../../core/errors';
import { Lookups } from '../../../../core/lookups';
import { Notify } from '../../../../core/notify';
import { ComboOption, ErrorNotice, FieldHelp, UI } from '../../../../shared/ui';

interface Settings {
  defaultPartnerId: string; defaultNcfType: string; fiscalCreditNcfType: string; maxDiscountPct: string; cashOverShortAccountId: string | null;
  receiptFooter: string | null; defaultPartner: { id: string; name: string } | null;
}
interface Terminal { id: string; code: string; name: string; cashRegisterId: string; cardBankAccountId: string | null; transferBankAccountId: string | null; active: boolean }

/** Configuración del POS: ajustes de la caja, terminales y el PIN de supervisor. */
@Component({
  selector: 'app-pos-config',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, RouterLink, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Configuración del POS</h1><p class="sub">Cómo vende la caja: cliente por defecto, comprobantes, descuentos permitidos, terminales y PIN de supervisor.</p></div>
        <a class="btn btn-primary" routerLink="/pos/caja">Abrir la caja</a>
      </div>
      <app-error-notice [error]="error()" />

      @if (!loading() && !settings()) {
        <section class="panel panel-pad" style="margin-bottom:16px">
          <h2>Preparar el punto de venta</h2>
          <p class="dim" style="margin:6px 0 14px">Crea el cliente «Consumidor final» y los ajustes por defecto (B02 para consumo, B01 para crédito fiscal, 10 % de descuento sin PIN). Después podrás cambiarlos.</p>
          <button type="button" class="btn btn-primary" [disabled]="busy()" (click)="bootstrap()">Preparar</button>
        </section>
      }

      @if (settings(); as s) {
        <section class="panel" style="margin-bottom:16px">
          <div class="panel-head"><h2>Ajustes de la caja</h2></div>
          <form class="panel-pad form-grid" (ngSubmit)="save()">
            <div class="field span-2"><label for="s-p">Cliente de las ventas sin cliente</label>
              <app-combobox id="s-p" name="p" [(ngModel)]="form.defaultPartnerId" [options]="customerOptions()" /></div>
            <div class="field"><label for="s-n1">Comprobante por defecto</label><input id="s-n1" name="n1" class="input mono" maxlength="3" [(ngModel)]="form.defaultNcfType" /></div>
            <div class="field"><label for="s-n2">Comprobante de crédito fiscal</label><input id="s-n2" name="n2" class="input mono" maxlength="3" [(ngModel)]="form.fiscalCreditNcfType" /></div>
            <div class="field"><label for="s-d">Descuento sin PIN (%) <app-field-help key="pos.descuento" text="Un descuento manual mayor a este porcentaje de la línea pide el PIN de un supervisor." /></label>
              <input id="s-d" name="d" class="input num" type="number" min="0" max="100" step="0.5" [(ngModel)]="form.maxDiscountPct" /></div>
            <div class="field span-2"><label for="s-a">Sobrantes y faltantes de caja <app-field-help key="pos.sobrantes" text="Cuenta de gasto (o ingreso) donde va la diferencia entre lo contado y lo esperado al cerrar un turno." /></label>
              <app-combobox id="s-a" name="a" [(ngModel)]="form.cashOverShortAccountId" [options]="overShortOptions()" placeholder="Sin definir" /></div>
            <div class="field span-all"><label for="s-f">Pie del ticket</label><input id="s-f" name="f" class="input" maxlength="300" [(ngModel)]="form.receiptFooter" placeholder="Gracias por su compra" /></div>
            <div class="span-all btn-row"><button type="submit" class="btn btn-primary" [disabled]="busy()">Guardar ajustes</button></div>
          </form>
        </section>

        <section class="panel" style="margin-bottom:16px">
          <div class="panel-head"><h2>Terminales</h2><button type="button" class="btn btn-sm" (click)="editTerminal(null)">Nueva terminal</button></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Caja (efectivo)</th><th>Tarjeta</th><th>Transferencia</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @for (t of terminals(); track t.id) {
                <tr><td class="mono">{{ t.code }}</td><td>{{ t.name }}</td><td>{{ cashName(t.cashRegisterId) }}</td>
                  <td>{{ bankName(t.cardBankAccountId) }}</td><td>{{ bankName(t.transferBankAccountId) }}</td>
                  <td><app-status [value]="t.active ? 'ACTIVE' : 'INACTIVE'" [map]="ACTIVE" /></td>
                  <td class="actions"><button type="button" class="btn btn-ghost btn-sm" (click)="editTerminal(t)">Editar</button></td></tr>
              } @empty { <tr><td colspan="7" class="table-empty">Crea al menos una terminal: cada caja física es una terminal con su gaveta.</td></tr> }
            </tbody>
          </table></div>
        </section>
      }

      @if (isSupervisor) {
        <section class="panel">
          <div class="panel-head"><h2>Mi PIN de supervisor</h2></div>
          <form class="panel-pad" style="display:flex;gap:12px;align-items:flex-end;flex-wrap:wrap" (ngSubmit)="setPin()">
            <div class="field" style="width:200px"><label for="pin">PIN (4 a 6 números)</label><input id="pin" name="pin" class="input" type="password" inputmode="numeric" maxlength="6" [(ngModel)]="pin" /></div>
            <button type="submit" class="btn" [disabled]="!validPin()">Guardar PIN</button>
            <p class="hint" style="flex-basis:100%">Con tu correo y este PIN autorizas en la caja descuentos grandes, anulaciones, devoluciones y salidas de efectivo. Los cajeros son usuarios con el rol «Cajero» (en <a routerLink="/users">Usuarios</a>).</p>
          </form>
        </section>
      }
    </div>

    <app-modal [open]="!!editing()" [title]="editing()?.id ? 'Editar terminal' : 'Nueva terminal'" width="600px" (closed)="editing.set(null)">
      @if (editing(); as t) {
        <form id="t-form" class="form-grid" (ngSubmit)="saveTerminal()">
          <div class="field"><label for="t-c">Código</label><input id="t-c" name="c" class="input mono" [(ngModel)]="t.code" [disabled]="!!t.id" placeholder="CAJA-01" /></div>
          <div class="field span-2"><label for="t-n">Nombre</label><input id="t-n" name="n" class="input" [(ngModel)]="t.name" placeholder="Caja del mostrador" /></div>
          <div class="field span-all"><label for="t-r">Caja donde entra el efectivo</label>
            <select id="t-r" name="r" class="select" [(ngModel)]="t.cashRegisterId"><option value="">Elige…</option>
              @for (c of cashRegisters(); track c.id) { <option [value]="c.id">{{ c.name }}</option> }</select>
            <span class="hint">Las cajas se crean en «Bancos y caja». Debe tener cuenta contable.</span></div>
          <div class="field"><label for="t-k">Banco de las tarjetas</label>
            <select id="t-k" name="k" class="select" [(ngModel)]="t.cardBankAccountId"><option [ngValue]="null">No acepta tarjeta</option>
              @for (b of banks(); track b.id) { <option [ngValue]="b.id">{{ b.bankName }} {{ b.accountNumber }}</option> }</select></div>
          <div class="field"><label for="t-x">Banco de las transferencias</label>
            <select id="t-x" name="x" class="select" [(ngModel)]="t.transferBankAccountId"><option [ngValue]="null">No acepta transferencia</option>
              @for (b of banks(); track b.id) { <option [ngValue]="b.id">{{ b.bankName }} {{ b.accountNumber }}</option> }</select></div>
          @if (t.id) { <label class="check span-all"><input type="checkbox" name="a" [(ngModel)]="t.active" /> Activa</label> }
        </form>
        @if (tError()) { <app-error-notice style="display:block;margin-top:12px" [error]="tError()" /> }
      }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="editing.set(null)">Cancelar</button>
        <button type="submit" form="t-form" class="btn btn-primary" [disabled]="busy()">Guardar</button>
      </ng-container>
    </app-modal>
  `,
})
export class PosConfigPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);
  protected readonly isSupervisor = inject(Auth).has('ADMIN', 'ACCOUNTANT', 'APPROVER');
  protected readonly ACTIVE: Record<string, string> = { ACTIVE: 'Activa', INACTIVE: 'Inactiva' };
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly settings = signal<Settings | null>(null);
  protected readonly terminals = signal<Terminal[]>([]);
  protected readonly editing = signal<Partial<Terminal> | null>(null);
  protected readonly tError = signal<unknown>('');
  protected form = { defaultPartnerId: '', defaultNcfType: 'B02', fiscalCreditNcfType: 'B01', maxDiscountPct: 10, cashOverShortAccountId: null as string | null, receiptFooter: '' };
  protected pin = '';
  protected validPin(): boolean { return /^\d{4,6}$/.test(this.pin); }

  protected readonly cashRegisters = computed(() => this.lookups.cashRegisters().filter((c) => c.active));
  protected readonly banks = computed(() => this.lookups.bankAccounts().filter((b) => b.active));
  protected readonly customerOptions = computed<ComboOption[]>(() => this.lookups.partners().filter((p) => p.active && p.type !== 'SUPPLIER').map((p) => ({ value: p.id, label: p.name, hint: p.taxId ?? undefined })));
  protected readonly overShortOptions = computed<ComboOption[]>(() => this.lookups.accounts().filter((a) => a.active && a.isPostable && ['EXPENSE', 'INCOME'].includes(a.type)).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` })));

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const [s, t] = await Promise.all([
        this.api.getP<Settings | null>('/pos/settings'), this.api.getP<Terminal[]>('/pos/terminals'),
        this.lookups.ensurePartners(), this.lookups.ensureAccounts(), this.lookups.ensureBankAccounts(), this.lookups.ensureCashRegisters(),
      ]);
      this.settings.set(s); this.terminals.set(t);
      if (s) this.form = { defaultPartnerId: s.defaultPartnerId, defaultNcfType: s.defaultNcfType, fiscalCreditNcfType: s.fiscalCreditNcfType, maxDiscountPct: Number(s.maxDiscountPct), cashOverShortAccountId: s.cashOverShortAccountId, receiptFooter: s.receiptFooter ?? '' };
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected cashName(id: string) { return this.lookups.cashRegisters().find((c) => c.id === id)?.name ?? '—'; }
  protected bankName(id: string | null) { const b = this.lookups.bankAccounts().find((x) => x.id === id); return b ? `${b.bankName} ${b.accountNumber}` : '—'; }

  protected async bootstrap(): Promise<void> {
    this.busy.set(true);
    try { await firstValueFrom(this.api.post('/pos/settings/bootstrap')); await this.lookups.ensurePartners(true); this.notify.ok('Punto de venta preparado.'); await this.load(); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }
  protected async save(): Promise<void> {
    this.busy.set(true);
    try {
      await firstValueFrom(this.api.put('/pos/settings', {
        ...this.form, defaultNcfType: this.form.defaultNcfType.toUpperCase(), fiscalCreditNcfType: this.form.fiscalCreditNcfType.toUpperCase(),
        maxDiscountPct: Number(this.form.maxDiscountPct), receiptFooter: this.form.receiptFooter.trim() || null,
      }));
      this.notify.ok('Ajustes guardados.'); await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }
  protected editTerminal(t: Terminal | null): void {
    this.tError.set('');
    this.editing.set(t ? { ...t } : { code: '', name: '', cashRegisterId: '', cardBankAccountId: null, transferBankAccountId: null, active: true });
  }
  protected async saveTerminal(): Promise<void> {
    const t = this.editing();
    if (!t) return;
    this.busy.set(true); this.tError.set('');
    try {
      if (t.id) await firstValueFrom(this.api.patch(`/pos/terminals/${t.id}`, { name: t.name, cashRegisterId: t.cashRegisterId, cardBankAccountId: t.cardBankAccountId, transferBankAccountId: t.transferBankAccountId, active: t.active }));
      else await firstValueFrom(this.api.post('/pos/terminals', { code: t.code, name: t.name, cashRegisterId: t.cashRegisterId, ...(t.cardBankAccountId ? { cardBankAccountId: t.cardBankAccountId } : {}), ...(t.transferBankAccountId ? { transferBankAccountId: t.transferBankAccountId } : {}) }));
      this.notify.ok('Terminal guardada.'); this.editing.set(null); await this.load();
    } catch (e) { this.tError.set(e); }
    this.busy.set(false);
  }
  protected async setPin(): Promise<void> {
    try { await firstValueFrom(this.api.put('/pos/pin', { pin: this.pin })); this.pin = ''; this.notify.ok('PIN guardado.'); } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
