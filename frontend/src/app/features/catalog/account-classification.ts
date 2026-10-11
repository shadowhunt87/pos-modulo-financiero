import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { ACCOUNT_CATEGORY, ACCOUNT_TYPE, CASH_FLOW_CATEGORY, SUBLEDGER_TYPE } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { CATEGORIES_BY_TYPE, cashFlowAllowed, subledgerAllowed } from './account-rules';

interface ClsAccount {
  id: string; code: string; name: string; type: string; category: string | null; cashFlowCategory: string | null;
  isContra: boolean; subledger: string | null; isParent: boolean;
}
interface ClsResponse { summary: { leafAccounts: number; classified: number; withoutCashFlow: number }; accounts: ClsAccount[] }
interface Draft { category: string; cashFlowCategory: string; subledger: string; isContra: boolean }
interface Proposal { code: string; name: string; category: string; cashFlowCategory: string | null; isContra: boolean; subledger: string | null }
interface AutoResult { applied: boolean; classified: number; proposals: Proposal[]; unmatched: { code: string; name: string; type: string }[] }

@Component({
  selector: 'app-account-classification',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Clasificación de cuentas</h1><p class="sub">Define dónde aparece cada cuenta en el balance, el estado de resultados y el flujo de efectivo.</p></div>
        @if (canEdit) {
          <div class="btn-row">
            <button type="button" class="btn" (click)="preview()" [disabled]="busy()">Clasificar automáticamente</button>
            <button type="button" class="btn btn-primary" (click)="saveAll()" [disabled]="busy() || dirtyCount() === 0">Guardar cambios{{ dirtyCount() ? ' (' + dirtyCount() + ')' : '' }}</button>
          </div>
        }
      </div>

      @if (error()) { <div class="notice neg" role="alert">{{ error() }}</div> }
      @if (data(); as d) {
        <div class="figures" style="margin-bottom:16px">
          <div class="figure"><div class="f-label">Cuentas con movimientos</div><div class="f-value">{{ d.summary.leafAccounts }}</div></div>
          <div class="figure"><div class="f-label">Clasificadas</div><div class="f-value">{{ d.summary.classified }}</div><div class="f-note">{{ d.summary.leafAccounts - d.summary.classified }} sin clasificar</div></div>
          <div class="figure"><div class="f-label">Sin flujo de efectivo</div><div class="f-value">{{ d.summary.withoutCashFlow }}</div><div class="f-note">Activos y pasivos sin categoría de flujo</div></div>
        </div>
      }

      <div class="toolbar">
        <div class="field wide"><label for="q">Buscar</label><input id="q" class="input" placeholder="Código o nombre" (input)="q.set($any($event.target).value)" /></div>
        <label class="check"><input type="checkbox" (change)="onlyPending.set($any($event.target).checked)" /> Solo sin clasificar</label>
      </div>

      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Cuenta</th><th>Tipo</th><th>Categoría</th><th>Flujo de efectivo</th><th>Auxiliar</th><th>Contra</th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="6"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (a of visible(); track a.id) {
                <tr [class.dirty]="drafts()[a.id]">
                  <td><span class="mono">{{ a.code }}</span> · {{ a.name }}@if (a.isParent) { <span class="badge" style="margin-left:6px">Agrupadora</span> }</td>
                  <td>{{ a.type | lbl: ACCOUNT_TYPE }}</td>
                  @if (a.isParent || !canEdit) {
                    <td>{{ a.category | lbl: ACCOUNT_CATEGORY }}</td><td>{{ a.cashFlowCategory | lbl: CASH_FLOW_CATEGORY }}</td>
                    <td>{{ a.subledger | lbl: SUBLEDGER_TYPE }}</td><td>{{ a.isContra ? 'Sí' : '' }}</td>
                  } @else {
                    @let d = valueOf(a);
                    <td><select class="select" [attr.aria-label]="'Categoría de ' + a.code" (change)="edit(a, 'category', $any($event.target).value)">
                      <option value="" [selected]="!d.category">Sin clasificar</option>
                      @for (c of categories(a.type); track c) { <option [value]="c" [selected]="d.category === c">{{ ACCOUNT_CATEGORY[c] }}</option> }
                    </select></td>
                    <td><select class="select" [attr.aria-label]="'Flujo de efectivo de ' + a.code" [disabled]="cashFlows(a.type).length === 0" (change)="edit(a, 'cashFlowCategory', $any($event.target).value)">
                      <option value="" [selected]="!d.cashFlowCategory">{{ cashFlows(a.type).length ? 'Sin definir' : 'No aplica' }}</option>
                      @for (c of cashFlows(a.type); track c) { <option [value]="c" [selected]="d.cashFlowCategory === c">{{ CASH_FLOW_CATEGORY[c] }}</option> }
                    </select></td>
                    <td><select class="select" [attr.aria-label]="'Auxiliar de ' + a.code" [disabled]="subledgers(a.type).length === 0" (change)="edit(a, 'subledger', $any($event.target).value)">
                      <option value="" [selected]="!d.subledger">Ninguno</option>
                      @for (c of subledgers(a.type); track c) { <option [value]="c" [selected]="d.subledger === c">{{ SUBLEDGER_TYPE[c] }}</option> }
                    </select></td>
                    <td><input type="checkbox" [attr.aria-label]="'Contra ' + a.code" [checked]="d.isContra" (change)="edit(a, 'isContra', $any($event.target).checked)" /></td>
                  }
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="6" class="table-empty">No hay cuentas con esos filtros.</td></tr> }
              }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="autoOpen()" title="Clasificación automática" width="860px" (closed)="autoOpen.set(false)">
      @if (auto(); as r) {
        <p>Se propone clasificar <strong>{{ r.classified }}</strong> cuentas sin categoría según su nombre. Revisa la propuesta antes de aplicarla.</p>
        @if (r.proposals.length) {
          <div class="table-wrap" style="max-height:320px;overflow:auto">
            <table class="table">
              <thead><tr><th>Cuenta</th><th>Categoría</th><th>Flujo de efectivo</th><th>Auxiliar</th><th>Contra</th></tr></thead>
              <tbody>
                @for (p of r.proposals; track p.code) {
                  <tr><td><span class="mono">{{ p.code }}</span> · {{ p.name }}</td><td>{{ p.category | lbl: ACCOUNT_CATEGORY }}</td>
                    <td>{{ p.cashFlowCategory | lbl: CASH_FLOW_CATEGORY }}</td><td>{{ p.subledger | lbl: SUBLEDGER_TYPE }}</td><td>{{ p.isContra ? 'Sí' : '' }}</td></tr>
                }
              </tbody>
            </table>
          </div>
        }
        @if (r.unmatched.length) {
          <div class="notice warn" style="margin-top:12px" role="status">
            {{ r.unmatched.length }} cuentas no se pudieron clasificar y quedan para hacerlo a mano: {{ unmatchedText(r) }}
          </div>
        }
      }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="autoOpen.set(false)">Cancelar</button>
        <button type="button" class="btn btn-primary" (click)="applyAuto()" [disabled]="busy() || !auto()?.proposals?.length">Aplicar clasificación</button>
      </ng-container>
    </app-modal>
  `,
  styles: `tr.dirty td { background: var(--primary-soft); } .select { min-width: 150px; }`,
})
export class AccountClassification {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);

  protected readonly ACCOUNT_TYPE = ACCOUNT_TYPE;
  protected readonly ACCOUNT_CATEGORY = ACCOUNT_CATEGORY;
  protected readonly CASH_FLOW_CATEGORY = CASH_FLOW_CATEGORY;
  protected readonly SUBLEDGER_TYPE = SUBLEDGER_TYPE;
  protected readonly canEdit = inject(Auth).has('ADMIN', 'ACCOUNTANT');

  protected readonly data = signal<ClsResponse | null>(null);
  protected readonly loading = signal(true);
  protected readonly busy = signal(false);
  protected readonly error = signal('');
  protected readonly q = signal('');
  protected readonly onlyPending = signal(false);
  protected readonly drafts = signal<Record<string, Draft>>({});
  protected readonly dirtyCount = computed(() => Object.keys(this.drafts()).length);
  protected readonly autoOpen = signal(false);
  protected readonly auto = signal<AutoResult | null>(null);

  protected readonly visible = computed(() => {
    const q = this.q().trim().toLowerCase();
    return (this.data()?.accounts ?? []).filter((a) =>
      (!this.onlyPending() || (!a.isParent && !a.category)) && (!q || (a.code + ' ' + a.name).toLowerCase().includes(q)),
    );
  });

  constructor() { void this.load(); }

  protected categories(type: string): string[] { return CATEGORIES_BY_TYPE[type] ?? []; }
  protected cashFlows(type: string): string[] { return cashFlowAllowed(type); }
  protected subledgers(type: string): string[] { return subledgerAllowed(type); }
  protected unmatchedText(r: AutoResult): string { return r.unmatched.slice(0, 8).map((u) => u.code).join(', ') + (r.unmatched.length > 8 ? '…' : ''); }

  protected valueOf(a: ClsAccount): Draft {
    return this.drafts()[a.id] ?? { category: a.category ?? '', cashFlowCategory: a.cashFlowCategory ?? '', subledger: a.subledger ?? '', isContra: a.isContra };
  }

  protected edit(a: ClsAccount, field: keyof Draft, value: string | boolean): void {
    const next: Draft = { ...this.valueOf(a), [field]: value };
    const same = next.category === (a.category ?? '') && next.cashFlowCategory === (a.cashFlowCategory ?? '') && next.subledger === (a.subledger ?? '') && next.isContra === a.isContra;
    this.drafts.update((d) => {
      const copy = { ...d };
      if (same) delete copy[a.id]; else copy[a.id] = next;
      return copy;
    });
  }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try { this.data.set(await this.api.getP<ClsResponse>('/account-classification')); this.drafts.set({}); } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  protected async saveAll(): Promise<void> {
    const items = Object.entries(this.drafts()).map(([accountId, d]) => ({
      accountId, category: d.category || null, cashFlowCategory: d.cashFlowCategory || null, subledger: d.subledger || null, isContra: d.isContra,
    }));
    if (!items.length || this.busy()) return;
    this.busy.set(true);
    try {
      for (let i = 0; i < items.length; i += 500) await firstValueFrom(this.api.put('/account-classification', { items: items.slice(i, i + 500) }));
      this.notify.ok(items.length === 1 ? 'Clasificación guardada.' : `Se guardó la clasificación de ${items.length} cuentas.`);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async preview(): Promise<void> {
    if (this.dirtyCount() && !(await this.confirm.ask({ title: 'Hay cambios sin guardar', message: 'Si clasificas automáticamente se descartan los cambios que no guardaste.', confirmText: 'Continuar' }))) return;
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.post<AutoResult>('/account-classification/auto', { apply: false }));
      if (!r.proposals.length && !r.unmatched.length) this.notify.ok('Todas las cuentas ya están clasificadas.');
      else { this.auto.set(r); this.autoOpen.set(true); }
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  protected async applyAuto(): Promise<void> {
    this.busy.set(true);
    try {
      const r = await firstValueFrom(this.api.post<AutoResult>('/account-classification/auto', { apply: true }));
      this.notify.ok(`Se clasificaron ${r.classified} cuentas.`);
      this.autoOpen.set(false);
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }
}
