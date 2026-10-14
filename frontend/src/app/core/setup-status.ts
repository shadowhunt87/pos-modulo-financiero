import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api';

export interface SetupGroup { key: string; title: string; done: boolean; reason: string; route: string }
export interface SetupStatus { done: number; total: number; groups: SetupGroup[] }

/** Estado del arranque (GET /guidance/setup-status) y de los datos de ejemplo, compartido por el Panel, el menú y los avisos. */
@Injectable({ providedIn: 'root' })
export class SetupState {
  private readonly api = inject(Api);
  readonly status = signal<SetupStatus | null>(null);
  readonly samples = signal(false);

  async load(): Promise<SetupStatus | null> {
    try {
      const [s, d] = await Promise.all([
        this.api.getP<SetupStatus>('/guidance/setup-status'),
        this.api.getP<{ loaded: boolean }>('/guidance/sample-data'),
      ]);
      this.status.set(s); this.samples.set(d.loaded);
    } catch { /* sin dato: no se muestran avisos */ }
    return this.status();
  }
}
