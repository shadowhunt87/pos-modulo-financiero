import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { INVOICE_TYPE } from '../../shared/labels';
import { ErrorNotice, FieldHelp, UI } from '../../shared/ui';
import { DGII_EXPENSE_TYPE, DGII_INCOME_TYPE } from '../sales/invoice-types';

interface Preview {
  type: string; side: 'SALES' | 'PURCHASES'; ecfType: string; eNcf: string; issueDate: string; issuerRnc: string;
  partner: { id: string | null; name: string; taxId: string | null; isNew: boolean };
  relatedNcf: string | null; incomeType: string | null;
  lines: { description: string; quantity: string; unitPrice: string; itbisRate: number | null }[];
  totals: { subtotal: string; itbis: string; total: string; xmlTotal: string };
  errors: string[]; warnings: string[]; canImport: boolean;
}
interface Prepared { importId: string | null; fileName: string; error?: string; preview?: Preview }
interface Item extends Prepared { classification: string; state: 'ready' | 'importing' | 'done' | 'blocked'; invoiceId?: string; actionError?: unknown }

const MAX_FILES = 10;
const MAX_BYTES = 1024 * 1024;

/**
 * Importar XML de e-CF (PLAN-v0.3 §7.4): se suben hasta 10, se revisan y se confirma cada uno.
 * POST /ecf/import (multipart, campo files), POST /ecf/import/:id/confirm, DELETE /ecf/import/:id.
 */
