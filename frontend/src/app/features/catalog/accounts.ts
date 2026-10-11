import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Lookups } from '../../core/lookups';
import { Account } from '../../core/models';
import { Notify } from '../../core/notify';
import { ACCOUNT_CATEGORY, ACCOUNT_TYPE, CASH_FLOW_CATEGORY, opts, Option, SUBLEDGER_TYPE } from '../../shared/labels';
import { ComboOption, UI } from '../../shared/ui';
import { ImportAccountsDialog } from './import-accounts-dialog';
import { CATEGORIES_BY_TYPE, cashFlowAllowed, subledgerAllowed } from './account-rules';

interface Row { acc: Account; depth: number; hasChildren: boolean }

@Component({
  selector: 'app-accounts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ImportAccountsDialog, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Plan de cuentas</h1><p class="sub">Catálogo de cuentas contables, ordenado por jerarquía.</p></div>
        <div class="btn-row">
          @if (all().length) {
            <button type="button" class="btn" [disabled]="!!exporting()" (click)="exportFile('xlsx')">{{ exporting() === 'xlsx' ? 'Generando…' : 'Exportar Excel' }}</button>
            <button type="button" class="btn" [disabled]="!!exporting()" (click)="exportFile('csv')">{{ exporting() === 'csv' ? 'Generando…' : 'Exportar CSV' }}</button>
          }
          @if (canEdit) {
            <button type="button" class="btn" (click)="openImport('file')">Importar desde Excel</button>
            <button type="button" class="btn" (click)="openImport('rd')">Cargar catálogo estándar RD</button>
            <button type="button" class="btn btn-primary" (click)="openNew()">Nueva cuenta</button>
          }
        </div>
      </div>

      @if (isEmpty()) {
        <section class="panel panel-pad empty-hero">
          <h2>Tu empresa aún no tiene plan de cuentas</h2>
          <p>Carga el catálogo estándar de República Dominicana con un clic, o importa el tuyo desde Excel.</p>
          @if (canEdit) {
            <div class="btn-row">
              <button type="button" class="btn btn-primary" (click)="openImport('rd')">Cargar catálogo estándar RD</button>
              <button type="button" class="btn" (click)="openImport('file')">Importar desde Excel</button>
            </div>
          } @else { <p class="sub">Pídele a un administrador o a la contadora que lo cargue.</p> }
        </section>
      }

      <div class="toolbar" [hidden]="isEmpty()">
        <div class="field wide"><label for="q">Buscar</label><input id="q" class="input" placeholder="Código o nombre" (input)="q.set($any($event.target).value)" /></div>
        <div class="field"><label for="type">Tipo</label>
          <select id="type" class="select" (change)="type.set($any($event.target).value)">
            <option value="">Todos</option>@for (o of typeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
        <div class="field"><label for="act">Estado</label>
          <select id="act" class="select" (change)="active.set($any($event.target).value)">
            <option value="">Todos</option><option value="true">Activas</option><option value="false">Inactivas</option>
          </select></div>
      </div>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      <section class="panel" [hidden]="isEmpty()">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Código</th><th>Nombre</th><th>Tipo</th><th>Categoría</th><th>Auxiliar</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (r of visible(); track r.acc.id) {
                <tr>
                  <td class="mono">{{ r.acc.code }}</td>
                  <td [style.padding-left.px]="12 + r.depth * 18">
                    <span [style.font-weight]="r.hasChildren ? 600 : 400">{{ r.acc.name }}</span>
                    @if (r.acc.isContra) { <span class="badge info" style="margin-left:6px">Contra</span> }
                    @if (!r.acc.isPostable) { <span class="badge" style="margin-left:6px">Agrupadora</span> }
                  </td>
                  <td>{{ r.acc.type | lbl: ACCOUNT_TYPE }}</td>
                  <td>{{ r.acc.category | lbl: ACCOUNT_CATEGORY }}@if (!r.acc.category && r.acc.isPostable) { <span class="faint">Sin clasificar</span> }</td>
                  <td>{{ r.acc.subledger | lbl: SUBLEDGER_TYPE }}</td>
                  <td><span class="badge" [class.pos]="r.acc.active">{{ r.acc.active ? 'Activa' : 'Inactiva' }}</span></td>
                  <td class="actions">
                    @if (canEdit) {
                      <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(r.acc)">Editar</button>
                      <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(r.acc)">{{ r.acc.active ? 'Desactivar' : 'Activar' }}</button>
                    }
                  </td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="7" class="table-empty">No hay cuentas con esos filtros.</td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-import-accounts-dialog [open]="importOpen()" [source]="importSource()" [hasAccounts]="all().length > 0"
      (closed)="importOpen.set(false)" (imported)="afterImport()" />

    <app-modal [open]="modalOpen()" [title]="editing() ? 'Editar cuenta' : 'Nueva cuenta'" width="720px" (closed)="modalOpen.set(false)">
      <form id="account-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field"><label for="f-code">Código</label>
            <input id="f-code" class="input mono" formControlName="code" maxlength="20" />
            @if (form.controls.code.touched && form.controls.code.invalid) { <span class="error-text">Usa letras, números, punto o guion (máx. 20).</span> }
            @if (editing()) { <span class="hint">El código no se puede cambiar.</span> }</div>
          <div class="field span-2"><label for="f-name">Nombre</label><input id="f-name" class="input" formControlName="name" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe el nombre.</span> }</div>
          <div class="field"><label for="f-type">Tipo</label>
            <select id="f-type" class="select" formControlName="type" (change)="onTypeChange()">@for (o of typeOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select>
            @if (editing()) { <span class="hint">El tipo no se puede cambiar.</span> }</div>
          <div class="field span-2"><label for="f-parent">Cuenta padre</label>
            <app-combobox id="f-parent" formControlName="parentId" [options]="parentOptions()" placeholder="Sin padre (cuenta de primer nivel)" />
            <span class="hint">Debe ser del mismo tipo.</span></div>
          <div class="field"><label for="f-cat">Categoría</label>
            <select id="f-cat" class="select" formControlName="category"><option value="">Sin clasificar</option>@for (o of categoryOptions(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
          <div class="field"><label for="f-cf">Categoría de flujo de efectivo</label>
            <select id="f-cf" class="select" formControlName="cashFlowCategory"><option value="">No aplica</option>@for (o of cashFlowOptions(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
          <div class="field"><label for="f-sub">Auxiliar</label>
            <select id="f-sub" class="select" formControlName="subledger"><option value="">Ninguno</option>@for (o of subledgerOptions(); track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
          <label class="check span-all"><input type="checkbox" formControlName="isContra" /> Cuenta de naturaleza contraria (por ejemplo, depreciación acumulada)</label>
        </div>
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="account-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>
  `,
  styles: `
    .empty-hero { text-align: center; padding: 40px 20px; display: flex; flex-direction: column; align-items: center; gap: 12px; }
    .empty-hero h2 { font-size: 20px; }
    .empty-hero p { max-width: 520px; color: var(--text-dim); }
    .empty-hero .btn-row { justify-content: center; }
  `,
})
export class Accounts {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly lookups = inject(Lookups);

  protected readonly ACCOUNT_TYPE = ACCOUNT_TYPE;
  protected readonly ACCOUNT_CATEGORY = ACCOUNT_CATEGORY;
  protected readonly SUBLEDGER_TYPE = SUBLEDGER_TYPE;
  protected readonly typeOptions = opts.accountType;
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  protected readonly all = signal<Account[]>([]);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  protected readonly q = signal('');
  protected readonly type = signal('');
  protected readonly active = signal('');

  /** Árbol aplanado en orden jerárquico, con la profundidad de cada cuenta. */
  private readonly tree = computed<Row[]>(() => {
    const list = this.all();
    const ids = new Set(list.map((a) => a.id));
    const kids = new Map<string | null, Account[]>();
    for (const a of list) {
      const key = a.parentId && ids.has(a.parentId) ? a.parentId : null;
      kids.set(key, [...(kids.get(key) ?? []), a]);
    }
    const out: Row[] = [];
    const walk = (parent: string | null, depth: number): void => {
      for (const a of (kids.get(parent) ?? []).sort((x, y) => x.code.localeCompare(y.code, 'es', { numeric: true }))) {
        out.push({ acc: a, depth, hasChildren: kids.has(a.id) });
        walk(a.id, depth + 1);
      }
    };
    walk(null, 0);
    return out;
  });
  protected readonly visible = computed<Row[]>(() => {
    const q = this.q().trim().toLowerCase();
    const t = this.type(), act = this.active();
    const filtering = !!(q || t || act);
    return this.tree()
      .filter((r) => (!t || r.acc.type === t) && (!act || String(r.acc.active) === act) && (!q || (r.acc.code + ' ' + r.acc.name).toLowerCase().includes(q)))
      .map((r) => (filtering ? { ...r, depth: 0 } : r));
  });

  protected readonly isEmpty = computed(() => !this.loading() && !this.error() && this.all().length === 0);
  protected readonly importOpen = signal(false);
  protected readonly importSource = signal<'rd' | 'file'>('rd');
  protected readonly exporting = signal<'' | 'xlsx' | 'csv'>('');

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<Account | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly formType = signal('ASSET');
  protected readonly form = this.fb.nonNullable.group({
    code: ['', [Validators.required, Validators.pattern(/^[0-9A-Za-z.\-]{1,20}$/)]],
    name: ['', [Validators.required, Validators.maxLength(200)]],
    type: ['ASSET', Validators.required],
    parentId: [null as string | null],
    category: [''], cashFlowCategory: [''], subledger: [''], isContra: [false],
  });

  protected readonly parentOptions = computed<ComboOption[]>(() => {
    const t = this.formType(), self = this.editing()?.id;
    return this.all().filter((a) => a.type === t && a.id !== self).map((a) => ({ value: a.id, label: `${a.code} · ${a.name}` }));
  });
  protected readonly categoryOptions = computed<Option[]>(() => (CATEGORIES_BY_TYPE[this.formType()] ?? []).map((v) => ({ value: v, label: ACCOUNT_CATEGORY[v] ?? v })));
  protected readonly cashFlowOptions = computed<Option[]>(() => cashFlowAllowed(this.formType()).map((v) => ({ value: v, label: CASH_FLOW_CATEGORY[v] ?? v })));
  protected readonly subledgerOptions = computed<Option[]>(() => subledgerAllowed(this.formType()).map((v) => ({ value: v, label: SUBLEDGER_TYPE[v] ?? v })));

  constructor() { void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.all.set(await this.api.getP<Account[]>('/accounting/accounts')); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected openImport(src: 'rd' | 'file'): void { this.importSource.set(src); this.importOpen.set(true); }
  protected afterImport(): void { void this.lookups.ensureAccounts(true); void this.load(); }
  protected async exportFile(format: 'xlsx' | 'csv'): Promise<void> {
    this.exporting.set(format);
    try { await this.api.download('/chart-of-accounts/export', { format }, `plan-de-cuentas.${format}`); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.exporting.set('');
  }

  protected onTypeChange(): void {
    this.formType.set(this.form.controls.type.value);
    this.form.patchValue({ parentId: null, category: '', cashFlowCategory: '', subledger: '' });
  }

  protected openNew(): void {
    this.editing.set(null); this.formError.set(''); this.formType.set('ASSET');
    this.form.reset({ type: 'ASSET', parentId: null, isContra: false });
    this.form.controls.code.enable(); this.form.controls.type.enable();
    this.modalOpen.set(true);
  }
  protected openEdit(a: Account): void {
    this.editing.set(a); this.formError.set(''); this.formType.set(a.type);
    this.form.reset({
      code: a.code, name: a.name, type: a.type, parentId: a.parentId, category: a.category ?? '',
      cashFlowCategory: a.cashFlowCategory ?? '', subledger: a.subledger ?? '', isContra: a.isContra,
    });
    this.form.controls.code.disable(); this.form.controls.type.disable();
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    try {
      const cur = this.editing();
      let id: string;
      if (cur) {
        await firstValueFrom(this.api.patch(`/accounting/accounts/${cur.id}`, { name: v.name.trim(), parentId: v.parentId }));
        id = cur.id;
      } else {
        const created = await firstValueFrom(this.api.post<Account>('/accounting/accounts', {
          code: v.code.trim(), name: v.name.trim(), type: v.type, ...(v.parentId ? { parentId: v.parentId } : {}),
        }));
        id = created.id;
      }
      const changedClass = !cur || (cur.category ?? '') !== v.category || (cur.cashFlowCategory ?? '') !== v.cashFlowCategory
        || (cur.subledger ?? '') !== v.subledger || cur.isContra !== v.isContra;
      if (changedClass && (v.category || v.cashFlowCategory || v.subledger || v.isContra || cur)) {
        try {
          await firstValueFrom(this.api.put('/account-classification', { items: [{
            accountId: id, category: v.category || null, cashFlowCategory: v.cashFlowCategory || null,
            subledger: v.subledger || null, isContra: v.isContra,
          }] }));
        } catch (e) {
          this.notify.error(`La cuenta se guardó, pero no su clasificación: ${errorMessage(e)}`);
          this.modalOpen.set(false);
          void this.lookups.ensureAccounts(true);
          await this.load();
          this.saving.set(false);
          return;
        }
      }
      this.notify.ok(cur ? 'Cuenta actualizada.' : 'Cuenta creada.');
      this.modalOpen.set(false);
      void this.lookups.ensureAccounts(true);
      await this.load();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async toggle(a: Account): Promise<void> {
    const to = !a.active;
    if (!(await this.confirm.ask({
      title: to ? 'Activar cuenta' : 'Desactivar cuenta',
      message: to ? `${a.code} · ${a.name} volverá a aparecer en los selectores.` : `${a.code} · ${a.name} dejará de aparecer en los selectores. Sus movimientos no cambian.`,
      confirmText: to ? 'Activar' : 'Desactivar', danger: !to,
    }))) return;
    try {
      await firstValueFrom(this.api.patch(`/accounting/accounts/${a.id}`, { active: to }));
      this.notify.ok(to ? 'Cuenta activada.' : 'Cuenta desactivada.');
      void this.lookups.ensureAccounts(true);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
}
