import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api';
import { Account, BankAccount, CashRegister, Journal, Partner, Product, TaxRate } from './models';

/**
 * Listas de apoyo para los selectores (cuentas, terceros, impuestos, bancos…).
 * Se cargan una vez y se reutilizan; `refresh*` las recarga tras crear o editar.
 */
@Injectable({ providedIn: 'root' })
export class Lookups {
  private readonly api = inject(Api);

  readonly accounts = signal<Account[]>([]);
  readonly partners = signal<Partner[]>([]);
  readonly taxRates = signal<TaxRate[]>([]);
  readonly bankAccounts = signal<BankAccount[]>([]);
  readonly cashRegisters = signal<CashRegister[]>([]);
  readonly journals = signal<Journal[]>([]);
  readonly products = signal<Product[]>([]);

  private pending = new Map<string, Promise<void>>();
  private done = new Set<string>();

  private once(key: string, load: () => Promise<void>, force: boolean): Promise<void> {
    if (force) { this.done.delete(key); this.pending.delete(key); }
    if (this.done.has(key)) return Promise.resolve();
    let p = this.pending.get(key);
    if (!p) {
      p = load().then(() => { this.done.add(key); }).finally(() => this.pending.delete(key));
      this.pending.set(key, p);
    }
    return p;
  }

  ensureAccounts(force = false) { return this.once('accounts', async () => this.accounts.set(await this.api.getP<Account[]>('/accounting/accounts')), force); }
  ensurePartners(force = false) { return this.once('partners', async () => this.partners.set(await this.api.getAll<Partner>('/partners')), force); }
  ensureTaxRates(force = false) { return this.once('taxRates', async () => this.taxRates.set(await this.listOrPage<TaxRate>('/tax-rates')), force); }
  ensureBankAccounts(force = false) { return this.once('bankAccounts', async () => this.bankAccounts.set(await this.api.getP<BankAccount[]>('/bank-accounts')), force); }
  ensureCashRegisters(force = false) { return this.once('cashRegisters', async () => this.cashRegisters.set(await this.api.getP<CashRegister[]>('/cash-registers')), force); }
  ensureProducts(force = false) { return this.once('products', async () => this.products.set(await this.api.getAll<Product>('/products')), force); }
  ensureJournals(force = false) { return this.once('journals', async () => this.journals.set(await this.listOrPage<Journal>('/journals')), force); }

  /** Carga todo lo que usan los formularios de documentos. */
  ensureAll(force = false): Promise<unknown> {
    return Promise.all([
      this.ensureAccounts(force), this.ensurePartners(force), this.ensureTaxRates(force),
      this.ensureBankAccounts(force), this.ensureCashRegisters(force), this.ensureJournals(force),
    ]);
  }

  /** Olvida todo (al cerrar sesión). */
  reset(): void {
    this.done.clear(); this.pending.clear();
    this.accounts.set([]); this.partners.set([]); this.taxRates.set([]);
    this.bankAccounts.set([]); this.cashRegisters.set([]); this.journals.set([]); this.products.set([]);
  }

  accountName(id: string | null | undefined): string {
    const a = this.accounts().find((x) => x.id === id);
    return a ? `${a.code} · ${a.name}` : '';
  }
  partnerName(id: string | null | undefined): string {
    return this.partners().find((x) => x.id === id)?.name ?? '';
  }

  private async listOrPage<T>(path: string): Promise<T[]> {
    const res = await this.api.getP<T[] | { data: T[] }>(path);
    return Array.isArray(res) ? res : res.data;
  }
}
