import { Injectable, computed, signal } from '@angular/core';

export interface HelpSection { slug: string; archivo: string; titulo: string; resumen?: string }
export interface HelpScreen { seccion?: string; ancla?: string }
interface AyudaJson { secciones?: HelpSection[]; pantallas?: Record<string, HelpScreen> }

/** Solo nombres de archivo simples dentro de manual/: nunca rutas, ni "..", ni direcciones externas. */
const SAFE_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

/**
 * Lee `public/manual/ayuda.json` (secciones y pantalla -> sección) y los .md. Todo viene del mismo servidor
 * (CSP 'self') y se guarda en memoria durante la sesión: cada archivo se pide una sola vez.
 */
@Injectable({ providedIn: 'root' })
export class HelpContent {
  private readonly data = signal<AyudaJson>({});
  private loading: Promise<void> | null = null;
  private readonly docs = new Map<string, Promise<string | null>>();

  readonly ready = signal(false);
  readonly sections = computed<HelpSection[]>(() => (this.data().secciones ?? []).filter((s) => s.slug && s.titulo));

  load(): Promise<void> {
    this.loading ??= (async () => {
      try {
        const res = await fetch('manual/ayuda.json', { cache: 'no-cache' });
        if (res.ok && !(res.headers.get('content-type') ?? '').includes('text/html')) this.data.set((await res.json()) as AyudaJson);
      } catch { /* sin ayuda.json: el manual queda vacío, la app sigue */ }
      this.ready.set(true);
    })();
    return this.loading;
  }

  section(slug: string): HelpSection | null {
    return this.sections().find((s) => s.slug === slug) ?? null;
  }
  /** Sección a la que apunta un archivo ("03-clientes.md"), para resolver enlaces entre secciones. */
  sectionByFile(file: string): HelpSection | null {
    return this.sections().find((s) => s.archivo === file) ?? null;
  }
  /** Qué sección y ancla explican una pantalla (patrón de ruta como en *.routes.ts: "/invoices/:id"). */
  forScreen(pattern: string): { section: HelpSection; anchor: string | null } | null {
    const e = this.data().pantallas?.[pattern];
    const section = e?.seccion ? this.section(e.seccion) : null;
    return section ? { section, anchor: e?.ancla ?? null } : null;
  }

  /** Texto Markdown de una sección; null si no existe todavía (o el servidor devolvió la página de inicio). */
  markdown(section: HelpSection): Promise<string | null> {
    if (!SAFE_FILE.test(section.archivo)) return Promise.resolve(null);
    let p = this.docs.get(section.archivo);
    if (!p) {
      p = (async () => {
        try {
          const res = await fetch('manual/' + section.archivo, { cache: 'no-cache' });
          if (!res.ok || (res.headers.get('content-type') ?? '').includes('text/html')) return null;
          return await res.text();
        } catch { return null; }
      })();
      this.docs.set(section.archivo, p);
    }
    return p;
  }
}
