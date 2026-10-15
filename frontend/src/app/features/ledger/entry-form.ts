import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { startWith } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Notify } from '../../core/notify';
import { clean, dec, isoDate, today } from '../../shared/format';
import { ACCOUNT_TYPE } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { Entry, balanceOf, send, tooManyDecimals } from './ledger-shared';

/** Alta y corrección de asientos manuales (`/entries/new` y `/entries/:id/edit`). */
@Component({
  selector: 'app-entry-form',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, RouterLink, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div>
          <h1>{{ isEdit() ? 'Corregir asiento' : 'Nuevo asiento' }}</h1>
          <p class="sub">Cada línea lleva débito o crédito, y el total de débitos debe ser igual al de créditos.</p>
        </div>
        <a class="btn" [routerLink]="isEdit() ? ['/entries', id()] : ['/entries']">Cancelar</a>
      </div>

      @if (loadError()) { <div class="notice neg" role="alert">{{ loadError() }}</div> }
      @else if (loading()) { <div class="loading"><span class="spinner"></span> Cargando…</div> }
      @else {
        @if (isEdit() && rejectReason()) {
          <div class="notice warn" role="status">Rechazado por: {{ rejectReason() }}. Al guardar, el asiento vuelve a quedar pendiente de aprobación.</div>
        }
        <form [formGroup]="form" (ngSubmit)="save()" novalidate>
          <section class="panel panel-pad">
            <div class="form-grid">
              <div class="field"><label for="f-date">Fecha</label><app-date-input id="f-date" formControlName="date" />
                @if (form.controls.date.touched && form.controls.date.invalid) { <span class="error-text">Elige la fecha del asiento.</span> }</div>
              <div class="field"><label for="f-ref">Referencia</label><input id="f-ref" class="input" formControlName="reference" maxlength="100" placeholder="Opcional" /></div>
              <div class="field span-all"><label for="f-desc">Descripción</label><input id="f-desc" class="input" formControlName="description" maxlength="500" />
                @if (form.controls.description.touched && form.controls.description.invalid) { <span class="error-text">Escribe qué registra este asiento.</span> }</div>
            </div>
          </section>

          <section class="panel">
            <div class="panel-head"><h2>Líneas</h2><button type="button" class="btn btn-sm" (click)="addLine()">Agregar línea</button></div>
            <div class="table-wrap">
              <table class="table">
                <thead><tr><th>Cuenta</th><th>Descripción</th><th class="num">Débito</th><th class="num">Crédito</th><th></th></tr></thead>
                <tbody formArrayName="lines">
                  @for (g of lines.controls; track g; let i = $index) {
                    <tr [formGroupName]="i">
                      <td class="acc"><app-combobox formControlName="accountId" [options]="accountOptions()" placeholder="Buscar cuenta…" [clearable]="false" aria-label="Cuenta" /></td>
                      <td><input class="input" formControlName="description" maxlength="300" aria-label="Descripción de la línea" placeholder="Opcional" /></td>
                      <td><input class="input num" type="number" min="0" step="0.01" formControlName="debit" aria-label="Débito" (input)="clearOther(i, 'credit')" /></td>
                      <td><input class="input num" type="number" min="0" step="0.01" formControlName="credit" aria-label="Crédito" (input)="clearOther(i, 'debit')" /></td>
                      <td class="actions">
                        <button type="button" class="btn btn-ghost btn-sm" (click)="fillLine(i)" [disabled]="bal().diff.isZero()" title="Pone en esta línea lo que falta para cuadrar">Cuadrar</button>
                        <button type="button" class="btn btn-ghost btn-sm" (click)="removeLine(i)" [disabled]="lines.length <= 2" [attr.aria-label]="'Quitar línea ' + (i + 1)">Quitar</button>
                      </td>
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
              <div class="f-note">{{ status() }}</div></div>
          </section>

          @if (problem()) { <div class="notice warn" style="margin-top:14px" role="status">{{ problem() }}</div> }
          @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
          <div class="btn-row" style="margin-top:16px">
            <button type="submit" class="btn btn-primary" [disabled]="!!problem() || saving()">{{ saving() ? 'Guardando…' : (isEdit() ? 'Guardar cambios' : 'Guardar asiento') }}</button>
          </div>
        </form>
      }
    </div>
  `,
  styles: `
    td.acc { min-width: 280px; } td { vertical-align: top; } td .input { min-width: 120px; }
    td .num { min-width: 120px; }
  `,
})
export class EntryForm {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly router = inject(Router);
  private readonly notify = inject(Notify);
  private readonly lookups = inject(Lookups);
  private readonly auth = inject(Auth);

  /** Viene de la ruta `entries/:id/edit`; sin id es un asiento nuevo. */
  readonly id = input<string>();
  /** `?copy=<id>`: asiento nuevo con las líneas de uno ya reversado, para registrarlo bien (N1). */
  readonly copy = input<string>();
  protected readonly isEdit = computed(() => !!this.id());

  protected readonly loading = signal(false);
  protected readonly loadError = signal('');
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly rejectReason = signal('');
  private readonly extraAccountIds = signal<string[]>([]);

  protected readonly form = this.fb.nonNullable.group({
    date: [today(), Validators.required],
    description: ['', [Validators.required, Validators.maxLength(500)]],
    reference: [''],
    lines: this.fb.array([this.newLine(), this.newLine()]),
  });
  protected get lines() { return this.form.controls.lines; }

  private readonly value = toSignal(this.form.valueChanges.pipe(startWith(null)), { initialValue: null });
  protected readonly bal = computed(() => { this.value(); return balanceOf(this.rawLines()); });

  protected readonly accountOptions = computed<ComboOption[]>(() => {
    const keep = new Set(this.extraAccountIds());
    return this.lookups.accounts()
      .filter((a) => (a.active && a.isPostable) || keep.has(a.id))
      .map((a) => ({ value: a.id, label: `${a.code} · ${a.name}`, hint: ACCOUNT_TYPE[a.type as keyof typeof ACCOUNT_TYPE] ?? a.type }));
  });

  /** Mensaje que explica por qué todavía no se puede guardar (vacío = listo). */
  protected readonly problem = computed(() => {
    this.value();
    const rows = this.rawLines();
    if (this.form.controls.date.invalid || this.form.controls.description.invalid) return 'Completa la fecha y la descripción.';
    if (rows.some((l) => !l.accountId)) return 'Elige la cuenta de todas las líneas.';
    if (rows.some((l) => tooManyDecimals(l.debit) || tooManyDecimals(l.credit))) return 'Los montos admiten máximo 4 decimales.';
    if (rows.some((l) => dec(l.debit).gt(0) === dec(l.credit).gt(0))) return 'Cada línea debe tener débito o crédito (uno solo, mayor que cero).';
    const b = this.bal();
    if (!b.balanced) return `El asiento no cuadra: faltan ${b.diff.abs().toString()} en ${b.diff.isNegative() ? 'débitos' : 'créditos'}.`;
    return '';
  });
  protected readonly status = computed(() => {
    const b = this.bal();
    if (b.debit.isZero() && b.credit.isZero()) return 'Aún sin montos';
    return b.balanced ? 'Cuadrado' : b.diff.isPositive() ? 'Sobran débitos' : 'Sobran créditos';
  });

  constructor() {
    void this.lookups.ensureAccounts().catch((e) => this.notify.error(errorMessage(e)));
    effect(() => { const id = this.id(); if (id) void this.loadEntry(id); });
    effect(() => { const c = this.copy(); if (c && !this.id()) void this.loadEntry(c, true); });
  }

  private newLine(l: { accountId?: string; description?: string; debit?: string; credit?: string } = {}) {
    return this.fb.nonNullable.group({
      accountId: [l.accountId ?? ''], description: [l.description ?? ''],
      debit: [l.debit ?? ''], credit: [l.credit ?? ''],
    });
  }
  private rawLines() { return this.lines.getRawValue() as { accountId: string; description: string; debit: string | number | null; credit: string | number | null }[]; }

  protected addLine(): void { this.lines.push(this.newLine()); }
  protected removeLine(i: number): void { if (this.lines.length > 2) this.lines.removeAt(i); }
  /** Al escribir un débito se vacía el crédito de la misma línea (y al revés). */
  protected clearOther(i: number, other: 'debit' | 'credit'): void {
    const g = this.lines.at(i);
    const mine = other === 'debit' ? 'credit' : 'debit';
    if (dec(g.get(mine)?.value).gt(0)) g.get(other)?.setValue('');
  }
  /** Pone en la línea lo que falta para cuadrar el asiento. */
  protected fillLine(i: number): void {
    const g = this.lines.at(i);
    const rest = balanceOf(this.rawLines().filter((_, k) => k !== i));
    const diff = rest.debit.minus(rest.credit); // >0 → esta línea va al crédito
    if (diff.isZero()) return;
    g.patchValue(diff.isPositive() ? { debit: '', credit: diff.toString() } : { debit: diff.abs().toString(), credit: '' });
  }

  private async loadEntry(id: string, asCopy = false): Promise<void> {
    this.loading.set(true); this.loadError.set('');
    try {
      const e = await this.api.getP<Entry>(`/accounting/journal-entries/${id}`);
      const mine = e.createdById === this.auth.user()?.id;
      if (!asCopy && e.status !== 'DRAFT' && e.status !== 'REJECTED') throw new Error('Solo se pueden corregir asientos pendientes de aprobar o rechazados.');
      if (!asCopy && !this.auth.has('ADMIN') && !(this.auth.has('ACCOUNTANT') && mine)) throw new Error('Solo quien creó el asiento (o un administrador) puede corregirlo.');
      this.extraAccountIds.set(e.lines.map((l) => l.accountId));
      this.rejectReason.set(e.status === 'REJECTED' ? (e.rejectReason ?? '') : '');
      this.form.controls.date.setValue(asCopy ? today() : isoDate(e.date));
      this.form.controls.description.setValue(asCopy ? `Corrección de ${e.number ?? 'asiento'}: ${e.description}`.slice(0, 500) : e.description);
      this.form.controls.reference.setValue(e.reference ?? '');
      this.lines.clear();
      for (const l of e.lines) {
        this.lines.push(this.newLine({
          accountId: l.accountId, description: l.description ?? '',
          debit: dec(l.debit).gt(0) ? dec(l.debit).toString() : '', credit: dec(l.credit).gt(0) ? dec(l.credit).toString() : '',
        }));
      }
      while (this.lines.length < 2) this.lines.push(this.newLine());
    } catch (e) { this.loadError.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.problem() || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const lines = this.rawLines().map((l) => clean({
      accountId: l.accountId,
      debit: dec(l.debit).gt(0) ? dec(l.debit).toNumber() : undefined,
      credit: dec(l.credit).gt(0) ? dec(l.credit).toNumber() : undefined,
      description: l.description.trim(),
    }));
    const body = clean({ date: v.date, description: v.description.trim(), reference: v.reference.trim(), lines });
    try {
      const cur = this.id();
      const saved = await send<Entry>(cur ? this.api.patch<Entry>(`/accounting/journal-entries/${cur}`, body) : this.api.post<Entry>('/accounting/journal-entries', body));
      this.notify.ok(saved.status === 'DRAFT' ? 'Asiento guardado; queda pendiente de aprobación.' : 'Asiento contabilizado.');
      await this.router.navigate(['/entries', saved.id]);
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }
}
