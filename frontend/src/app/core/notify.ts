import { Injectable, signal } from '@angular/core';

export interface Toast { id: number; kind: 'ok' | 'error' | 'info'; text: string }

@Injectable({ providedIn: 'root' })
export class Notify {
  readonly toasts = signal<Toast[]>([]);
  private seq = 0;

  ok(text: string): void { this.push('ok', text, 4000); }
  info(text: string): void { this.push('info', text, 5000); }
  error(text: string): void { this.push('error', text, 9000); }

  dismiss(id: number): void { this.toasts.update((l) => l.filter((t) => t.id !== id)); }

  private push(kind: Toast['kind'], text: string, ms: number): void {
    const id = ++this.seq;
    this.toasts.update((l) => [...l.slice(-3), { id, kind, text }]);
    setTimeout(() => this.dismiss(id), ms);
  }
}
