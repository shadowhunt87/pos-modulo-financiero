import { HttpClient, HttpParams, HttpResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable, firstValueFrom } from 'rxjs';
import { AppConfig } from './config';

export type Query = Record<string, string | number | boolean | null | undefined>;

/** Página que devuelven los listados paginados del backend. */
export interface Page<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

function toParams(q?: Query): HttpParams {
  let p = new HttpParams();
  if (!q) return p;
  for (const [k, v] of Object.entries(q)) {
    if (v === null || v === undefined || v === '') continue;
    p = p.set(k, String(v));
  }
  return p;
}

/** Cliente HTTP delgado. La URL base y el token los pone la config y el interceptor. */
@Injectable({ providedIn: 'root' })
export class Api {
  private readonly http = inject(HttpClient);
  private readonly cfg = inject(AppConfig);

  url(path: string): string {
    return this.cfg.apiUrl + (path.startsWith('/') ? path : '/' + path);
  }
  get<T>(path: string, q?: Query): Observable<T> {
    return this.http.get<T>(this.url(path), { params: toParams(q) });
  }
  post<T>(path: string, body?: unknown): Observable<T> {
    return this.http.post<T>(this.url(path), body ?? {});
  }
  put<T>(path: string, body?: unknown): Observable<T> {
    return this.http.put<T>(this.url(path), body ?? {});
  }
  patch<T>(path: string, body?: unknown): Observable<T> {
    return this.http.patch<T>(this.url(path), body ?? {});
  }
  delete<T>(path: string): Observable<T> {
    return this.http.delete<T>(this.url(path));
  }
  /** Sube un archivo (multipart). `fields` van como campos de texto del formulario. */
  upload<T>(path: string, file: File, fields: Record<string, string> = {}): Observable<T> {
    const fd = new FormData();
    for (const [k, v] of Object.entries(fields)) fd.append(k, v);
    fd.append('file', file, file.name);
    return this.http.post<T>(this.url(path), fd);
  }

  /** Sube varios archivos en un solo envío (multipart), todos en el mismo campo. */
  uploadFiles<T>(path: string, files: File[], field = 'files'): Observable<T> {
    const fd = new FormData();
    for (const f of files) fd.append(field, f, f.name);
    return this.http.post<T>(this.url(path), fd);
  }

  /** Versión en promesa de get (cómoda dentro de async/await). */
  getP<T>(path: string, q?: Query): Promise<T> {
    return firstValueFrom(this.get<T>(path, q));
  }

  /** Recorre todas las páginas de un listado paginado (limit máx. 100 en el backend). */
  async getAll<T>(path: string, q: Query = {}): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; page < 200; page++) {
      const res = await this.getP<Page<T>>(path, { ...q, page, limit: 100 });
      out.push(...res.data);
      if (out.length >= res.total || res.data.length === 0) break;
    }
    return out;
  }

  /** Descarga un archivo autenticado (PDF, Excel, TXT, adjuntos) y lo guarda con el nombre del servidor. */
  async download(path: string, q?: Query, fallbackName = 'archivo'): Promise<void> {
    const res: HttpResponse<Blob> = await firstValueFrom(
      this.http.get(this.url(path), { params: toParams(q), observe: 'response', responseType: 'blob' }),
    );
    const name = filenameFrom(res.headers.get('content-disposition')) ?? fallbackName;
    saveBlob(res.body as Blob, name);
  }
}

function filenameFrom(header: string | null): string | null {
  if (!header) return null;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try { return decodeURIComponent(star[1]); } catch { /* sigue */ }
  }
  const plain = /filename="?([^";]+)"?/i.exec(header);
  return plain ? plain[1] : null;
}

export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
