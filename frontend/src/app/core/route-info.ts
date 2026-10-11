import { Injectable, inject, signal } from '@angular/core';
import { ActivatedRouteSnapshot, NavigationEnd, Router } from '@angular/router';

export interface RouteState {
  /** URL sin parámetros de consulta ni ancla: "/invoices/3f2a…". */
  url: string;
  /** Patrón de la ruta, tal como se escribe en *.routes.ts con "/" delante: "/invoices/:id" ("/" para el Panel). */
  pattern: string;
  /** `title` de la ruta (el mismo que ve la pestaña del navegador). */
  title: string;
}

function deepest(s: ActivatedRouteSnapshot): ActivatedRouteSnapshot {
  let cur = s;
  while (cur.firstChild) cur = cur.firstChild;
  return cur;
}

/** Dónde está el usuario ahora mismo. Lo usan las migas y el "siguiente paso" (ninguna pantalla pasa nada). */
@Injectable({ providedIn: 'root' })
export class RouteInfo {
  private readonly router = inject(Router);
  readonly state = signal<RouteState>(this.snapshot());

  constructor() {
    this.router.events.subscribe((e) => { if (e instanceof NavigationEnd) this.state.set(this.snapshot()); });
  }

  private snapshot(): RouteState {
    const leaf = deepest(this.router.routerState.snapshot.root);
    const path = leaf.routeConfig?.path ?? '';
    const title = typeof leaf.title === 'string' ? leaf.title : '';
    return {
      url: this.router.url.split(/[?#]/)[0] || '/',
      pattern: path === '**' ? '' : '/' + path,
      title,
    };
  }
}
