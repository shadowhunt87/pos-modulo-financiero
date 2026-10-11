import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from './api';

export type Role = 'ADMIN' | 'ACCOUNTANT' | 'APPROVER' | 'VIEWER';

export interface SessionUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string;
}
interface AuthResponse { access_token: string; user: SessionUser }

const TOKEN_KEY = 'fm.token';
const USER_KEY = 'fm.user';

function read(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch { /* modo privado */ }
}
function expiresAt(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { exp?: number };
    return (payload.exp ?? 0) * 1000;
  } catch { return 0; }
}

@Injectable({ providedIn: 'root' })
export class Auth {
  private readonly api = inject(Api);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(this.initialToken());
  readonly user = signal<SessionUser | null>(this.initialUser());
  readonly loggedIn = computed(() => !!this.token() && !!this.user());
  readonly role = computed<Role | null>(() => this.user()?.role ?? null);

  private initialToken(): string | null {
    const t = read(TOKEN_KEY);
    if (t && expiresAt(t) > Date.now()) return t;
    write(TOKEN_KEY, null); write(USER_KEY, null);
    return null;
  }
  private initialUser(): SessionUser | null {
    if (!read(TOKEN_KEY)) return null;
    try { return JSON.parse(read(USER_KEY) ?? 'null') as SessionUser | null; } catch { return null; }
  }

  /** True si el token existe y no ha vencido. */
  isValid(): boolean {
    const t = this.token();
    return !!t && expiresAt(t) > Date.now() && !!this.user();
  }

  /** ¿El usuario tiene alguno de estos roles? */
  has(...roles: Role[]): boolean {
    const r = this.role();
    return !!r && roles.includes(r);
  }

  setSession(res: AuthResponse): void {
    this.token.set(res.access_token);
    this.user.set(res.user);
    write(TOKEN_KEY, res.access_token);
    write(USER_KEY, JSON.stringify(res.user));
  }
  /** Para cuando el backend devuelve un token nuevo (cambio de clave). */
  replaceToken(token: string): void {
    this.token.set(token);
    write(TOKEN_KEY, token);
  }
  updateUser(patch: Partial<SessionUser>): void {
    const u = this.user();
    if (!u) return;
    const next = { ...u, ...patch };
    this.user.set(next);
    write(USER_KEY, JSON.stringify(next));
  }

  async login(email: string, password: string): Promise<void> {
    const res = await firstValueFrom(this.api.post<AuthResponse>('/auth/login', { email: email.trim(), password }));
    this.setSession(res);
  }

  logout(returnUrl?: string): void {
    this.token.set(null);
    this.user.set(null);
    write(TOKEN_KEY, null);
    write(USER_KEY, null);
    void this.router.navigate(['/login'], returnUrl ? { queryParams: { returnUrl } } : {});
  }
}
