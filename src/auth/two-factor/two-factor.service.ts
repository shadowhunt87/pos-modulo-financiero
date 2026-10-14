import {
  HttpException, HttpStatus, Injectable, Logger, OnApplicationBootstrap, ServiceUnavailableException, UnauthorizedException, UnprocessableEntityException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { hkdfSync } from 'node:crypto';
import * as bcrypt from 'bcrypt';
import qrcode from 'qrcode-generator';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditAction, UserRole } from '../../generated/prisma/enums.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit, type AuditMeta } from '../../common/audit.js';
import { AttemptLimiter, TooManyAttemptsException, passwordRules, twoFactorIpRule } from '../attempt-limiter.js';
import type { AuthUser } from '../types/auth-user.js';
import { SecretBox, SecretBoxKeyError, aadFor } from './secret-box.js';
import { base32Decode, base32Encode, groupSecret, looksLikeTotp, newSecret, otpauthUri, stepAt, verifyTotp } from './totp.js';
import { hashRecoveryCode, newRecoveryCodes, normalizeRecoveryCode } from './recovery-codes.js';

type Tx = Prisma.TransactionClient;
export type ChallengeType = 'login' | 'enroll';
/** Dónde se verifica: en el login (fallo = 401) o con sesión (fallo = 422, para no cerrar la sesión: G3). */
type Where = 'login' | 'session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CHALLENGE_TTL: Record<ChallengeType, number> = { login: 300, enroll: 600 };
const SETUP_TTL_MS = 15 * 60_000;
const ENROLL_PENDING_TTL_MS = 10 * 60_000;
export const ENROLL_WINDOW_MS = 72 * 3600_000;

export const MSG = {
  badCode: 'El código no es correcto o ya se usó. Espera a que tu aplicación muestre uno nuevo e inténtalo otra vez.',
  badPassword: 'La clave no es correcta.',
  needConfirm: 'Para hacer esto confirma con tu clave (y el código de tu aplicación, si la tienes activada).',
  expired: 'La verificación venció. Vuelve a escribir tu correo y tu clave.',
  noKey: 'La verificación en dos pasos no está disponible en este servidor. Avisa al administrador del sistema.',
  noKeyLogin: 'No podemos comprobar el código de tu aplicación en este momento. Entra con uno de tus códigos de emergencia o avisa a tu administrador.',
  required: 'Tu empresa exige la verificación en dos pasos para tu cuenta y todavía no la tienes activada. Pide a otro administrador de tu empresa que la restablezca, o escribe a soporte.',
  noPending: 'No hay una activación en curso o ya venció. Empieza de nuevo desde «Activar».',
  cannotDisable: 'Tu rol exige la verificación en dos pasos: no se puede desactivar. Si cambiaste de teléfono, usa «Cambiar de teléfono».',
  notEnabled: 'No tienes activada la verificación en dos pasos.',
};

interface Reservation { ok: boolean; lockedNow: boolean; retryAfter: number }
export interface LoginUser { id: string; email: string; name: string; role: UserRole; companyId: string; createdAt: Date; passwordChangedAt: Date | null }
export type AfterPassword =
  | { kind: 'token' }
  | { kind: 'challenge'; twoFactorRequired: true; challengeToken: string; expiresInSeconds: number }
  | { kind: 'challenge'; twoFactorSetupRequired: true; challengeToken: string; expiresInSeconds: number };

/**
 * Verificación en dos pasos (ANEXO-S0 §3). Nunca devuelve ni registra secretos, hashes, contadores ni el desafío.
 * Toda escritura sobre las tablas del 2FA filtra por userId (y por empresa cuando actúa otro usuario).
 */
