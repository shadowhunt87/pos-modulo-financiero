import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, debounceTime, firstValueFrom } from 'rxjs';
import { Api, Page } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { errorMessage } from '../../core/errors';
import { Notify } from '../../core/notify';
import { fmtDateTime } from '../../shared/format';
import { opts, ROLE } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { ConfirmIdentity } from '../../shared/ui/confirm-identity';
import { SECURITY_EVENT } from '../../shared/labels';

interface AppUser { id: string; email: string; name: string; role: string; active: boolean; lastLoginAt: string | null; createdAt: string; twoFactorEnabled?: boolean }
interface SecurityEvent {
  id: string; event: string; at: string; ip: string | null; via: string;
  actor: { name: string; email: string | null }; target: { id: string; name: string; email: string } | null;
  details: { method: string | null; kind: string | null; purpose: string | null; reason: string | null; motivo: string | null };
}

@Component({
  selector: 'app-users',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, ConfirmIdentity, ...UI],
  template: `
    <div class="page">
      <div class="page-head">
        <div><h1>Usuarios</h1><p class="sub">Personas con acceso a la empresa y su rol.</p></div>
        <button type="button" class="btn btn-primary" (click)="openNew()">Nuevo usuario</button>
      </div>

      <div class="toolbar">
        <div class="field wide"><label for="q">Buscar</label><input id="q" class="input" placeholder="Nombre o correo" (input)="search$.next($any($event.target).value)" /></div>
        <div class="field"><label for="role">Rol</label>
          <select id="role" class="select" (change)="setFilter('role', $any($event.target).value)">
            <option value="">Todos</option>@for (o of roleOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }
          </select></div>
        <div class="field"><label for="act">Estado</label>
          <select id="act" class="select" (change)="setFilter('active', $any($event.target).value)">
            <option value="">Todos</option><option value="true">Activos</option><option value="false">Inactivos</option>
          </select></div>
      </div>

      <app-error-notice [error]="error()" />
      <section class="panel">
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Nombre</th><th>Correo</th><th>Rol</th><th>Verificación en dos pasos</th><th>Último acceso</th><th>Estado</th><th></th></tr></thead>
            <tbody>
              @if (loading()) { <tr><td colspan="7"><div class="loading"><span class="spinner"></span> Cargando…</div></td></tr> }
              @for (u of rows(); track u.id) {
                <tr>
                  <td><strong>{{ u.name }}</strong>@if (u.id === me.user()?.id) { <span class="badge info" style="margin-left:6px">Tú</span> }</td>
                  <td>{{ u.email }}</td>
                  <td>{{ u.role | lbl: ROLE }}</td>
                  <td>@if (u.twoFactorEnabled) { <span class="badge pos">✓&nbsp;Activada</span> } @else { <span class="badge">–&nbsp;No</span> }</td>
                  <td class="dim">{{ u.lastLoginAt ? (u.lastLoginAt | fdatetime) : 'Nunca' }}</td>
                  <td><span class="badge" [class.pos]="u.active">{{ u.active ? 'Activo' : 'Inactivo' }}</span></td>
                  <td class="actions">
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openEdit(u)">Editar</button>
                    <button type="button" class="btn btn-ghost btn-sm" (click)="openReset(u)">Restablecer contraseña</button>
                    @if (u.twoFactorEnabled && u.id !== me.user()?.id) { <button type="button" class="btn btn-ghost btn-sm" (click)="openReset2fa(u)">Restablecer verificación</button> }
                    @if (u.id !== me.user()?.id) { <button type="button" class="btn btn-ghost btn-sm" (click)="toggle(u)">{{ u.active ? 'Desactivar' : 'Activar' }}</button> }
                  </td>
                </tr>
              } @empty {
                @if (!loading()) { <tr><td colspan="7"><app-empty-state title="No hay usuarios con esos filtros." /></td></tr> }
              }
            </tbody>
          </table>
        </div>
        <app-pagination [page]="page()" [limit]="limit" [total]="total()" (pageChange)="goTo($event)" />
      </section>

      <section class="panel section">
        <div class="panel-head"><h2>Cambios de seguridad (últimos 30 días)</h2></div>
        <div class="table-wrap">
          <table class="table">
            <thead><tr><th>Fecha</th><th>Qué pasó</th><th>Quién</th><th>A quién</th><th>Desde</th></tr></thead>
            <tbody>
              @for (e of events(); track e.id) {
                <tr>
                  <td class="nowrap">{{ e.at | fdatetime }}</td>
                  <td>{{ SECURITY_EVENT[e.event] ?? e.event }}@if (e.details.method === 'RECOVERY_CODE') { (con un código de emergencia) }@if (e.details.reason) { · {{ e.details.reason }} }</td>
                  <td>{{ e.via === 'operator-cli' ? 'Operador del sistema' : e.actor.name }}</td>
                  <td>{{ e.target?.name ?? '—' }}</td>
                  <td class="dim mono">{{ e.ip ?? '—' }}</td>
                </tr>
              } @empty { <tr><td colspan="5"><app-empty-state title="Sin cambios de seguridad en los últimos 30 días." /></td></tr> }
            </tbody>
          </table>
        </div>
      </section>
    </div>

    <app-modal [open]="modalOpen()" [title]="editing() ? 'Editar usuario' : 'Nuevo usuario'" width="560px" (closed)="modalOpen.set(false)">
      <form id="user-form" [formGroup]="form" (ngSubmit)="save()" novalidate>
        <div class="form-grid">
          <div class="field span-2"><label for="f-name">Nombre</label><input id="f-name" class="input" formControlName="name" />
            @if (form.controls.name.touched && form.controls.name.invalid) { <span class="error-text">Escribe el nombre.</span> }</div>
          <div class="field span-2"><label for="f-mail">Correo</label><input id="f-mail" class="input" type="email" formControlName="email" autocomplete="off" />
            @if (form.controls.email.touched && form.controls.email.invalid) { <span class="error-text">Escribe un correo válido.</span> }</div>
          <div class="field"><label for="f-role">Rol</label>
            <select id="f-role" class="select" formControlName="role">@for (o of roleOptions; track o.value) { <option [value]="o.value">{{ o.label }}</option> }</select></div>
          @if (!editing()) {
            <div class="field"><label for="f-pass">Contraseña inicial</label><input id="f-pass" class="input" type="password" formControlName="password" autocomplete="new-password" />
              @if (form.controls.password.touched && form.controls.password.invalid) { <span class="error-text">Mínimo 8 caracteres.</span> }
              <span class="hint">Compártela de forma segura; pídele que la cambie en su perfil.</span></div>
          } @else {
            <label class="check span-all"><input type="checkbox" formControlName="active" /> Usuario activo</label>
          }
        </div>
        @if (needsConfirm()) { <app-confirm-identity id="u-ci" [(password)]="cpw" [(code)]="ccode" /> }
        @if (formError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ formError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="modalOpen.set(false)">Cancelar</button>
        <button type="submit" form="user-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Guardar' }}</button>
      </ng-container>
    </app-modal>

    <app-modal [open]="resetOpen()" [title]="'Restablecer contraseña de ' + (resetting()?.name ?? '')" width="480px" (closed)="resetOpen.set(false)">
      <form id="reset-form" [formGroup]="resetForm" (ngSubmit)="doReset()" novalidate>
        <div class="field"><label for="r-pass">Contraseña nueva</label><input id="r-pass" class="input" type="password" formControlName="password" autocomplete="new-password" />
          @if (resetForm.controls.password.touched && resetForm.controls.password.invalid) { <span class="error-text">Entre 8 y 72 caracteres.</span> }
          <span class="hint">Las sesiones abiertas de este usuario se cerrarán.</span></div>
        <app-confirm-identity id="r-ci" [(password)]="cpw" [(code)]="ccode" />
        @if (resetError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ resetError() }}</div> }
      </form>
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="resetOpen.set(false)">Cancelar</button>
        <button type="submit" form="reset-form" class="btn btn-primary" [disabled]="saving()">{{ saving() ? 'Guardando…' : 'Restablecer' }}</button>
      </ng-container>
    </app-modal>

    <app-modal [open]="!!reset2fa()" [title]="'Restablecer la verificación de ' + (reset2fa()?.name ?? '')" width="520px" (closed)="reset2fa.set(null)">
      <p>Se quita la verificación en dos pasos de esta persona y se le pone una <strong>clave nueva</strong>. Sus sesiones abiertas se cierran.
        Tendrá 72 horas para volver a inscribir su teléfono.</p>
      <div class="field"><label for="t-pass">Clave nueva para el usuario</label>
        <input id="t-pass" class="input" type="password" autocomplete="new-password" maxlength="72" [value]="newPass()" (input)="newPass.set($any($event.target).value)" />
        <span class="hint">Dísela por teléfono (nunca por correo) y pídele que la cambie al entrar.</span></div>
      <app-confirm-identity id="t-ci" [(password)]="cpw" [(code)]="ccode" />
      @if (resetError()) { <div class="notice neg" style="margin-top:14px" role="alert">{{ resetError() }}</div> }
      <ng-container modal-actions>
        <button type="button" class="btn" (click)="reset2fa.set(null)">Cancelar</button>
        <button type="button" class="btn btn-danger" [disabled]="saving() || newPass().length < 8" (click)="doReset2fa()">{{ saving() ? 'Restableciendo…' : 'Restablecer verificación' }}</button>
      </ng-container>
    </app-modal>
  `,
})
export class Users {
  private readonly api = inject(Api);
  private readonly fb = inject(FormBuilder);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly destroyRef = inject(DestroyRef);
  protected readonly me = inject(Auth);

