import { Injectable, signal } from '@angular/core';

export interface ConfirmRequest {
  title: string;
  message?: string;
  confirmText?: string;
  danger?: boolean;
  /** Si se define, pide un texto (p. ej. el motivo de una anulación). */
  prompt?: { label: string; required?: boolean; placeholder?: string };
}
export interface ConfirmState extends ConfirmRequest { resolve: (value: { ok: boolean; text: string }) => void }

/** Diálogos de confirmación propios (en vez de window.confirm). */
@Injectable({ providedIn: 'root' })
export class Confirm {
  readonly state = signal<ConfirmState | null>(null);

  ask(req: ConfirmRequest): Promise<boolean> {
    return this.open(req).then((r) => r.ok);
  }
  /** Pide un motivo: devuelve el texto, o null si cancela. */
  async reason(req: Omit<ConfirmRequest, 'prompt'> & { label?: string; required?: boolean }): Promise<string | null> {
    const r = await this.open({
      ...req,
      prompt: { label: req.label ?? 'Motivo', required: req.required ?? true },
    });
    return r.ok ? r.text.trim() : null;
  }
  private open(req: ConfirmRequest): Promise<{ ok: boolean; text: string }> {
    return new Promise((resolve) => this.state.set({ ...req, resolve }));
  }
  close(ok: boolean, text = ''): void {
    const s = this.state();
    this.state.set(null);
    s?.resolve({ ok, text });
  }
}
