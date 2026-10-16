import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../../core/api';
import { errorMessage } from '../../../../core/errors';
import { Lookups } from '../../../../core/lookups';
import { Notify } from '../../../../core/notify';
import { ErrorNotice, UI } from '../../../../shared/ui';
import type { PosPromotion } from '../types';

const TYPE: Record<string, string> = { PERCENT: '% de descuento', BUY_X_PAY_Y: 'Lleva X, paga Y', FIXED_PRICE: 'Precio especial' };
const DAYS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
/** Fecha de Santo Domingo (AAAA-MM-DD) de un instante guardado en UTC */
const drDate = (iso: string) => new Date(new Date(iso).getTime() - 4 * 3_600_000).toISOString().slice(0, 10);
const dmy = (iso: string) => drDate(iso).split('-').reverse().join('/');

/** Promociones automáticas de la caja: % de descuento, «lleva X paga Y» y precio especial, con fechas, días y horario. */
@Component({
  selector: 'app-pos-promotions',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, ErrorNotice, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Promociones</h1><p class="sub">Se aplican solas en la caja. Por producto se usa la que más descuenta. No piden PIN.</p></div>
        <button type="button" class="btn btn-primary" (click)="edit(null)">Nueva promoción</button>
      </div>
      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap"><table class="table">
          <thead><tr><th>Nombre</th><th>Tipo</th><th>Aplica a</th><th>Cuándo</th><th>Estado</th><th></th></tr></thead>
          <tbody>
            @for (p of rows(); track p.id) {
              <tr>
                <td><strong>{{ p.name }}</strong></td>
                <td>{{ describe(p) }}</td>
                <td>{{ p.productIds.length ? p.productIds.length + ' producto(s)' : 'Todos los productos' }}</td>
                <td class="dim">{{ when(p) }}</td>
                <td><app-status [value]="p.active ? 'ACTIVE' : 'INACTIVE'" [map]="ACTIVE" /></td>
                <td class="actions"><button type="button" class="btn btn-ghost btn-sm" (click)="edit(p)">Editar</button></td>
              </tr>
            } @empty { <tr><td colspan="6" class="table-empty">Sin promociones.</td></tr> }
          </tbody>
        </table></div>
      </section>
    </div>

    <app-modal [open]="!!form()" [title]="editingId() ? 'Editar promoción' : 'Nueva promoción'" width="680px" (closed)="form.set(null)">
      @if (form(); as f) {
        <form id="pr-form" class="form-grid" (ngSubmit)="save()">
          <div class="field span-2"><label for="p-n">Nombre</label><input id="p-n" name="n" class="input" [(ngModel)]="f.name" placeholder="2x1 en filtros" /></div>
          <div class="field"><label for="p-t">Tipo</label><select id="p-t" name="t" class="select" [(ngModel)]="f.type">
            @for (t of types; track t[0]) { <option [value]="t[0]">{{ t[1] }}</option> }</select></div>
          @if (f.type === 'BUY_X_PAY_Y') {
            <div class="field"><label for="p-b">Lleva</label><input id="p-b" name="b" class="input num" type="number" min="2" [(ngModel)]="f.buyQty" /></div>
            <div class="field"><label for="p-p">Paga</label><input id="p-p" name="p" class="input num" type="number" min="0" [(ngModel)]="f.payQty" /></div>
          } @else {
            <div class="field"><label for="p-v">{{ f.type === 'PERCENT' ? 'Descuento (%)' : 'Precio especial (sin ITBIS)' }}</label><input id="p-v" name="v" class="input num" type="number" min="0" step="0.01" [(ngModel)]="f.value" /></div>
          }
          <div class="field span-all"><label for="p-prod">Productos (vacío = todos)</label>
            <select id="p-prod" name="prod" class="select multi" multiple [(ngModel)]="f.productIds">
              @for (p of products(); track p.id) { <option [value]="p.id">{{ p.code }} · {{ p.name }}</option> }</select>
            <span class="hint">Mantén Ctrl (o Cmd) para elegir varios.</span></div>
          <div class="field"><label for="p-s">Desde</label><app-date-input id="p-s" name="s" [(ngModel)]="f.startsAt" /></div>
          <div class="field"><label for="p-e">Hasta</label><app-date-input id="p-e" name="e" [(ngModel)]="f.endsAt" /></div>
          <div class="field"><label for="p-h1">Hora desde</label><input id="p-h1" name="h1" class="input" type="time" [(ngModel)]="f.timeFrom" /></div>
          <div class="field"><label for="p-h2">Hora hasta</label><input id="p-h2" name="h2" class="input" type="time" [(ngModel)]="f.timeTo" /></div>
          <div class="field span-all"><span class="label">Días (ninguno = todos)</span>
            <div class="days">@for (d of days; track $index; let i = $index) { <label class="check"><input type="checkbox" [checked]="f.weekdays.includes(i)" (change)="toggleDay(i)" /> {{ d }}</label> }</div></div>
          <label class="check span-all"><input type="checkbox" name="a" [(ngModel)]="f.active" /> Activa</label>
        </form>
        @if (fError()) { <app-error-notice style="display:block;margin-top:12px" [error]="fError()" /> }
      }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="form.set(null)">Cancelar</button>
        <button type="submit" form="pr-form" class="btn btn-primary">Guardar</button>
      </ng-container>
    </app-modal>
  `,
  styles: `.multi { height: 140px; padding: 6px; } .days { display: flex; flex-wrap: wrap; gap: 14px; margin-top: 6px; }`,
})
export class PosPromotionsPage {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);
  protected readonly ACTIVE: Record<string, string> = { ACTIVE: 'Activa', INACTIVE: 'Inactiva' };
  protected readonly types = Object.entries(TYPE);
  protected readonly days = DAYS;
  protected readonly rows = signal<PosPromotion[]>([]);
  protected readonly error = signal('');
  protected readonly fError = signal<unknown>('');
  protected readonly editingId = signal<string | null>(null);
  protected readonly form = signal<{ name: string; type: string; value: number | null; buyQty: number | null; payQty: number | null; productIds: string[]; startsAt: string | null; endsAt: string | null; timeFrom: string; timeTo: string; weekdays: number[]; active: boolean } | null>(null);
  protected readonly products = computed(() => this.lookups.products().filter((p) => p.active));

  constructor() { void this.load(); void this.lookups.ensureProducts(); }
  private async load(): Promise<void> {
    try { this.rows.set(await this.api.getP<PosPromotion[]>('/pos/promotions')); } catch (e) { this.error.set(errorMessage(e)); }
  }
  protected describe(p: PosPromotion): string {
    return p.type === 'PERCENT' ? `${Number(p.value)} % de descuento` : p.type === 'BUY_X_PAY_Y' ? `Lleva ${p.buyQty}, paga ${p.payQty}` : `Precio especial RD$${Number(p.value).toLocaleString('es-DO', { minimumFractionDigits: 2 })}`;
  }
  protected when(p: PosPromotion): string {
    const parts: string[] = [];
    if (p.startsAt || p.endsAt) parts.push(`${p.startsAt ? dmy(p.startsAt) : '…'} – ${p.endsAt ? dmy(p.endsAt) : '…'}`);
    if (p.weekdays.length) parts.push(p.weekdays.map((d) => DAYS[d]).join(', '));
    if (p.timeFrom && p.timeTo) parts.push(`${p.timeFrom}–${p.timeTo}`);
    return parts.join(' · ') || 'Siempre';
  }
  protected edit(p: PosPromotion | null): void {
    this.fError.set(''); this.editingId.set(p?.id ?? null);
    this.form.set(p
      ? { name: p.name, type: p.type, value: p.value === null ? null : Number(p.value), buyQty: p.buyQty, payQty: p.payQty, productIds: [...p.productIds], startsAt: p.startsAt ? drDate(p.startsAt) : null, endsAt: p.endsAt ? drDate(p.endsAt) : null, timeFrom: p.timeFrom ?? '', timeTo: p.timeTo ?? '', weekdays: [...p.weekdays], active: p.active }
      : { name: '', type: 'PERCENT', value: 10, buyQty: 2, payQty: 1, productIds: [], startsAt: null, endsAt: null, timeFrom: '', timeTo: '', weekdays: [], active: true });
  }
  protected toggleDay(i: number): void {
    const f = this.form(); if (!f) return;
    f.weekdays = f.weekdays.includes(i) ? f.weekdays.filter((d) => d !== i) : [...f.weekdays, i].sort();
  }
  protected async save(): Promise<void> {
    const f = this.form(); if (!f) return;
    this.fError.set('');
    const body = {
      name: f.name.trim(), type: f.type, productIds: f.productIds, weekdays: f.weekdays, active: f.active,
      ...(f.type === 'BUY_X_PAY_Y' ? { buyQty: Number(f.buyQty), payQty: Number(f.payQty) } : { value: Number(f.value) }),
      startsAt: f.startsAt ? `${f.startsAt}T04:00:00.000Z` : null, endsAt: f.endsAt ? `${f.endsAt}T03:59:59.000Z` : null,
      timeFrom: f.timeFrom || null, timeTo: f.timeTo || null,
    };
    // «Hasta» incluye todo ese día (hasta las 23:59 de Santo Domingo)
    if (body.endsAt) body.endsAt = new Date(new Date(body.endsAt).getTime() + 86_400_000).toISOString();
    try {
      const id = this.editingId();
      await firstValueFrom(id ? this.api.patch(`/pos/promotions/${id}`, body) : this.api.post('/pos/promotions', body));
      this.notify.ok('Promoción guardada.'); this.form.set(null); await this.load();
    } catch (e) { this.fError.set(e); }
  }
}