@Component({
  selector: 'app-ecf-import',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ErrorNotice, FieldHelp, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Importar facturas electrónicas</h1>
          <p class="sub">Sube los XML de los e-CF que recibiste de tus suplidores o que emitiste en el portal de tu proveedor. Primero verás lo que se registrará; nada se guarda hasta que confirmes.</p></div>
      </div>

      @if (canWrite) {
        <section class="panel panel-pad drop">
          <label class="btn btn-primary" for="xml-files">Elegir archivos XML</label>
          <input id="xml-files" type="file" accept=".xml,text/xml,application/xml" multiple (change)="pick($event)" class="sr-only" />
          <p class="hint">Hasta {{ MAX_FILES }} archivos a la vez, de hasta 1 MB cada uno.</p>
          @if (uploading()) { <div class="loading"><span class="spinner"></span> Revisando…</div> }
          <app-error-notice [error]="uploadError()" />
        </section>
      } @else {
        <div class="notice info" role="status">Tu rol permite ver, pero no importar. Pídeselo a un administrador o al contador.</div>
      }

      @if (!items().length && !uploading()) {
        <div class="panel empty" style="margin-top:16px">
          <h3>Aún no has subido XML</h3>
          <p>El XML es el archivo que te entrega el portal de facturación electrónica de tu proveedor, o el que te envía tu suplidor junto a su factura.</p>
        </div>
      }

      @for (it of items(); track it.fileName + $index; let n = $index) {
        <section class="panel panel-pad card" [attr.aria-label]="'Archivo ' + it.fileName">
          <h2 class="file">{{ it.fileName }}</h2>
          @if (it.error) { <div class="notice neg" role="alert">{{ it.error }}</div> }
          @if (it.preview; as p) {
            @if (it.state === 'done') {
              <div class="notice pos" role="status">Importada y contabilizada. <a [routerLink]="['/invoices', it.invoiceId]">Ver la factura</a></div>
            } @else {
              <dl class="kv">
                <dt>Se registrará como</dt>
                <dd><strong>{{ p.type | lbl: INVOICE_TYPE }}</strong> · <span class="mono">{{ p.eNcf }}</span> · {{ p.issueDate | fdate }}</dd>
                <dt>{{ p.side === 'SALES' ? 'Cliente' : 'Proveedor' }}</dt>
                <dd>{{ p.partner.name }}@if (p.partner.taxId) { <span class="mono dim"> · {{ p.partner.taxId }}</span> }
                  @if (p.partner.isNew) { <span class="badge info">Se creará</span> }</dd>
                @if (p.relatedNcf) { <dt>Modifica la factura</dt><dd class="mono">{{ p.relatedNcf }}</dd> }
                <dt>Total</dt>
                <dd>{{ p.totals.total | money }} <span class="dim">(subtotal {{ p.totals.subtotal | money }} + ITBIS {{ p.totals.itbis | money }}; el XML dice {{ p.totals.xmlTotal | money }})</span></dd>
                <dt>Líneas</dt><dd>{{ p.lines.length }}</dd>
              </dl>
              @if (p.errors.length) {
                <div class="notice neg" role="alert" style="margin-top:10px"><div><strong>No se puede importar:</strong>
                  <ul>@for (e of p.errors; track e) { <li>{{ e }}</li> }</ul></div></div>
              }
              @if (p.warnings.length) {
                <div class="notice warn" role="status" style="margin-top:10px"><div><ul>@for (w of p.warnings; track w) { <li>{{ w }}</li> }</ul></div></div>
              }
              @if (p.canImport && canWrite) {
                <div class="form-grid" style="margin-top:12px">
                  <div class="field">
                    @if (p.side === 'PURCHASES') {
                      <label [for]="'cls' + n">Tipo de gasto (606) <app-field-help key="ecf.tipoGasto" text="La DGII pide clasificar cada compra en el 606. Si no sabes cuál, pregúntale a tu contadora; se puede cambiar después." /></label>
                      <select [id]="'cls' + n" class="select" [value]="it.classification" (change)="setClass(n, $event)">
                        <option value="">Sin clasificar</option>
                        @for (t of expenseTypes; track t[0]) { <option [value]="t[0]">{{ t[0] }} · {{ t[1] }}</option> }
                      </select>
                    } @else {
                      <label [for]="'cls' + n">Tipo de ingreso (607)</label>
                      <select [id]="'cls' + n" class="select" [value]="it.classification" (change)="setClass(n, $event)">
                        @for (t of incomeTypes; track t[0]) { <option [value]="t[0]">{{ t[0] }} · {{ t[1] }}</option> }
                      </select>
                    }
                  </div>
                </div>
                <app-error-notice [error]="it.actionError ?? null" />
                <div class="btn-row" style="margin-top:12px">
                  <button type="button" class="btn btn-primary" (click)="confirm(n)" [disabled]="it.state === 'importing'">
                    {{ it.state === 'importing' ? 'Importando…' : 'Importar y contabilizar' }}</button>
                  <button type="button" class="btn" (click)="discard(n)" [disabled]="it.state === 'importing'">Descartar</button>
                </div>
              } @else if (canWrite && it.importId) {
                <div class="btn-row" style="margin-top:12px"><button type="button" class="btn" (click)="discard(n)">Quitar de la lista</button></div>
              }
            }
          }
        </section>
      }
    </div>
  `,
  styles: `
    .drop { display: flex; flex-direction: column; align-items: flex-start; gap: 8px; }
    .sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
    .card { margin-top: 16px; }
    .file { font-size: 1rem; margin: 0 0 10px; overflow-wrap: anywhere; }
    .card ul { margin: 6px 0 0; padding-left: 18px; }
  `,
})
export class EcfImport {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  protected readonly canWrite = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  protected readonly INVOICE_TYPE = INVOICE_TYPE;
  protected readonly MAX_FILES = MAX_FILES;
  protected readonly expenseTypes = Object.entries(DGII_EXPENSE_TYPE);
  protected readonly incomeTypes = Object.entries(DGII_INCOME_TYPE);
  protected readonly items = signal<Item[]>([]);
  protected readonly uploading = signal(false);
  protected readonly uploadError = signal<string | null>(null);

  protected async pick(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    this.uploadError.set(null);
    if (!files.length) return;
    // Se avisa antes de subir: el servidor también lo rechazaría
    if (files.length > MAX_FILES) { this.uploadError.set(`Elegiste ${files.length} archivos: sube hasta ${MAX_FILES} a la vez.`); return; }
    const big = files.filter((f) => f.size > MAX_BYTES).map((f) => f.name);
    if (big.length) { this.uploadError.set(`Pesan más de 1 MB y no parecen un e-CF: ${big.join(', ')}`); return; }
    this.uploading.set(true);
    try {
      const res = await firstValueFrom(this.api.uploadFiles<Prepared[]>('/ecf/import', files));
      this.items.update((l) => [...res.map((r): Item => ({
        ...r,
        classification: r.preview?.side === 'SALES' ? (r.preview.incomeType ?? '01') : '',
        state: r.preview?.canImport ? 'ready' : 'blocked',
      })), ...l]);
    } catch (e) { this.uploadError.set(errorMessage(e)); }
    this.uploading.set(false);
  }

  private patch(n: number, p: Partial<Item>): void {
    this.items.update((l) => l.map((x, i) => (i === n ? { ...x, ...p } : x)));
  }
  protected setClass(n: number, ev: Event): void { this.patch(n, { classification: (ev.target as HTMLSelectElement).value }); }

  protected async confirm(n: number): Promise<void> {
    const it = this.items()[n];
    if (!it?.importId || !it.preview) return;
    this.patch(n, { state: 'importing', actionError: undefined });
    try {
      const key = it.preview.side === 'SALES' ? 'dgiiIncomeType' : 'dgiiExpenseType';
      const body = it.classification ? { [key]: it.classification } : {};
      const res = await firstValueFrom(this.api.post<{ invoice: { id: string; number: string } }>(`/ecf/import/${it.importId}/confirm`, body));
      this.patch(n, { state: 'done', invoiceId: res.invoice.id });
      this.notify.ok(`Factura ${res.invoice.number} registrada.`);
    } catch (e) { this.patch(n, { state: 'ready', actionError: e }); }
  }

  protected async discard(n: number): Promise<void> {
    const it = this.items()[n];
    if (!it) return;
    try {
      if (it.importId) await firstValueFrom(this.api.delete(`/ecf/import/${it.importId}`));
      this.items.update((l) => l.filter((_, i) => i !== n));
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
