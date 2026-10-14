import { Injectable, inject, signal } from '@angular/core';
import { Api } from './api';

export interface TwoFactorStatus { enabled: boolean; enabledAt: string | null; enabledIp: string | null; recoveryCodesRemaining: number; requiredForMyRole: boolean }

/** Estado del 2FA del usuario conectado (GET /users/me/two-factor), para saber si las confirmaciones piden el código. */
@Injectable({ providedIn: 'root' })
export class TwoFactorState {
  private readonly api = inject(Api);
  readonly status = signal<TwoFactorStatus | null>(null);

  async load(force = false): Promise<TwoFactorStatus | null> {
    if (this.status() && !force) return this.status();
    try { this.status.set(await this.api.getP<TwoFactorStatus>('/users/me/two-factor')); } catch { /* sin dato: se pide el código igual si el servidor lo exige */ }
    return this.status();
  }
}