@Injectable()
export class TwoFactorService implements OnApplicationBootstrap {
  private readonly logger = new Logger('TwoFactor');
  private readonly box: SecretBox | null;
  private readonly challengeKey: Buffer;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly jwt: JwtService,
    private readonly limiter: AttemptLimiter,
  ) {
    const key = this.config.get<string>('TWO_FACTOR_ENCRYPTION_KEY');
    this.box = key ? new SecretBox(key) : null;
    // Buffer.from: hkdfSync devuelve un ArrayBuffer, que como texto sería "[object ArrayBuffer]" (M6)
    this.challengeKey = Buffer.from(hkdfSync('sha256', this.config.getOrThrow<string>('JWT_SECRET'), 'fin-2fa', 'login-challenge-v1', 32));
  }

  /** Con la política encendida, avisa en el log si quedan usuarios obligados sin 2FA (ANEXO-S0 §8 paso 5). */
  async onApplicationBootstrap() {
    const roles = this.requiredRoles();
    if (!roles.length) return;
    const where = { role: { in: roles }, active: true, isService: false };
    const [total, withTf] = await Promise.all([
      this.prisma.user.count({ where }),
      this.prisma.user.count({ where: { ...where, twoFactor: { is: { enabledAt: { not: null } } } } }),
    ]);
    const pending = total - withTf;
    if (pending > 0) this.logger.warn(`Hay ${pending} usuario(s) de los roles ${roles.join(', ')} sin verificación en dos pasos: corre two-factor-status`);
  }

  /** Reloj separado para las pruebas. */
  protected now() { return Date.now(); }

  /** Roles obligados (D41). Se lee en cada uso; vacía por defecto. */
  requiredRoles(): UserRole[] {
    return (this.config.get<string>('TWO_FACTOR_REQUIRED_ROLES') ?? '').split(',').map((r) => r.trim()).filter(Boolean) as UserRole[];
  }

  private issuer() { return this.config.get<string>('TWO_FACTOR_ISSUER') || 'Finanzas'; }

  private requireBox(where: Where): SecretBox {
    if (!this.box) throw new ServiceUnavailableException(where === 'login' ? MSG.noKeyLogin : MSG.noKey);
    return this.box;
  }

  private openSecret(sealed: string, userId: string, slot: 'secret' | 'pending', where: Where): Buffer {
    try { return this.requireBox(where).open(sealed, aadFor(userId, slot)); }
    catch (e) {
      if (e instanceof SecretBoxKeyError || e instanceof ServiceUnavailableException) throw new ServiceUnavailableException(where === 'login' ? MSG.noKeyLogin : MSG.noKey);
      throw e;
    }
  }

  private fail(where: Where, message = MSG.badCode): never {
    throw where === 'login' ? new UnauthorizedException(message) : new UnprocessableEntityException(message);
  }

  // ------------------------------------------------------------------ estado

  async isEnabled(userId: string, tx?: Tx) {
    const row = await (tx ?? this.prisma).userTwoFactor.findUnique({ where: { userId }, select: { enabledAt: true } });
    return !!row?.enabledAt;
  }

  /** E4: lo que el usuario puede ver de su propio 2FA. */
  async status(me: AuthUser) {
    const [row, remaining] = await Promise.all([
      this.prisma.userTwoFactor.findUnique({ where: { userId: me.id }, select: { enabledAt: true, enabledIp: true } }),
      this.prisma.userRecoveryCode.count({ where: { userId: me.id, usedAt: null } }),
    ]);
    return {
      enabled: !!row?.enabledAt, enabledAt: row?.enabledAt ?? null, enabledIp: row?.enabledAt ? row.enabledIp : null,
      recoveryCodesRemaining: row?.enabledAt ? remaining : 0, requiredForMyRole: this.requiredRoles().includes(me.role),
    };
  }

  // ------------------------------------------------------------------ desafío del login (§3.8)

  signChallenge(user: Pick<LoginUser, 'id' | 'passwordChangedAt'>, typ: ChallengeType) {
    const pca = user.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;
    return this.jwt.sign({ sub: user.id, typ, pca }, { secret: this.challengeKey, expiresIn: CHALLENGE_TTL[typ], audience: 'fin-2fa', algorithm: 'HS256' });
  }

  async verifyChallenge(token: string, typ: ChallengeType): Promise<{ sub: string; pca: number }> {
    try {
      const p = await this.jwt.verifyAsync<{ sub: string; typ: string; pca: number }>(token, { secret: this.challengeKey, algorithms: ['HS256'], audience: 'fin-2fa' });
      if (p.typ !== typ || typeof p.sub !== 'string' || !UUID.test(p.sub) || typeof p.pca !== 'number') throw new Error('desafío inválido');
      return { sub: p.sub, pca: p.pca };
    } catch {
      throw new UnauthorizedException(MSG.expired);
    }
  }

  /** Después de una clave correcta: ¿token directo, desafío de código o inscripción obligatoria? */
  async afterPassword(user: LoginUser): Promise<AfterPassword> {
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId: user.id }, select: { enabledAt: true, enrollAllowedUntil: true } });
    if (row?.enabledAt) {
      return { kind: 'challenge', twoFactorRequired: true, challengeToken: this.signChallenge(user, 'login'), expiresInSeconds: CHALLENGE_TTL.login };
    }
    if (this.requiredRoles().includes(user.role)) {
      if (this.enrollWindowOpen(user, row?.enrollAllowedUntil ?? null)) {
        return { kind: 'challenge', twoFactorSetupRequired: true, challengeToken: this.signChallenge(user, 'enroll'), expiresInSeconds: CHALLENGE_TTL.enroll };
      }
      throw new HttpException({ statusCode: 403, error: 'Forbidden', message: MSG.required }, HttpStatus.FORBIDDEN);
    }
    return { kind: 'token' };
  }

  private enrollWindowOpen(user: Pick<LoginUser, 'createdAt'>, until: Date | null) {
    const now = this.now();
    return (!!until && until.getTime() > now) || now - user.createdAt.getTime() < ENROLL_WINDOW_MS;
  }

  /** Relee usuario y empresa activos y compara la clave del desafío (§3.8 b). */
  private async loadChallengeUser(sub: string, pca: number) {
    const user = await this.prisma.user.findUnique({ where: { id: sub }, include: { company: { select: { active: true } } } });
    const userPca = user?.passwordChangedAt ? Math.floor(user.passwordChangedAt.getTime() / 1000) : 0;
    if (!user || !user.active || !user.company.active || user.isService || userPca !== pca) throw new UnauthorizedException(MSG.expired);
    return user;
  }

  /** E3: QR para inscribirse en el login (rol obligado con ventana vigente). */
  async enrollStart(challengeToken: string, ip: string) {
    const ipRule = twoFactorIpRule(ip);
    const wait = this.limiter.consume([ipRule]);
    if (wait > 0) throw new TooManyAttemptsException(wait);
    let ok = false;
    try {
      const { sub, pca } = await this.verifyChallenge(challengeToken, 'enroll');
      const user = await this.loadChallengeUser(sub, pca);
      const row = await this.prisma.userTwoFactor.findUnique({ where: { userId: user.id } });
      if (row?.enabledAt || !this.requiredRoles().includes(user.role) || !this.enrollWindowOpen(user, row?.enrollAllowedUntil ?? null)) {
        throw new UnauthorizedException(MSG.expired);
      }
      const out = await this.createPending(user.id, user.email, ENROLL_PENDING_TTL_MS, 'login');
      ok = true;
      return { ...out, expiresInSeconds: CHALLENGE_TTL.enroll };
    } finally {
      if (ok) this.limiter.refund([ipRule.key]);
    }
  }

  /**
   * E2: segundo paso del login. Devuelve el usuario y lo que hay que sumar a la respuesta
   * (`recoveryCodesRemaining` si usó un código de emergencia; `recoveryCodes` si fue una inscripción).
   */
  async verifyLogin(challengeToken: string, code: string, ip: string, meta: AuditMeta) {
    const ipRule = twoFactorIpRule(ip);
    const wait = this.limiter.consume([ipRule]);
    if (wait > 0) throw new TooManyAttemptsException(wait);
    let refundIp = false;
    try {
      // El tipo se averigua probando los dos (cada uno con su verificación completa)
      let typ: ChallengeType = 'login';
      let claims: { sub: string; pca: number };
      try { claims = await this.verifyChallenge(challengeToken, 'login'); }
      catch { claims = await this.verifyChallenge(challengeToken, 'enroll'); typ = 'enroll'; }
      const user = await this.loadChallengeUser(claims.sub, claims.pca);
      const actor: AuthUser = { id: user.id, email: user.email, role: user.role, companyId: user.companyId };
      const row = await this.prisma.userTwoFactor.findUnique({ where: { userId: user.id } });

      if (typ === 'enroll') {
        if (row?.enabledAt || !this.requiredRoles().includes(user.role) || !this.enrollWindowOpen(user, row?.enrollAllowedUntil ?? null)) throw new UnauthorizedException(MSG.expired);
        if (!row?.pendingSecretEnc || !row.pendingExpiresAt || row.pendingExpiresAt.getTime() < this.now()) this.fail('login', MSG.noPending);
        const secret = this.openSecret(row.pendingSecretEnc, user.id, 'pending', 'login');
        const res = await this.reserve(user.id);
        if (!res.ok) { refundIp = true; throw new TooManyAttemptsException(res.retryAfter); }
        const step = verifyTotp(secret, code, this.now());
        if (step === null) { await this.onFailure(actor, res, 'TOTP', meta); this.fail('login'); }
        const codes = await this.prisma.$transaction(async (tx) => {
          await this.refundReservation(tx, user.id);
          const c = await this.activate(tx, user.id, secret, step, ip);
          await tx.userTwoFactor.updateMany({ where: { userId: user.id }, data: { enrollAllowedUntil: null } });
          await tx.user.updateMany({ where: { id: user.id }, data: { lastLoginAt: new Date(this.now()) } });
          await writeAudit(tx, actor, 'User', user.id, AuditAction.UPDATE, { event: 'TWO_FACTOR_ENABLED', via: 'LOGIN_ENROLL' }, meta);
          return c;
        });
        refundIp = true;
        return { user, extra: { recoveryCodes: codes } };
      }

      if (!row?.enabledAt || !row.secretEnc) throw new UnauthorizedException(MSG.expired);
      const r = await this.verifyCode(user.id, row.secretEnc, code, 'login', actor, meta, (tx) =>
        tx.user.updateMany({ where: { id: user.id }, data: { lastLoginAt: new Date(this.now()) } }));
      refundIp = true;
      return { user, extra: r.method === 'RECOVERY_CODE' ? { recoveryCodesRemaining: r.remaining } : {} };
    } finally {
      if (refundIp) this.limiter.refund([ipRule.key]);
    }
  }

  // ------------------------------------------------------------------ verificar un código (TOTP o emergencia)

  /**
   * Reserva atómica de un intento TOTP en la base ANTES de verificar (§3.11 a): sobrevive a reinicios y a peticiones
   * simultáneas. 5 → bloqueo de 15 min; 10 en el día → bloqueo hasta cumplir 24 h.
   */
  private async reserve(userId: string): Promise<Reservation> {
    const now = new Date(this.now());
    // Sin zona: las columnas son TIMESTAMP en UTC (como las escribe Prisma)
    const ts = now.toISOString().replace('Z', '');
    const rows = await this.prisma.$queryRaw<{ f: number; day_f: number; locked: Date | null }[]>(Prisma.sql`
      WITH cur AS (
        SELECT "userId",
          ("totpDayStart" IS NULL OR "totpDayStart" <= ${ts}::timestamp - interval '24 hours') AS day_reset,
          ("totpLockedUntil" IS NOT NULL AND "totpLockedUntil" <= ${ts}::timestamp) AS lock_expired,
          "totpFailures", "totpDayFailures", "totpDayStart", "totpLockedUntil"
        FROM "UserTwoFactor" WHERE "userId" = ${userId} FOR UPDATE
      ), nxt AS (
        SELECT "userId",
          CASE WHEN day_reset THEN ${ts}::timestamp ELSE "totpDayStart" END AS day_start,
          (CASE WHEN day_reset THEN 0 ELSE "totpDayFailures" END) + 1 AS day_f,
          (CASE WHEN lock_expired THEN 0 ELSE "totpFailures" END) + 1 AS f,
          ("totpLockedUntil" IS NULL OR lock_expired) AS unlocked
        FROM cur
      )
      UPDATE "UserTwoFactor" t SET
        "totpDayStart" = n.day_start, "totpDayFailures" = n.day_f, "totpFailures" = n.f,
        "totpLockedUntil" = CASE WHEN n.day_f >= 10 THEN n.day_start + interval '24 hours'
                                 WHEN n.f >= 5 THEN ${ts}::timestamp + interval '15 minutes' ELSE NULL END
      FROM nxt n
      WHERE t."userId" = n."userId" AND n.unlocked AND n.f <= 5 AND n.day_f <= 10
      RETURNING t."totpFailures" AS f, t."totpDayFailures" AS day_f, t."totpLockedUntil" AS locked`);
    if (rows.length) return { ok: true, lockedNow: !!rows[0].locked, retryAfter: 0 };
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId }, select: { totpLockedUntil: true } });
    const retryAfter = row?.totpLockedUntil ? Math.max(1, Math.ceil((row.totpLockedUntil.getTime() - now.getTime()) / 1000)) : 60;
    return { ok: false, lockedNow: false, retryAfter };
  }

  /** Acierto: se devuelve la reserva (en la misma transacción del éxito). */
  private refundReservation(tx: Tx, userId: string) {
    return tx.$executeRaw(Prisma.sql`
      UPDATE "UserTwoFactor" SET "totpFailures" = 0, "totpLockedUntil" = NULL,
        "totpDayFailures" = GREATEST("totpDayFailures" - 1, 0) WHERE "userId" = ${userId}`);
  }

  private async onFailure(actor: AuthUser, res: Reservation, kind: 'TOTP' | 'RECOVERY', meta: AuditMeta) {
    if (!res.lockedNow) return;
    this.logger.warn(`Bloqueo del 2FA (${kind}) del usuario ${actor.id} desde ${meta.ipAddress ?? '?'}`);
    await this.prisma.$transaction((tx) => writeAudit(tx, actor, 'User', actor.id, AuditAction.LOGIN, { event: 'TWO_FACTOR_LOCKED_OUT', kind }, meta));
  }

  /**
   * Verifica el código del propio usuario (TOTP de 6 dígitos o código de emergencia). `onSuccess` corre en la misma
   * transacción que el anti-reuso y la bitácora. Los códigos de emergencia no tienen bloqueo por usuario (N2).
   */
  async verifyCode(
    userId: string, secretEnc: string, code: string, where: Where, actor: AuthUser, meta: AuditMeta,
    onSuccess?: (tx: Tx, method: 'TOTP' | 'RECOVERY_CODE') => Promise<unknown>, audit = where === 'login',
  ): Promise<{ method: 'TOTP' | 'RECOVERY_CODE'; remaining: number }> {
    const input = (code ?? '').trim();
    if (looksLikeTotp(input)) {
      const secret = this.openSecret(secretEnc, userId, 'secret', where);
      const res = await this.reserve(userId);
      if (!res.ok) throw new TooManyAttemptsException(res.retryAfter);
      const step = verifyTotp(secret, input, this.now());
      if (step === null) { await this.onFailure(actor, res, 'TOTP', meta); this.fail(where); }
      const used = await this.prisma.$transaction(async (tx) => {
        // Anti-reuso atómico: un código no sirve dos veces, aunque lleguen dos peticiones a la vez
        const r = await tx.userTwoFactor.updateMany({ where: { userId, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] }, data: { lastUsedStep: step } });
        if (r.count === 0) return false;
        await this.refundReservation(tx, userId);
        if (onSuccess) await onSuccess(tx, 'TOTP');
        if (audit) await writeAudit(tx, actor, 'User', userId, AuditAction.LOGIN, { event: 'LOGIN_2FA', method: 'TOTP' }, meta);
        return true;
      });
      if (!used) this.fail(where);
      return { method: 'TOTP', remaining: -1 };
    }
    const norm = normalizeRecoveryCode(input);
    if (!norm) this.fail(where);
    const out = await this.prisma.$transaction(async (tx) => {
      const found = await tx.userRecoveryCode.findFirst({ where: { userId, codeHash: hashRecoveryCode(norm), usedAt: null }, select: { id: true } });
      if (!found) return null;
      const r = await tx.userRecoveryCode.updateMany({ where: { id: found.id, userId, usedAt: null }, data: { usedAt: new Date(this.now()) } });
      if (r.count === 0) return null;
      const remaining = await tx.userRecoveryCode.count({ where: { userId, usedAt: null } });
      if (onSuccess) await onSuccess(tx, 'RECOVERY_CODE');
      if (audit) await writeAudit(tx, actor, 'User', userId, AuditAction.LOGIN, { event: 'LOGIN_2FA', method: 'RECOVERY_CODE', remaining }, meta);
      return remaining;
    });
    if (out === null) this.fail(where);
    return { method: 'RECOVERY_CODE', remaining: out };
  }

  // ------------------------------------------------------------------ confirmación reforzada (§3.10b)

  /** Clave (y código, si tiene 2FA) de quien hace una acción delicada. Falla con 422 (nunca 401: no cierra la sesión). */
  async confirmActor(actor: AuthUser, password: string | undefined, code: string | undefined, ip: string, meta: AuditMeta) {
    if (!password) throw new UnprocessableEntityException(MSG.needConfirm);
    await this.checkPassword(actor.id, password);
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId: actor.id }, select: { enabledAt: true, secretEnc: true } });
    if (row?.enabledAt && row.secretEnc) {
      if (!code) throw new UnprocessableEntityException(MSG.needConfirm);
      await this.withIpRule(ip, () => this.verifyCode(actor.id, row.secretEnc!, code, 'session', actor, meta));
    }
  }

  /** Verifica la clave del propio usuario con reserva por usuario (5 fallos → 429). */
  async checkPassword(userId: string, password: string) {
    const rules = passwordRules(userId);
    const wait = this.limiter.consume(rules);
    if (wait > 0) throw new TooManyAttemptsException(wait);
    const u = await this.prisma.user.findUnique({ where: { id: userId }, select: { password: true } });
    if (!u || !(await bcrypt.compare(password, u.password))) throw new UnprocessableEntityException(MSG.badPassword);
    this.limiter.refund(rules.map((r) => r.key));
  }

  private async withIpRule<T>(ip: string, fn: () => Promise<T>): Promise<T> {
    const rule = twoFactorIpRule(ip);
    const wait = this.limiter.consume([rule]);
    if (wait > 0) throw new TooManyAttemptsException(wait);
    let ok = false;
    try { const r = await fn(); ok = true; return r; }
    catch (e) { if (e instanceof TooManyAttemptsException) ok = true; throw e; } // bloqueo por usuario: no se probó nada
    finally { if (ok) this.limiter.refund([rule.key]); }
  }

  // ------------------------------------------------------------------ activar, cambiar, desactivar, regenerar (§3.9)

  private async createPending(userId: string, email: string, ttlMs: number, where: Where) {
    const box = this.requireBox(where);
    const secret = newSecret();
    const b32 = base32Encode(secret);
    const sealed = box.seal(secret, aadFor(userId, 'pending'));
    const expires = new Date(this.now() + ttlMs);
    await this.prisma.userTwoFactor.upsert({
      where: { userId },
      create: { userId, pendingSecretEnc: sealed, pendingExpiresAt: expires },
      update: { pendingSecretEnc: sealed, pendingExpiresAt: expires },
    });
    const uri = otpauthUri(this.issuer(), email, b32);
    return { otpauthUri: uri, qrCode: qrSvgDataUri(uri), secret: groupSecret(b32) };
  }

  /** E5: empezar la activación o el cambio de teléfono (si ya está activo, pide además el código). */
  async setup(me: AuthUser, password: string, code: string | undefined, ip: string, meta: AuditMeta) {
    this.requireBox('session');
    await this.checkPassword(me.id, password);
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId: me.id }, select: { enabledAt: true, secretEnc: true } });
    if (row?.enabledAt && row.secretEnc) {
      if (!code) throw new UnprocessableEntityException(MSG.needConfirm);
      await this.withIpRule(ip, () => this.verifyCode(me.id, row.secretEnc!, code, 'session', me, meta));
    }
    return { ...(await this.createPending(me.id, me.email, SETUP_TTL_MS, 'session')), expiresInSeconds: SETUP_TTL_MS / 1000 };
  }

  /** Activa el secreto pendiente: lastUsedStep se fija sin comparar (era de otro secreto, B5) y se crean 10 códigos. */
  private async activate(tx: Tx, userId: string, secret: Buffer, step: number, ip: string) {
    const box = this.requireBox('session');
    await tx.userTwoFactor.updateMany({
      where: { userId },
      data: {
        secretEnc: box.seal(secret, aadFor(userId, 'secret')), enabledAt: new Date(this.now()), enabledIp: ip,
        pendingSecretEnc: null, pendingExpiresAt: null, lastUsedStep: step, totpFailures: 0, totpLockedUntil: null,
      },
    });
    return this.replaceRecoveryCodes(tx, userId);
  }

  private async replaceRecoveryCodes(tx: Tx, userId: string) {
    const codes = newRecoveryCodes();
    await tx.userRecoveryCode.deleteMany({ where: { userId } });
    await tx.userRecoveryCode.createMany({ data: codes.map((c) => ({ userId, codeHash: hashRecoveryCode(normalizeRecoveryCode(c)!) })) });
    return codes;
  }

  /** E6: confirma con el código del teléfono nuevo. Devuelve los 10 códigos (una sola vez). */
  async enable(me: AuthUser, code: string, ip: string, meta: AuditMeta) {
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId: me.id } });
    if (!row?.pendingSecretEnc || !row.pendingExpiresAt || row.pendingExpiresAt.getTime() < this.now()) throw new UnprocessableEntityException(MSG.noPending);
    const secret = this.openSecret(row.pendingSecretEnc, me.id, 'pending', 'session');
    const wasEnabled = !!row.enabledAt;
    return this.withIpRule(ip, async () => {
      const res = await this.reserve(me.id);
      if (!res.ok) throw new TooManyAttemptsException(res.retryAfter);
      const step = verifyTotp(secret, code, this.now());
      if (step === null) { await this.onFailure(me, res, 'TOTP', meta); this.fail('session'); }
      return this.prisma.$transaction(async (tx) => {
        await this.refundReservation(tx, me.id);
        const codes = await this.activate(tx, me.id, secret, step, ip);
        await tx.user.updateMany({ where: { id: me.id }, data: { passwordChangedAt: new Date(this.now()) } });
        await writeAudit(tx, me, 'User', me.id, AuditAction.UPDATE, wasEnabled ? { event: 'TWO_FACTOR_DEVICE_CHANGED' } : { event: 'TWO_FACTOR_ENABLED', via: 'ACCOUNT' }, meta);
        return codes;
      });
    });
  }

  /** E7: quitar el 2FA (no si el rol lo exige). */
  async disable(me: AuthUser, password: string, code: string, ip: string, meta: AuditMeta) {
    if (this.requiredRoles().includes(me.role)) throw new UnprocessableEntityException(MSG.cannotDisable);
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId: me.id }, select: { enabledAt: true, secretEnc: true } });
    if (!row?.enabledAt || !row.secretEnc) throw new UnprocessableEntityException(MSG.notEnabled);
    await this.checkPassword(me.id, password);
    await this.withIpRule(ip, () => this.verifyCode(me.id, row.secretEnc!, code, 'session', me, meta, async (tx, method) => {
      await this.clearState(tx, me.id, me.companyId, null);
      await tx.user.updateMany({ where: { id: me.id }, data: { passwordChangedAt: new Date(this.now()) } });
      await writeAudit(tx, me, 'User', me.id, AuditAction.UPDATE, { event: 'TWO_FACTOR_DISABLED', method }, meta);
    }));
  }

  /** E8: códigos nuevos (los anteriores dejan de servir). */
  async regenerate(me: AuthUser, password: string, code: string, ip: string, meta: AuditMeta) {
    const row = await this.prisma.userTwoFactor.findUnique({ where: { userId: me.id }, select: { enabledAt: true, secretEnc: true } });
    if (!row?.enabledAt || !row.secretEnc) throw new UnprocessableEntityException(MSG.notEnabled);
    await this.checkPassword(me.id, password);
    await this.withIpRule(ip, () => this.verifyCode(me.id, row.secretEnc!, code, 'session', me, meta));
    return this.prisma.$transaction(async (tx) => {
      const codes = await this.replaceRecoveryCodes(tx, me.id);
      await writeAudit(tx, me, 'User', me.id, AuditAction.UPDATE, { event: 'TWO_FACTOR_RECOVERY_CODES_REGENERATED' }, meta);
      return codes;
    });
  }

  /**
   * Deja al usuario sin 2FA (sin secreto ni códigos), con contadores en cero y, si se indica, una ventana de inscripción
   * de 72 h. Siempre filtra por la empresa (E9, reset-password, rescate).
   */
  async clearState(tx: Tx, userId: string, companyId: string, enrollUntil: Date | null) {
    await tx.userRecoveryCode.deleteMany({ where: { userId, user: { companyId } } });
    const data = {
      secretEnc: null, enabledAt: null, enabledIp: null, pendingSecretEnc: null, pendingExpiresAt: null, lastUsedStep: null,
      totpFailures: 0, totpLockedUntil: null, totpDayFailures: 0, totpDayStart: null, enrollAllowedUntil: enrollUntil,
    };
    const r = await tx.userTwoFactor.updateMany({ where: { userId, user: { companyId } }, data });
    if (r.count === 0 && enrollUntil) await tx.userTwoFactor.create({ data: { userId, enrollAllowedUntil: enrollUntil } });
  }

  /** Limpia los contadores y abre la ventana de inscripción, sin quitar el 2FA (reset-password del ADMIN, §3.10b). */
  async resetCounters(tx: Tx, userId: string, companyId: string) {
    const until = new Date(this.now() + ENROLL_WINDOW_MS);
    const r = await tx.userTwoFactor.updateMany({
      where: { userId, user: { companyId } },
      data: { totpFailures: 0, totpLockedUntil: null, totpDayFailures: 0, totpDayStart: null, enrollAllowedUntil: until },
    });
    if (r.count === 0) await tx.userTwoFactor.create({ data: { userId, enrollAllowedUntil: until } });
  }

  /** Abre la ventana de 72 h (ascenso a ADMIN). */
  async openEnrollWindow(tx: Tx, userId: string, companyId: string) {
    const until = new Date(this.now() + ENROLL_WINDOW_MS);
    const r = await tx.userTwoFactor.updateMany({ where: { userId, user: { companyId } }, data: { enrollAllowedUntil: until } });
    if (r.count === 0) await tx.userTwoFactor.create({ data: { userId, enrollAllowedUntil: until } });
  }

  /** Paso actual (lo usan las pruebas de reloj). */
  currentStep() { return stepAt(this.now()); }

  /** Solo para el comando de rescate y las pruebas: decodificar un secreto en Base32. */
  static decode(b32: string) { return base32Decode(b32.replace(/\s/g, '')); }
}

/** QR como SVG en `data:` (la CSP ya admite `img-src data:`; un SVG dentro de <img> no ejecuta scripts). */
export function qrSvgDataUri(text: string) {
  const qr = qrcode(0, 'M');
  qr.addData(text);
  qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 4, scalable: true });
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