  protected readonly ROLE = ROLE;
  protected readonly SECURITY_EVENT = SECURITY_EVENT;
  // Confirmación reforzada (ANEXO-S0 3.10b): crear usuarios, ascender a ADMIN, cambiar el correo de un ADMIN, claves y 2FA
  protected readonly cpw = signal('');
  protected readonly ccode = signal('');
  protected readonly events = signal<SecurityEvent[]>([]);
  protected readonly reset2fa = signal<AppUser | null>(null);
  protected readonly newPass = signal('');
  private readonly formRole = signal('VIEWER');
  private readonly formEmail = signal('');
  protected needsConfirm(): boolean {
    const cur = this.editing();
    if (!cur) return true;
    return (this.formRole() === 'ADMIN' && cur.role !== 'ADMIN') || (cur.role === 'ADMIN' && this.formEmail().trim() !== cur.email);
  }
  private confirmBody() { return { confirmPassword: this.cpw(), ...(this.ccode().trim() ? { confirmCode: this.ccode().trim() } : {}) }; }
  private clearConfirm() { this.cpw.set(''); this.ccode.set(''); }
  protected readonly roleOptions = opts.role;
  protected readonly limit = 25;

  protected readonly rows = signal<AppUser[]>([]);
  protected readonly total = signal(0);
  protected readonly page = signal(1);
  protected readonly loading = signal(true);
  protected readonly error = signal('');
  private filters: Record<string, string> = {};
  protected readonly search$ = new Subject<string>();

