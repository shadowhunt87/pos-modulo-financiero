import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { Api } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean, dec } from '../../shared/format';
import { ACCOUNT_TYPE } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { Entry, balanceOf, send, tooManyDecimals } from './ledger-shared';

interface OpeningResponse { entry: (Entry & { lines: (Entry['lines'][number] & { account: { code: string; name: string; type: string } })[] }) | null; totalDebit?: string; totalCredit?: string }

/** Carga única de saldos de apertura por cuenta (un solo asiento de apertura por empresa). */
@Component({
  selector: 'app-opening-balances',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, NgTemplateOutlet, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Saldos iniciales</h1><p class="sub">Los saldos con los que arranca tu contabilidad, cuenta por cuenta.</p></div>
      </div>

      @if (loadError()) { <div class="notice neg" role="alert">{{ loadError() }}</div> }
      @if (loading()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }

      @if (!loading() && current(); as cur) {
        @if (cur.entry; as e) {
          <div class="notice info" role="status">
            Los saldos iniciales ya se cargaron (asiento <a [routerLink]="['/entries', e.id]">{{ e.number || 'de apertura' }}</a>, {{ e.date | fdate }}).
            Solo puede existir uno: si hay que rehacerlo, anula ese asiento (administrador o aprobador) y vuelve a cargarlo.
          </div>
          <section class="panel" style="margin-top:16px">
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Cuenta</th><th>Tercero</th><th>Descripción</th><th class="num">Débito</th><th class="num">Crédito</th></tr></thead>
                <tbody>
                  @for (l of e.lines; track l.id) {
                    <tr><td><span class="mono">{{ l.account.code }}</span> {{ l.account.name }}</td><td>{{ partnerName(l.partnerId) }}</td><td>{{ l.description }}</td>
                      <td class="num">{{ l.debit | money: 'blank' }}</td><td class="num">{{ l.credit | money: 'blank' }}</td></tr>
                  }
                </tbody>
                <tfoot><tr><td colspan="3">Totales</td><td class="num">{{ cur.totalDebit | money }}</td><td class="num">{{ cur.totalCredit | money }}</td></tr></tfoot>
              </table>
            </div>
          </section>
        } @else {
          <ng-container *ngTemplateOutlet="formTpl" />
        }
      }
    </div>

    <ng-template #formTpl>
      <div class="notice info" role="note">
        Escribe el saldo que tenía cada cuenta en la fecha de arranque: activos al débito; pasivos y patrimonio al crédito. Para cuentas por cobrar o por pagar indica el cliente o proveedor.
        Solo se puede guardar una vez y debe cuadrar.
      </div>
      <form [formGroup]="form" (ngSubmit)="save()" novalidate style="margin-top:16px">
        <section class="panel panel-pad">
          <div class="form-grid">
            <div class="field"><label for="o-date">Fecha de los saldos</label><input id="o-date" type="date" class="input" formControlName="date" />
              <span class="hint">Normalmente el primer día del primer período que llevas en el sistema.</span></div>
            <div class="field"><label for="o-ref">Referencia</label><input id="o-ref" class="input" formControlName="reference" maxlength="100" placeholder="Opcional" /></div>
            <div class="field span-all"><label for="o-desc">Descripción</label><input id="o-desc" class="input" formControlName="description" maxlength="500" placeholder="Asiento de apertura de saldos" /></div>
          </div>
        </section>

        <section class="panel">
          <div class="panel-head"><h2>Saldos por cuenta</h2><button type="button" class="btn btn-sm" (click)="addLine()">Agregar línea</button></div>
          <div class="table-wrap">
            <table class="table">
              <thead><tr><th>Cuenta</th><th>Tercero</th><th>Descripción</th><th class="num">Débito</th><th class="num">Crédito</th><th></th></tr></thead>
              <tbody formArrayName="lines">
                @for (g of lines.controls; track g; let i = $index) {
                  <tr [formGroupName]="i">
                    <td class="acc"><app-combobox formControlName="accountId" [options]="accountOptions()" placeholder="Buscar cuenta…" [clearable]="false" aria-label="Cuenta" /></td>
                    <td class="acc"><app-combobox formControlName="partnerId" [options]="partnerOptions()" placeholder="Opcional" aria-label="Tercero" /></td>
                    <td><input class="input" formControlName="description" maxlength="300" aria-label="Descripción" /></td>
                    <td><input class="input num" type="number" min="0" step="0.01" formControlName="debit" aria-label="Débito" (input)="clearOther(i, 'credit')" /></td>
                    <td><input class="input num" type="number" min="0" step="0.01" formControlName="credit" aria-label="Crédito" (input)="clearOther(i, 'debit')" /></td>
                    <td class="actions"><button type="button" class="btn btn-ghost btn-sm" (click)="removeLine(i)" [disabled]="lines.length <= 2" [attr.aria-label]="'Quitar línea ' + (i + 1)">Quitar</button></td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </section>

        <section class="figures" aria-live="polite" style="margin-top:16px">
          <div class="figure"><div class="f-label">Débitos</div><div class="f-value">{{ bal().debit.toString() | money }}</div></div>
          <div class="figure"><div class="f-label">Créditos</div><div class="f-value">{{ bal().credit.toString() | money }}</div></div>
          <div class="figure"><div class="f-label">Diferencia</div><div class="f-value" [class.neg]="!bal().diff.isZero()" [class.pos]="bal().balanced">{{ bal().diff.abs().toString() | money }}</div>
            <div class="f-note">{{ bal().balanced ? 'Cuadrado' : bal().diff.isPositive() ? 'Sobran débitos' : bal().diff.isNegative() ? 'Sobran créditos' : 'Aún sin montos' }}</div></div>
        </section>

        @if (problem()) { <div class="notice warn" style="margin-top:14px" role="status">{{ problem() }}</div> }
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
        <div class="btn-row" style="margin-top:16px">
          <button type="submit" class="btn btn-primary" [disabled]="!!problem() || saving()">{{ saving() ? 'Guardando…' : 'Guardar saldos iniciales' }}</button>
        </div>
      </form>
    </ng-template>
  `,
  styles: `td.acc { min-width: 240px; } td { vertical-align: top; } td .num { min-width: 120px; }`,
})
export class OpeningBalances {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);

  protected readonly current = signal<OpeningResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly formError = signal('');

  protected readonly form = this.fb.nonNullable.group({
    date: ['', Validators.required], description: [''], reference: [''],
    lines: this.fb.array([this.newLine(), this.newLine()]),
  });
  protected get lines() { return this.form.controls.lines; }

  private readonly value = toSignal(this.form.valueChanges.pipe(startWith(null)), { initialValue: null });
  protected readonly bal = computed(() => { this.value(); return balanceOf(this.rawLines()); });

  protected readonly accountOptions = computed<ComboOption[]>(() =>
    this.lookups.accounts().filter((a) => a.active && a.isPostable)
      .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: ACCOUNT_TYPE[a.type as keyof typeof ACCOUNT_TYPE] ?? a.type })));
  protected readonly partnerOptions = computed<ComboOption[]>(() =>
    this.lookups.partners().filter((p) => p.active).map((p) => ({ value: p.id, label: p.name, hint: p.taxId ?? undefined })));

  protected readonly problem = computed(() => {
    this.value();
    const rows = this.rawLines();
    if (this.form.controls.date.invalid) return 'Elige la fecha de los saldos.';
    if (rows.some((l) => !l.accountId)) return 'Elige la cuenta de todas las líneas.';
    const ids = rows.map((l) => l.accountId + '|' + (l.partnerId ?? ''));
    if (new Set(ids).size !== ids.length) return 'Hay una cuenta repetida con el mismo tercero; junta esos saldos en una sola línea.';
    if (rows.some((l) => tooManyDecimals(l.debit) || tooManyDecimals(l.credit))) return 'Los montos admiten máximo 4 decimales.';
    if (rows.some((l) => dec(l.debit).gt(0) === dec(l.credit).gt(0))) return 'Cada línea debe tener débito o crédito (uno solo, mayor que cero).';
    const b = this.bal();
    if (!b.balanced) return `Los saldos no cuadran: faltan ${b.diff.abs().toString()} en ${b.diff.isNegative() ? 'débitos' : 'créditos'}.`;
    return '';
  });

  constructor() {
    void Promise.all([this.lookups.ensureAccounts(), this.lookups.ensurePartners()]).catch((e) => this.notify.error(errorMessage(e)));
    void this.load();
  }

  protected partnerName(id: string | null): string { return id ? this.lookups.partnerName(id) : ''; }

  private newLine() {
    return this.fb.nonNullable.group({ accountId: [''], partnerId: [''], description: [''], debit: [''], credit: [''] });
  }
  private rawLines() {
    return this.lines.getRawValue() as { accountId: string; partnerId: string | null; description: string; debit: string | number | null; credit: string | number | null }[];
  }
  protected addLine(): void { this.lines.push(this.newLine()); }
  protected removeLine(i: number): void { if (this.lines.length > 2) this.lines.removeAt(i); }
  protected clearOther(i: number, other: 'debit' | 'credit'): void {
    const g = this.lines.at(i);
    const mine = other === 'debit' ? 'credit' : 'debit';
    if (dec(g.get(mine)?.value).gt(0)) g.get(other)?.setValue('');
  }

  private async load(): Promise<void> {
    this.loading.set(true); this.loadError.set('');
    try { this.current.set(await this.api.getP<OpeningResponse>('/opening-balances')); }
    catch (e) { this.loadError.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.problem() || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const lines = this.rawLines().map((l) => clean({
      accountId: l.accountId, partnerId: l.partnerId ?? '',
      debit: dec(l.debit).gt(0) ? dec(l.debit).toNumber() : undefined,
      credit: dec(l.credit).gt(0) ? dec(l.credit).toNumber() : undefined,
      description: l.description.trim(),
    }));
    const body = clean({ date: v.date, description: v.description.trim(), reference: v.reference.trim(), lines });
    try {
      await send(this.api.post('/opening-balances', body));
      this.notify.ok('Saldos iniciales guardados.');
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }
}
