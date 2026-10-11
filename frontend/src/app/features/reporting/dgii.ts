import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api } from '../../core/api';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { fmtDate, today } from '../../shared/format';
import { INVOICE_TYPE } from '../../shared/labels';
import { ExportButtons, UI } from '../../shared/ui';
import { COLS_606, COLS_607, COLS_608, DgiiCol } from './dgii-codes';
import { DgiiReport } from './report-types';

type Fmt = '606' | '607' | '608';
const FORMATS: { id: Fmt; label: string; title: string }[] = [
  { id: '606', label: '606 · Compras', title: 'Formato 606: compras de bienes y servicios' },
  { id: '607', label: '607 · Ventas', title: 'Formato 607: ventas de bienes y servicios' },
  { id: '608', label: '608 · Anulados', title: 'Formato 608: comprobantes anulados' },
];
const COLS: Record<Fmt, DgiiCol[]> = { '606': COLS_606, '607': COLS_607, '608': COLS_608 };

@Component({
  selector: 'app-dgii',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ExportButtons, ...UI],
  templateUrl: './dgii.html',
  styles: `
    .issue-list { margin: 0; padding-left: 18px; }
    details.assume { margin-top: 14px; }
    details.assume summary { cursor: pointer; color: var(--text-dim); }
    details.assume ul { margin: 8px 0 0; padding-left: 18px; color: var(--text-dim); }
    .period-box { display: flex; gap: 6px; align-items: flex-end; }
  `,
})
export class Dgii {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);

  protected readonly FORMATS = FORMATS;
  protected readonly INVOICE_TYPE = INVOICE_TYPE;
  protected readonly pageSize = 100;

  protected readonly period = signal(today().slice(0, 7));
  protected readonly tab = signal<Fmt>('606');
  protected readonly loading = signal(false);
  protected readonly reports = signal<Partial<Record<Fmt, DgiiReport>>>({});
  protected readonly errors = signal<Partial<Record<Fmt, string>>>({});
  protected readonly page = signal(1);
  protected readonly downloading = signal(false);
  private seq = 0;

  protected readonly report = computed(() => this.reports()[this.tab()] ?? null);
  protected readonly loadError = computed(() => this.errors()[this.tab()] ?? '');
  protected readonly cols = computed(() => COLS[this.tab()]);
  protected readonly pageRows = computed(() => {
    const rows = this.report()?.rows ?? [];
    return rows.slice((this.page() - 1) * this.pageSize, this.page() * this.pageSize);
  });
  protected readonly exportQuery = computed(() => ({ period: this.period() }));

  constructor() { void this.load(); }

  protected setPeriod(v: string): void {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(v)) return;
    this.period.set(v);
    void this.load();
  }
  protected shift(delta: number): void {
    const [y, m] = this.period().split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    this.setPeriod(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  protected setTab(t: Fmt): void { this.tab.set(t); this.page.set(1); }
  protected goTo(p: number): void { this.page.set(p); }

  protected async load(): Promise<void> {
    const id = ++this.seq;
    const period = this.period();
    this.loading.set(true);
    this.page.set(1);
    const results = await Promise.allSettled(FORMATS.map((f) => this.api.getP<DgiiReport>(`/dgii/${f.id}`, { period })));
    if (id !== this.seq) return;
    const reports: Partial<Record<Fmt, DgiiReport>> = {};
    const errors: Partial<Record<Fmt, string>> = {};
    results.forEach((r, i) => {
      const f = FORMATS[i].id;
      if (r.status === 'fulfilled') reports[f] = r.value; else errors[f] = errorMessage(r.reason);
    });
    this.reports.set(reports);
    this.errors.set(errors);
    this.loading.set(false);
  }

  protected async downloadTxt(): Promise<void> {
    const r = this.report();
    if (!r || !r.canExport || this.downloading()) return;
    this.downloading.set(true);
    try {
      await this.api.download(`/dgii/${r.format}/txt`, { period: this.period() }, r.fileName);
      this.notify.ok(`Archivo del ${r.format} generado.`);
    } catch {
      this.notify.error(`No se pudo generar el TXT del ${r.format}. Revisa los errores del reporte y vuelve a intentar.`);
    }
    this.downloading.set(false);
  }

  /** Valor de una celda ya formateado para mostrar. */
  protected cell(row: Record<string, string>, c: DgiiCol): string {
    const v = row[c.key] ?? '';
    if (!v) return '';
    if (c.type === 'date') return v.length === 8 ? fmtDate(`${v.slice(0, 4)}-${v.slice(4, 6)}-${v.slice(6, 8)}`) : v;
    if (c.type === 'map') return c.map?.[v] ? `${v} · ${c.map[v]}` : v;
    return v;
  }
  protected periodLabel(p: string): string { return `${p.slice(4, 6)}/${p.slice(0, 4)}`; }
}
