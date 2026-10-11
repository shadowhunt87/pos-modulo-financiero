import { Injectable, signal } from '@angular/core';

export interface GuideLink { texto: string; ruta: string }
export interface FieldHelpDef { texto: string; seccion?: string; ancla?: string }
export interface ErrorHelpDef { patron: string; explicacion: string; enlace?: GuideLink }
interface AyudaJson {
  pantallas?: Record<string, { seccion?: string; ancla?: string; siguiente?: GuideLink }>;
  campos?: Record<string, string | FieldHelpDef>;
  errores?: ErrorHelpDef[] | Record<string, Omit<ErrorHelpDef, 'patron'>>;
}

/**
 * "Siguiente paso" por defecto, para que la línea aparezca desde ya en las pantallas existentes.
 * Lo que diga `public/manual/ayuda.json` -> `pantallas[ruta].siguiente` tiene prioridad.
 * Clave = patrón de ruta exactamente como en *.routes.ts, con "/" delante.
 */
const DEFAULT_NEXT: Record<string, GuideLink> = {
  '/': { texto: 'Crea tu primera factura', ruta: '/invoices/new' },
  '/partners': { texto: 'Crea una factura para uno de tus clientes', ruta: '/invoices/new' },
  '/invoices': { texto: 'Registra el cobro de una factura', ruta: '/payments/new' },
  '/invoices/new': { texto: 'Al guardarla, registra el cobro cuando tu cliente pague', ruta: '/payments' },
  '/invoices/:id': { texto: 'Registra el cobro de esta factura', ruta: '/payments/new' },
  '/payments': { texto: 'Mira lo que todavía te deben o debes', ruta: '/receivables' },
  '/payments/new': { texto: 'Mira lo que todavía te deben o debes', ruta: '/receivables' },
  '/payments/:id': { texto: 'Mira lo que todavía te deben o debes', ruta: '/receivables' },
  '/receivables': { texto: 'Registra un cobro o un pago', ruta: '/payments/new' },
  '/bank-accounts': { texto: 'Compara tu banco con tus libros en la conciliación', ruta: '/reconciliations' },
  '/reconciliations': { texto: 'Revisa tus estados financieros', ruta: '/reports' },
  '/entries': { texto: 'Revisa tus estados financieros', ruta: '/reports' },
  '/accounts': { texto: 'Revisa los asientos que usan tus cuentas', ruta: '/entries' },
  '/reports': { texto: 'Prepara los reportes para la DGII', ruta: '/dgii' },
  '/dgii': { texto: 'Revisa tus estados financieros', ruta: '/reports' },
  '/budgets': { texto: 'Compara lo presupuestado con lo real en Estados financieros', ruta: '/reports' },
  '/tax-rates': { texto: 'Crea una factura con tus impuestos', ruta: '/invoices/new' },
  '/ncf': { texto: 'Crea una factura con tu comprobante fiscal', ruta: '/invoices/new' },
  '/company': { texto: 'Agrega a tus clientes y proveedores', ruta: '/partners' },
};

/** Lector de `public/manual/ayuda.json` (solo lectura, una vez por sesión). Si no existe, usa lo incorporado. */
@Injectable({ providedIn: 'root' })
export class Guidance {
  private readonly data = signal<AyudaJson>({});
  private loading: Promise<void> | null = null;

  /** Carga ayuda.json una sola vez; nunca falla (si no está, la app funciona con lo incorporado). */
  load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const res = await fetch('manual/ayuda.json', { cache: 'no-cache' });
        if (res.ok) this.data.set((await res.json()) as AyudaJson);
      } catch { /* sin ayuda.json todavía */ }
    })();
    return this.loading;
  }

  nextStep(pattern: string): GuideLink | null {
    return this.data().pantallas?.[pattern]?.siguiente ?? DEFAULT_NEXT[pattern] ?? null;
  }

  /** Ayuda de campo por clave ("factura.tipoNcf"). Acepta texto simple o { texto, seccion, ancla }. */
  field(key: string): FieldHelpDef | null {
    const v = this.data().campos?.[key];
    return !v ? null : typeof v === 'string' ? { texto: v } : v;
  }

  /** Lista de "Cómo arreglarlo" (patrón de mensaje -> explicación -> enlace). */
  errors(): ErrorHelpDef[] {
    const e = this.data().errores;
    if (!e) return [];
    return Array.isArray(e) ? e : Object.entries(e).map(([patron, v]) => ({ patron, ...v }));
  }
}
