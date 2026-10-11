import { Injectable } from '@angular/core';

/** Configuración de ejecución: public/config.json (se puede cambiar sin recompilar). */
@Injectable({ providedIn: 'root' })
export class AppConfig {
  apiUrl = '/api';

  async load(): Promise<void> {
    try {
      const res = await fetch('config.json', { cache: 'no-store' });
      if (res.ok) {
        const json = (await res.json()) as { apiUrl?: string };
        if (json.apiUrl) this.apiUrl = String(json.apiUrl).replace(/\/+$/, '');
      }
    } catch {
      /* se queda con el valor por defecto */
    }
  }
}