  protected readonly modalOpen = signal(false);
  protected readonly editing = signal<AppUser | null>(null);
  protected readonly saving = signal(false);
  protected readonly formError = signal('');
  protected readonly form = this.fb.nonNullable.group({
    name: ['', [Validators.required, Validators.maxLength(150)]],
    email: ['', [Validators.required, Validators.email]],
    role: ['VIEWER', Validators.required],
    password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]],
    active: [true],
  });

  protected readonly resetOpen = signal(false);
  protected readonly resetting = signal<AppUser | null>(null);
  protected readonly resetError = signal('');
  protected readonly resetForm = this.fb.nonNullable.group({ password: ['', [Validators.required, Validators.minLength(8), Validators.maxLength(72)]] });

  constructor() {
    this.search$.pipe(debounceTime(300), takeUntilDestroyed(this.destroyRef)).subscribe((q) => this.setFilter('q', q));
    this.form.controls.role.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => this.formRole.set(v));
    this.form.controls.email.valueChanges.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((v) => this.formEmail.set(v));
    void this.load();
    void this.loadEvents();
  }

  protected setFilter(key: string, value: string): void { this.filters = { ...this.filters, [key]: value }; this.page.set(1); void this.load(); }
  protected goTo(p: number): void { this.page.set(p); void this.load(); }

  private async load(): Promise<void> {
    this.loading.set(true); this.error.set('');
    try {
      const res = await this.api.getP<Page<AppUser>>('/users', { ...this.filters, page: this.page(), limit: this.limit });
      this.rows.set(res.data); this.total.set(res.total);
    } catch (e) { this.error.set(errorMessage(e)); }
    this.loading.set(false);
  }

  private async loadEvents(): Promise<void> {
    try { this.events.set(await this.api.getP<SecurityEvent[]>('/users/security-events', { days: 30 })); } catch { /* el bloque queda vacío */ }
  }

  protected openNew(): void {
    this.editing.set(null); this.formError.set(''); this.clearConfirm();
    this.form.reset({ name: '', email: '', role: 'VIEWER', password: '', active: true });
    this.form.controls.password.enable();
    this.modalOpen.set(true);
  }
  protected openEdit(u: AppUser): void {
    this.editing.set(u); this.formError.set(''); this.clearConfirm();
    this.form.reset({ name: u.name, email: u.email, role: u.role, password: '', active: u.active });
    this.form.controls.password.disable();
    this.modalOpen.set(true);
  }

  protected async save(): Promise<void> {
    this.form.markAllAsTouched();
    if (this.form.invalid || this.saving()) return;
    this.saving.set(true); this.formError.set('');
    const v = this.form.getRawValue();
    const cur = this.editing();
    try {
      if (cur) {
        const isSelf = cur.id === this.me.user()?.id;
        await firstValueFrom(this.api.patch(`/users/${cur.id}`, {
          name: v.name.trim(), email: v.email.trim(), role: v.role, ...(isSelf ? {} : { active: v.active }),
          ...(this.needsConfirm() ? this.confirmBody() : {}),
        }));
        if (isSelf) this.me.updateUser({ name: v.name.trim(), email: v.email.trim() });
        this.notify.ok('Usuario actualizado.');
      } else {
        await firstValueFrom(this.api.post('/auth/register', { email: v.email.trim(), password: v.password, name: v.name.trim(), role: v.role, ...this.confirmBody() }));
        this.notify.ok('Usuario creado.');
      }
      this.modalOpen.set(false);
      this.clearConfirm();
      await this.load();
      void this.loadEvents();
    } catch (e) { this.formError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected async toggle(u: AppUser): Promise<void> {
    const to = !u.active;
    if (!(await this.confirm.ask({
      title: to ? 'Activar usuario' : 'Desactivar usuario',
      message: to ? `${u.name} podrá iniciar sesión de nuevo.` : `${u.name} ya no podrá iniciar sesión. Su historial se conserva.`,
      confirmText: to ? 'Activar' : 'Desactivar', danger: !to,
    }))) return;
    try {
      await firstValueFrom(this.api.patch(`/users/${u.id}`, { active: to }));
      this.notify.ok(to ? 'Usuario activado.' : 'Usuario desactivado.');
      await this.load();
    } catch (e) { this.notify.error(errorMessage(e)); }
  }

  protected openReset(u: AppUser): void {
    this.resetting.set(u); this.resetError.set(''); this.resetForm.reset({ password: '' }); this.clearConfirm();
    this.resetOpen.set(true);
  }
  protected async doReset(): Promise<void> {
    this.resetForm.markAllAsTouched();
    const u = this.resetting();
    if (!u || this.resetForm.invalid || this.saving()) return;
    this.saving.set(true); this.resetError.set('');
    try {
      await firstValueFrom(this.api.post(`/users/${u.id}/reset-password`, { password: this.resetForm.getRawValue().password, ...this.confirmBody() }));
      this.notify.ok(`Contraseña de ${u.name} restablecida.`);
      this.resetOpen.set(false);
      this.clearConfirm();
      void this.loadEvents();
    } catch (e) { this.resetError.set(errorMessage(e)); }
    this.saving.set(false);
  }

  protected openReset2fa(u: AppUser): void { this.reset2fa.set(u); this.newPass.set(''); this.resetError.set(''); this.clearConfirm(); }
  protected async doReset2fa(): Promise<void> {
    const u = this.reset2fa();
    if (!u || this.saving()) return;
    this.saving.set(true); this.resetError.set('');
    try {
      await firstValueFrom(this.api.post(`/users/${u.id}/reset-two-factor`, { newPassword: this.newPass(), ...this.confirmBody() }));
      this.notify.ok(`Verificación de ${u.name} restablecida. Dale la clave nueva por teléfono.`);
      this.reset2fa.set(null);
      this.clearConfirm();
      await this.load();
      void this.loadEvents();
    } catch (e) { this.resetError.set(errorMessage(e)); }
    this.saving.set(false);
  }
}
