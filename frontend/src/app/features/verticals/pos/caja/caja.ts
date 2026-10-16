import { ChangeDetectionStrategy, Component, ElementRef, HostListener, computed, inject, signal, viewChild } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import Decimal from 'decimal.js';
import { Auth } from '../../../../core/auth';
import { errorMessage } from '../../../../core/errors';
import { Notify } from '../../../../core/notify';
import { UI } from '../../../../shared/ui';
import { PosApi, posErrorCode } from '../pos-api';
import { priceCart, r2 } from '../pricing';
import type { Parked, PosCatalog, PosContext, PosCustomer, PosProduct, PosSale, PosShift } from '../types';
import { PosApprovalDialog } from './approval-dialog';
import { PosCashDialog, PosCloseDialog } from './cash-dialogs';
import { PosCustomerDialog } from './customer-dialog';
import { PosParkedDialog } from './parked-dialog';
import { PosPayDialog, type PayLine } from './pay-dialog';
import { PosSalesDialog, type ReturnRequest, type VoidRequest } from './sales-dialog';
import { printTicket } from './ticket-print';

interface CartItem { productId: string; quantity: number; discount: number }
const TERMINAL_KEY = 'pos.terminalId';
const AUTOPRINT_KEY = 'pos.autoPrint';
const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* modo privado */ } };
const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`);

/**
 * Caja del punto de venta (docs/PLAN-POS.md, fase 3). Pantalla completa, pensada para el mostrador: tocar o escanear,
 * cobrar y entregar el ticket. Los precios los recalcula el servidor; aquí se muestran igual con el mismo motor.
 */
@Component({
  selector: 'app-caja',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [FormsModule, PosApprovalDialog, PosPayDialog, PosCustomerDialog, PosParkedDialog, PosCashDialog, PosCloseDialog, PosSalesDialog, ...UI],
  templateUrl: './caja.html',
  styleUrl: './caja.css',
})
export class Caja {
  private readonly pos = inject(PosApi);
  private readonly notify = inject(Notify);
  private readonly router = inject(Router);
  protected readonly auth = inject(Auth);
  private readonly searchBox = viewChild<ElementRef<HTMLInputElement>>('searchBox');

  protected readonly loading = signal(true);
  protected readonly fatal = signal('');
  protected readonly ctx = signal<PosContext | null>(null);
  protected readonly terminalId = signal<string | null>(read(TERMINAL_KEY));
  protected readonly shift = signal<PosShift | null>(null);
  protected readonly catalog = signal<PosCatalog | null>(null);
  protected readonly cart = signal<CartItem[]>([]);
  protected readonly customer = signal<{ id: string; name: string; taxId: string | null; defaultNcfType: string | null } | null>(null);
  protected readonly ncfType = signal<string | null>(null);
  protected readonly query = signal('');
  protected readonly categoryId = signal<string | null>(null);
  protected readonly editingDiscount = signal<string | null>(null);
  protected openingCash: number | null = 0;
  protected readonly busy = signal(false);
  protected readonly autoPrint = signal(read(AUTOPRINT_KEY) === '1');
  protected readonly lastSale = signal<PosSale | null>(null);

  // Ventanas
  protected readonly payOpen = signal(false);
  protected readonly payError = signal('');
  protected readonly approvalAction = signal<string | null>(null);
  private approvalResolve: ((id: string | null) => void) | null = null;
  protected readonly customerOpen = signal(false);
  protected readonly parkedOpen = signal(false);
  protected readonly parkedItems = signal<Parked[]>([]);
  protected readonly cashOpen = signal(false);
  protected readonly salesOpen = signal(false);
  protected readonly salesError = signal('');
  protected readonly salesRefresh = signal(0);
  protected readonly closeShift = signal<PosShift | null>(null);
  protected readonly closeResult = signal<PosShift | null>(null);
  protected readonly closeError = signal('');
  private checkoutId: string | null = null;

  protected readonly terminal = computed(() => this.ctx()?.terminals.find((t) => t.id === this.terminalId()) ?? null);
  protected readonly settings = computed(() => this.catalog()?.settings ?? null);
  protected readonly productById = computed(() => new Map((this.catalog()?.products ?? []).map((p) => [p.id, p])));
  protected readonly visibleProducts = computed(() => {
    const q = this.query().trim().toLowerCase();
    const cat = this.categoryId();
    return (this.catalog()?.products ?? [])
      .filter((p) => (!cat || p.categoryId === cat) && (!q || p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q) || p.barcodes.some((b) => b.includes(q))))
      .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
      .slice(0, 120);
  });
  /** Carrito con precio, promoción, descuento e ITBIS por línea (como lo calcula la factura del núcleo) */
  protected readonly lines = computed(() => {
    const cat = this.catalog();
    if (!cat) return [];
    const items = this.cart().filter((i) => this.productById().has(i.productId));
    const priced = priceCart(cat.promotions, items.map((i) => {
      const p = this.productById().get(i.productId)!;
      return { productId: p.id, categoryId: p.categoryId, quantity: new Decimal(i.quantity), unitPrice: new Decimal(p.salePrice) };
    }), new Date());
    return items.map((i, k) => {
      const p = this.productById().get(i.productId)!;
      const discount = r2(new Decimal(i.discount || 0));
      const net = r2(priced[k].gross.minus(priced[k].promoDiscount).minus(discount));
      const tax = p.tax ? r2(net.times(p.tax.rate).div(100)) : new Decimal(0);
      return { item: i, product: p, gross: priced[k].gross, promo: priced[k].promoDiscount, promoName: priced[k].promotionName, discount, net, tax, total: net.plus(tax) };
    });
  });
  protected readonly totals = computed(() => {
    const ls = this.lines();
    const sum = (f: (l: (typeof ls)[number]) => Decimal) => ls.reduce((a, l) => a.plus(f(l)), new Decimal(0));
    const subtotal = sum((l) => l.net), tax = sum((l) => l.tax);
    return { items: ls.reduce((a, l) => a + l.item.quantity, 0), gross: sum((l) => l.gross), promo: sum((l) => l.promo), discount: sum((l) => l.discount), subtotal, tax, total: subtotal.plus(tax) };
  });
  protected readonly ncfOptions = computed(() => {
    const s = this.settings();
    return [...new Set([s?.defaultNcfType, s?.fiscalCreditNcfType, this.customer()?.defaultNcfType].filter((x): x is string => !!x))];
  });
  protected readonly isDefaultCustomer = computed(() => !this.customer() || this.customer()!.id === this.settings()?.defaultPartner?.id);

  constructor() { void this.init(); }

  // ---------------- Arranque ----------------
  private async init(): Promise<void> {
    this.loading.set(true); this.fatal.set('');
    try {
      const ctx = await this.pos.context();
      this.ctx.set(ctx);
      if (!ctx.configured) { this.fatal.set('El punto de venta no está configurado. Un administrador debe completar «Punto de venta › Configuración».'); return; }
      if (!ctx.terminals.length) { this.fatal.set('No hay terminales activas. Un administrador debe crear una en «Punto de venta › Configuración».'); return; }
      if (!ctx.terminals.some((t) => t.id === this.terminalId())) this.terminalId.set(ctx.terminals.length === 1 ? ctx.terminals[0].id : null);
      await this.loadCatalog();
      if (this.terminalId()) await this.loadShift();
    } catch (e) { this.fatal.set(errorMessage(e)); }
    finally { this.loading.set(false); }
  }

  private async loadCatalog(): Promise<void> {
    const c = await this.pos.catalog();
    this.catalog.set(c);
    if (!this.customer() && c.settings.defaultPartner) this.resetCustomer();
  }
  private async loadShift(): Promise<void> {
    const t = this.terminalId();
    this.shift.set(t ? await this.pos.currentShift(t) : null);
  }
  protected async chooseTerminal(id: string): Promise<void> {
    this.terminalId.set(id); write(TERMINAL_KEY, id);
    await this.loadShift();
  }
  protected async open(): Promise<void> {
    const t = this.terminalId();
    if (!t || this.busy()) return;
    this.busy.set(true);
    try { this.shift.set(await this.pos.openShift(t, Number(this.openingCash) || 0)); this.notify.ok('Turno abierto. ¡Buenas ventas!'); }
    catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }

  // ---------------- Carrito ----------------
  protected priceWithTax(p: PosProduct): string {
    const base = new Decimal(p.salePrice);
    return r2(p.tax ? base.plus(base.times(p.tax.rate).div(100)) : base).toFixed(2);
  }
  protected add(p: PosProduct, qty = 1): void {
    this.lastSale.set(null);
    this.cart.update((c) => {
      const i = c.findIndex((x) => x.productId === p.id);
      return i >= 0 ? c.map((x, k) => (k === i ? { ...x, quantity: x.quantity + qty } : x)) : [...c, { productId: p.id, quantity: qty, discount: 0 }];
    });
    if (p.tracksInventory) {
      const inCart = this.cart().find((x) => x.productId === p.id)?.quantity ?? 0;
      if (inCart > Number(p.stockQty)) this.notify.info(`Solo hay ${Number(p.stockQty)} ${p.unit} de ${p.name}`);
    }
  }
  protected setQty(productId: string, q: number): void {
    const qty = Math.max(0, Number(q) || 0);
    this.cart.update((c) => (qty === 0 ? c.filter((x) => x.productId !== productId) : c.map((x) => (x.productId === productId ? { ...x, quantity: qty } : x))));
  }
  protected setDiscount(productId: string, d: number): void {
    this.cart.update((c) => c.map((x) => (x.productId === productId ? { ...x, discount: Math.max(0, Number(d) || 0) } : x)));
  }
  protected clear(): void { this.cart.set([]); this.resetCustomer(); this.editingDiscount.set(null); this.focusSearch(); }
  private resetCustomer(): void {
    const d = this.settings()?.defaultPartner;
    this.customer.set(d ? { id: d.id, name: d.name, taxId: null, defaultNcfType: null } : null);
    this.ncfType.set(this.settings()?.defaultNcfType ?? null);
  }
  protected pickCustomer(c: PosCustomer): void {
    this.customer.set({ id: c.id, name: c.name, taxId: c.taxId, defaultNcfType: c.defaultNcfType });
    this.ncfType.set(c.defaultNcfType ?? (c.taxId ? this.settings()?.fiscalCreditNcfType ?? null : this.settings()?.defaultNcfType ?? null));
    this.customerOpen.set(false);
  }
  protected pickDefaultCustomer(): void { this.resetCustomer(); this.customerOpen.set(false); }

  /** Enter en la búsqueda: código de barras o código exacto, o el único resultado. */
  protected onSearchEnter(): void {
    const q = this.query().trim();
    if (!q) return;
    const ps = this.catalog()?.products ?? [];
    const exact = ps.find((p) => p.barcodes.includes(q) || p.code.toLowerCase() === q.toLowerCase());
    const one = exact ?? (this.visibleProducts().length === 1 ? this.visibleProducts()[0] : null);
    if (one) { this.add(one); this.query.set(''); }
    else if (!this.visibleProducts().length) this.notify.info(`No hay un producto con «${q}»`);
  }
  private focusSearch(): void { queueMicrotask(() => this.searchBox()?.nativeElement.focus()); }

  // ---------------- Autorizaciones ----------------
  private askApproval(action: string): Promise<string | null> {
    return new Promise((resolve) => { this.approvalResolve = resolve; this.approvalAction.set(action); });
  }
  protected approvalDone(id: string | null): void {
    this.approvalAction.set(null);
    const r = this.approvalResolve; this.approvalResolve = null;
    r?.(id);
  }
  /** Ejecuta la acción; si el servidor pide autorización de supervisor, la pide y reintenta. */
  private async withApproval<T>(fn: (approvalId?: string) => Promise<T>): Promise<T | null> {
    try { return await fn(); }
    catch (e) {
      if (posErrorCode(e) !== 'APPROVAL_REQUIRED') throw e;
      const action = (e as { error: { action: string } }).error.action;
      const id = await this.askApproval(action);
      if (!id) return null;
      return fn(id);
    }
  }

  // ---------------- Cobrar ----------------
  protected startPay(): void {
    if (!this.lines().length || !this.shift()) return;
    this.checkoutId = uuid(); // mismo id en los reintentos: el servidor no cobra dos veces
    this.payError.set(''); this.payOpen.set(true);
  }
  protected async pay(ev: { payments: PayLine[]; allowCredit: boolean }): Promise<void> {
    const s = this.shift();
    if (!s || this.busy()) return;
    this.busy.set(true); this.payError.set('');
    const body = {
      clientUuid: this.checkoutId ?? uuid(), shiftId: s.id, partnerId: this.customer()?.id, ncfType: this.ncfType() ?? undefined,
      lines: this.cart().map((i) => ({ productId: i.productId, quantity: i.quantity, ...(i.discount ? { discount: i.discount } : {}) })),
      payments: ev.payments.map((p) => ({ method: p.method, amount: Number(p.amount), ...(p.reference ? { reference: p.reference } : {}) })),
      expectedTotal: Number(this.totals().total.toFixed(2)), ...(ev.allowCredit ? { allowCredit: true } : {}),
    };
    try {
      const sale = await this.withApproval((approvalId) => this.pos.sell({ ...body, ...(approvalId ? { approvalId } : {}) }));
      if (sale) {
        this.payOpen.set(false);
        this.lastSale.set(sale);
        this.cart.set([]); this.resetCustomer(); this.checkoutId = null;
        if (this.autoPrint()) await this.print(sale.id);
        void this.refreshAfterSale();
      }
    } catch (e) {
      if (posErrorCode(e) === 'TOTAL_MISMATCH') { await this.loadCatalog().catch(() => undefined); }
      this.payError.set(errorMessage(e));
    }
    this.busy.set(false);
  }
  private async refreshAfterSale(): Promise<void> {
    await Promise.all([this.loadCatalog(), this.loadShift()]).catch(() => undefined);
    this.focusSearch();
  }
  protected toggleAutoPrint(): void { this.autoPrint.update((v) => !v); write(AUTOPRINT_KEY, this.autoPrint() ? '1' : '0'); }
  protected async print(saleId: string): Promise<void> {
    try { printTicket(await this.pos.ticket(saleId)); } catch (e) { this.notify.error(errorMessage(e)); }
  }
  protected newSale(): void { this.lastSale.set(null); this.focusSearch(); }

  // ---------------- Suspender y recuperar ----------------
  protected async park(): Promise<void> {
    const t = this.terminalId();
    if (!t || !this.cart().length) return;
    const now = new Date().toLocaleTimeString('es-DO', { hour: '2-digit', minute: '2-digit' });
    try {
      await this.pos.park({
        terminalId: t, label: `${this.customer()?.name ?? 'Venta'} · ${now}`,
        payload: { lines: this.cart().map((i) => ({ productId: i.productId, quantity: String(i.quantity), discount: String(i.discount) })), partnerId: this.customer()?.id ?? null, ncfType: this.ncfType() },
      });
      this.notify.ok('Venta suspendida. Recupérala con F10.');
      this.clear();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
  protected async showParked(): Promise<void> {
    const t = this.terminalId();
    if (!t) return;
    try { this.parkedItems.set(await this.pos.parked(t)); this.parkedOpen.set(true); } catch (e) { this.notify.error(errorMessage(e)); }
  }
  protected async resume(p: Parked): Promise<void> {
    if (this.cart().length) { this.notify.info('Cobra, suspende o limpia la venta actual antes de recuperar otra'); return; }
    try {
      const got = await this.pos.resume(p.id);
      const known = got.payload.lines.filter((l) => this.productById().has(l.productId));
      this.cart.set(known.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), discount: Number(l.discount) })));
      if (known.length < got.payload.lines.length) this.notify.info('Algún producto ya no se vende y se quitó de la venta');
      this.parkedOpen.set(false);
    } catch (e) { this.notify.error(errorMessage(e)); }
  }
  protected async discard(p: Parked): Promise<void> {
    try { await this.pos.discard(p.id); this.parkedItems.update((l) => l.filter((x) => x.id !== p.id)); } catch (e) { this.notify.error(errorMessage(e)); }
  }

  // ---------------- Efectivo, ventas del turno y cierre ----------------
  protected async cashSubmit(ev: { mode: 'IN' | 'OUT' | 'DRAWER'; amount: number; accountId: string; reason: string }): Promise<void> {
    const s = this.shift();
    if (!s) return;
    this.busy.set(true);
    try {
      const ok = ev.mode === 'DRAWER'
        ? await this.withApproval((approvalId) => this.pos.drawer(s.id, { reason: ev.reason, ...(approvalId ? { approvalId } : {}) }))
        : await this.withApproval((approvalId) => this.pos.movement(s.id, { type: ev.mode, amount: ev.amount, reason: ev.reason, accountId: ev.accountId, ...(approvalId ? { approvalId } : {}) }));
      if (ok) { this.cashOpen.set(false); this.notify.ok(ev.mode === 'DRAWER' ? 'Gaveta abierta (quedó registrado).' : 'Movimiento de efectivo registrado.'); await this.loadShift(); }
    } catch (e) { this.notify.error(errorMessage(e)); }
    this.busy.set(false);
  }
  protected async voidSale(r: VoidRequest): Promise<void> {
    this.busy.set(true); this.salesError.set('');
    try {
      const ok = await this.withApproval((approvalId) => this.pos.voidSale(r.sale.id, { reason: r.reason, reasonCode: r.reasonCode, ...(approvalId ? { approvalId } : {}) }));
      if (ok) { this.notify.ok(`Venta ${r.sale.number} anulada.`); this.salesRefresh.update((n) => n + 1); void this.refreshAfterSale(); }
    } catch (e) { this.salesError.set(errorMessage(e)); }
    this.busy.set(false);
  }
  protected async returnSale(r: ReturnRequest): Promise<void> {
    const s = this.shift();
    if (!s) return;
    this.busy.set(true); this.salesError.set('');
    try {
      const ok = await this.withApproval((approvalId) => this.pos.returnSale(r.sale.id, { shiftId: s.id, lines: r.lines, refundMethod: r.refundMethod, reason: r.reason, ...(approvalId ? { approvalId } : {}) }));
      if (ok) { this.notify.ok('Devolución registrada. Entrega el dinero al cliente.'); this.salesRefresh.update((n) => n + 1); void this.refreshAfterSale(); }
    } catch (e) { this.salesError.set(errorMessage(e)); }
    this.busy.set(false);
  }
  protected async startClose(): Promise<void> {
    if (this.cart().length) { this.notify.info('Cobra, suspende o limpia la venta actual antes de cerrar'); return; }
    this.closeResult.set(null); this.closeError.set(''); this.closeShift.set(this.shift());
  }
  protected async confirmClose(ev: { countedCash: number; countDetail: Record<string, number>; notes?: string }): Promise<void> {
    const s = this.shift();
    if (!s) return;
    this.busy.set(true); this.closeError.set('');
    try { this.closeResult.set(await this.pos.closeShift(s.id, ev)); } catch (e) { this.closeError.set(errorMessage(e)); }
    this.busy.set(false);
  }
  protected closeDone(): void { this.closeShift.set(null); this.closeResult.set(null); this.shift.set(null); this.openingCash = 0; }

  protected exit(): void {
    if (this.auth.role() === 'CASHIER') this.auth.logout();
    else void this.router.navigateByUrl('/');
  }

  // ---------------- Teclado ----------------
  @HostListener('document:keydown', ['$event'])
  protected onKey(e: KeyboardEvent): void {
    if (!this.shift() || this.anyModal()) return;
    if (e.key === 'F2') { e.preventDefault(); this.focusSearch(); }
    else if (e.key === 'F9') { e.preventDefault(); void this.park(); }
    else if (e.key === 'F10') { e.preventDefault(); void this.showParked(); }
    else if (e.key === 'F12') { e.preventDefault(); this.startPay(); }
    else if (e.key === 'Enter' && this.lastSale() && document.activeElement !== this.searchBox()?.nativeElement) { this.newSale(); }
  }
  private anyModal(): boolean {
    return this.payOpen() || !!this.approvalAction() || this.customerOpen() || this.parkedOpen() || this.cashOpen() || this.salesOpen() || !!this.closeShift();
  }
}
