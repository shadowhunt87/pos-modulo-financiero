import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { TwoFactorService } from '../src/auth/two-factor/two-factor.service.js';
import { base32Decode, hotp } from '../src/auth/two-factor/totp.js';

/**
 * Verificación en dos pasos (ANEXO-S0 §6.2, paquete S1). La llave de cifrado de esta prueba es inventada.
 * Las pruebas de concurrencia usan una app con TRUST_PROXY=1 e IP propias (X-Forwarded-For), para no agotar
 * las reglas por IP de 127.0.0.1 (N5).
 */
const KEY = 'f3c1a9e7d5b3f1e9c7a5b3d1f9e7c5a3b1d9f7e5c3a1b9d7f5e3c1a9b7d5f3e1';

describe('Verificación en dos pasos (e2e)', () => {
  let app: INestApplication;
  let proxyApp: INestApplication;
  let prisma: PrismaService;
  let tf: TwoFactorService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `tf-${r}-${sfx}@test.local`;
  let companyA: string, companyB: string;
  const token: Record<string, string> = {};
  const uid: Record<string, string> = {};
  let ipN = 0;
  const nextIp = () => `198.51.100.${(ipN++ % 250) + 1}`;

  const server = (a: INestApplication) => a.getHttpServer();
  const login = (who: string, pass = password, a = app, ip?: string) => {
    const r = request(server(a)).post('/auth/login');
    if (ip) r.set('X-Forwarded-For', ip);
    return r.send({ email: email(who), password: pass });
  };
  const step2 = (challengeToken: string, code: string, a = app, ip?: string) => {
    const r = request(server(a)).post('/auth/login/2fa');
    if (ip) r.set('X-Forwarded-For', ip);
    return r.send({ challengeToken, code });
  };
  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(server(app))[m](url).set('Authorization', `Bearer ${token[who]}`);
  const code = (secret: string, offset = 0) => hotp(base32Decode(secret.replace(/\s/g, '')), Math.floor(Date.now() / 30000) + offset);
  const mkUser = async (r: string, role: UserRole = UserRole.ACCOUNTANT, companyId = companyA, createdAt?: Date, doLogin = true) => {
    const hash = await bcrypt.hash(password, 4);
    uid[r] = (await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId, ...(createdAt ? { createdAt } : {}) } })).id;
    if (doLogin) token[r] = (await login(r).expect(201)).body.access_token;
  };
  /** Activa el 2FA de un usuario y devuelve su secreto y sus códigos. */
  const enable = async (who: string) => {
    const s = (await api('post', '/users/me/two-factor/setup', who).send({ password }).expect(200)).body;
    const r = (await api('post', '/users/me/two-factor/enable', who).send({ code: code(s.secret) }).expect(200)).body;
    token[who] = r.access_token;
    return { secret: s.secret as string, codes: r.recoveryCodes as string[] };
  };
  // Reloj simulado (solo Date) que además avanza con el tiempo real: los pasos de 30 s se saltan sin esperar
  const advance = (ms: number) => vi.setSystemTime(Date.now() + ms);
  /** Pasa al siguiente paso de 30 s (el código actual ya se usó: anti-reuso). */
  const nextStep = async () => advance(30000 - (Date.now() % 30000) + 50);
  const audits = (userId: string, event: string) =>
    prisma.auditLog.findMany({ where: { entityId: userId, changes: { path: ['event'], equals: event } } });

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    process.env.TWO_FACTOR_ENCRYPTION_KEY = KEY;
    app = await createApp({ silent: true });
    await app.init();
    process.env.TRUST_PROXY = '1';
    proxyApp = await createApp({ silent: true });
    await proxyApp.init();
    delete process.env.TRUST_PROXY;
    prisma = app.get(PrismaService);
    tf = app.get(TwoFactorService);
    companyA = (await prisma.company.create({ data: { name: `TF A ${sfx}`, taxId: `TF-A-${sfx}` } })).id;
    companyB = (await prisma.company.create({ data: { name: `TF B ${sfx}`, taxId: `TF-B-${sfx}` } })).id;
    await mkUser('admin', UserRole.ADMIN); await mkUser('admin2', UserRole.ADMIN); await mkUser('acct'); await mkUser('appr', UserRole.APPROVER);
    await mkUser('view', UserRole.VIEWER); await mkUser('adminb', UserRole.ADMIN, companyB);
  }, 60_000);

  afterAll(async () => {
    const ids = [companyA, companyB].filter(Boolean);
    await prisma.auditLog.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.user.deleteMany({ where: { companyId: { in: ids } } }); // 2FA y códigos se borran en cascada
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    delete process.env.TWO_FACTOR_ENCRYPTION_KEY;
    await proxyApp.close();
    await app.close();
    vi.useRealTimers();
  }, 60_000);

  describe('sin 2FA', () => {
    it('el login devuelve exactamente { access_token, user }', async () => {
      const res = await login('view').expect(201);
      expect(Object.keys(res.body).sort()).toEqual(['access_token', 'user']);
      token.view = res.body.access_token;
    });
  });

  describe('activar', () => {
    let secret = '';
    it('E5: sin clave 400; con la clave mala 422 y el token sigue sirviendo', async () => {
      await mkUser('u1');
      await api('post', '/users/me/two-factor/setup', 'u1').send({}).expect(400);
      await api('post', '/users/me/two-factor/setup', 'u1').send({ password: 'Mala-Clave-000' }).expect(422);
      await api('get', '/auth/me', 'u1').expect(200);
    });

    it('E5 bien: URI, QR en data:, secreto de 32 caracteres, no-store; en la base cifrado', async () => {
      const res = await api('post', '/users/me/two-factor/setup', 'u1').send({ password }).expect(200);
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.body.otpauthUri).toMatch(/^otpauth:\/\/totp\/Finanzas:.+\?secret=[A-Z2-7]{32}&issuer=Finanzas&algorithm=SHA1&digits=6&period=30$/);
      expect(res.body.qrCode).toMatch(/^data:image\/svg\+xml;base64,/);
      secret = res.body.secret;
      expect(secret.replace(/\s/g, '')).toHaveLength(32);
      const row = await prisma.userTwoFactor.findUniqueOrThrow({ where: { userId: uid.u1 } });
      expect(row.pendingSecretEnc!.startsWith('v1:')).toBe(true);
      expect(row.pendingSecretEnc).not.toContain(secret.replace(/\s/g, ''));
    });

    it('E6: código malo 422; bien → token nuevo + 10 códigos, el viejo ya no sirve; E4 muestra la IP', async () => {
      await api('post', '/users/me/two-factor/enable', 'u1').send({ code: '000000' }).expect(422);
      const old = token.u1;
      advance(1100); // iat en segundos
      const res = await api('post', '/users/me/two-factor/enable', 'u1').send({ code: code(secret) }).expect(200);
      expect(res.body.recoveryCodes).toHaveLength(10);
      token.u1 = res.body.access_token;
      await request(server(app)).get('/auth/me').set('Authorization', `Bearer ${old}`).expect(401);
      const st = (await api('get', '/users/me/two-factor', 'u1').expect(200)).body;
      expect(st).toMatchObject({ enabled: true, recoveryCodesRemaining: 10, requiredForMyRole: false, enabledIp: expect.any(String) });
      const hashes = await prisma.userRecoveryCode.findMany({ where: { userId: uid.u1 } });
      expect(hashes.every((h) => /^[0-9a-f]{64}$/.test(h.codeHash))).toBe(true);
    });

    it('E6 sin activación en curso → 422', async () => {
      await mkUser('u2');
      await api('post', '/users/me/two-factor/enable', 'u2').send({ code: '123456' }).expect(422);
    });
  });

  describe('desafío del login (M6)', () => {
    let u: { secret: string; codes: string[] };
    let challenge = '';
    beforeAll(async () => { await mkUser('c1'); u = await enable('c1'); });

    it('paso 1 sin access_token ni user', async () => {
      const res = await login('c1').expect(201);
      expect(res.body).toEqual({ twoFactorRequired: true, challengeToken: expect.any(String), expiresInSeconds: 300 });
      challenge = res.body.challengeToken;
    });

    it('el desafío no sirve como sesión ni una sesión como desafío; firmas falsas → 401', async () => {
      await request(server(app)).get('/auth/me').set('Authorization', `Bearer ${challenge}`).expect(401);
      await step2(token.view, '123456').expect(401);
      const claims = { sub: uid.c1, typ: 'login', pca: 0 };
      await step2(jwt.sign(claims, process.env.JWT_SECRET!, { audience: 'fin-2fa', expiresIn: 300 }), '123456').expect(401);
      await step2(jwt.sign(claims, '[object ArrayBuffer]', { audience: 'fin-2fa', expiresIn: 300 }), '123456').expect(401);
      await step2(jwt.sign({ ...claims, sub: 'no-es-uuid' }, '[object ArrayBuffer]', { expiresIn: 300 }), '123456').expect(401);
      await step2('x'.repeat(2049), '123456').expect(400);
    });

    it('código correcto → token; el mismo código con un desafío nuevo → 401', async () => {
      await nextStep();
      const c = code(u.secret);
      const ok = await step2(challenge, c).expect(200);
      expect(ok.body).toMatchObject({ access_token: expect.any(String), user: { email: email('c1') } });
      const again = (await login('c1').expect(201)).body.challengeToken;
      await step2(again, c).expect(401);
    });

    it('reloj: T−2 → 401; T+1 → 200', async () => {
      await nextStep();
      const ch = (await login('c1').expect(201)).body.challengeToken;
      await step2(ch, code(u.secret, -2)).expect(401);
      await step2(ch, code(u.secret, 1)).expect(200);
    });

    it('vencido (+6 min) → 401 «venció»; con la clave cambiada entre los pasos → 401', async () => {
      const ch = (await login('c1').expect(201)).body.challengeToken;
      advance(6 * 60_000);
      const r = await step2(ch, code(u.secret)).expect(401);
      expect(r.body.message).toMatch(/venció/);
      const ch2 = (await login('c1').expect(201)).body.challengeToken;
      await prisma.user.updateMany({ where: { id: uid.c1 }, data: { passwordChangedAt: new Date(Date.now() + 2000) } });
      await step2(ch2, code(u.secret)).expect(401);
      await prisma.user.updateMany({ where: { id: uid.c1 }, data: { passwordChangedAt: null } });
      advance(3000);
    });

    it('código de emergencia: entra con remaining 9; repetido → 401; minúsculas y espacios se aceptan', async () => {
      const ch = (await login('c1').expect(201)).body.challengeToken;
      const r = await step2(ch, u.codes[0]).expect(200);
      expect(r.body.recoveryCodesRemaining).toBe(9);
      await step2((await login('c1').expect(201)).body.challengeToken, u.codes[0]).expect(401);
      const lower = ` ${u.codes[1].toLowerCase().replace(/-/g, ' ')} `;
      await step2((await login('c1').expect(201)).body.challengeToken, lower).expect(200);
      expect((await audits(uid.c1, 'LOGIN_2FA')).length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('límites (G1/A2)', () => {
    it('50 códigos malos simultáneos → como mucho 5 respuestas 401; después el correcto → 429; un código de emergencia entra igual', async () => {
      await mkUser('l1');
      const u = await enable('l1');
      const ch = (await login('l1').expect(201)).body.challengeToken;
      const bad = code(u.secret) === '111111' ? '222222' : '111111';
      const res = await Promise.all(Array.from({ length: 50 }, () => step2(ch, bad, proxyApp, nextIp())));
      const counts = res.reduce<Record<number, number>>((m, r) => ({ ...m, [r.status]: (m[r.status] ?? 0) + 1 }), {});
      expect(counts[401] ?? 0).toBeLessThanOrEqual(5);
      expect((counts[401] ?? 0) + (counts[429] ?? 0)).toBe(50);
      await nextStep();
      await step2(ch, code(u.secret), proxyApp, nextIp()).expect(429);
      await step2(ch, u.codes[0], proxyApp, nextIp()).expect(200); // M7: el dueño siempre entra con un código de emergencia
      expect(await audits(uid.l1, 'TWO_FACTOR_LOCKED_OUT')).toHaveLength(1);
    });

    it('los fallos sobreviven a un reinicio: 4 fallos, app nueva, 1 más → bloqueado', async () => {
      await mkUser('l2');
      const u = await enable('l2');
      const bad = code(u.secret) === '111111' ? '222222' : '111111';
      const ch = (await login('l2').expect(201)).body.challengeToken;
      for (let i = 0; i < 4; i++) await step2(ch, bad, proxyApp, nextIp()).expect(401);
      process.env.TRUST_PROXY = '1';
      const fresh = await createApp({ silent: true }); await fresh.init();
      delete process.env.TRUST_PROXY;
      try {
        await step2(ch, bad, fresh, nextIp()).expect(401);
        await step2(ch, code(u.secret), fresh, nextIp()).expect(429);
      } finally { await fresh.close(); }
    });

    it('30 códigos de emergencia malos desde IP distintas no bloquean al dueño', async () => {
      await mkUser('l3');
      const u = await enable('l3');
      const ch = (await login('l3').expect(201)).body.challengeToken;
      for (let i = 0; i < 30; i++) await step2(ch, 'AAAA-BBBB-CCCC-DDDD', proxyApp, nextIp()).expect(401);
      await step2(ch, u.codes[0], proxyApp, nextIp()).expect(200);
    });

    it('regla por IP: 40 fallos desde la misma /64 → 429 para otra cuenta; un usuario bloqueado devuelve la regla de IP', async () => {
      await mkUser('l4'); await mkUser('l5');
      const a = await enable('l4'); const b = await enable('l5');
      const ip = '2001:db8:aaaa:1::7';
      // l4 queda bloqueado por usuario (5): las demás peticiones dan 429 por la base y devuelven la regla de IP
      const chA = (await login('l4').expect(201)).body.challengeToken;
      const badA = code(a.secret) === '111111' ? '222222' : '111111';
      for (let i = 0; i < 10; i++) await step2(chA, badA, proxyApp, ip);
      const chB = (await login('l5').expect(201)).body.challengeToken;
      await nextStep();
      await step2(chB, code(b.secret), proxyApp, '2001:db8:aaaa:1::99').expect(200); // misma /64, aún con cupo (N5)
      for (let i = 0; i < 40; i++) await step2(chB, 'AAAA-BBBB-CCCC-DDDD', proxyApp, `2001:db8:aaaa:1::${i + 100}`);
      await step2(chB, b.codes[0], proxyApp, '2001:db8:aaaa:1::5').expect(429);
      await step2(chB, b.codes[0], proxyApp, '2001:db8:bbbb:1::5').expect(200);
    });

    it('el mismo TOTP en dos peticiones simultáneas → una 200 y otra 401', async () => {
      await mkUser('l6');
      const u = await enable('l6');
      await nextStep();
      const c = code(u.secret);
      const [x, y] = await Promise.all([
        step2((await login('l6').expect(201)).body.challengeToken, c, proxyApp, nextIp()),
        step2((await login('l6').expect(201)).body.challengeToken, c, proxyApp, nextIp()),
      ]);
      expect([x.status, y.status].sort()).toEqual([200, 401]);
    });

    it('50 logins simultáneos con la clave mala → como mucho 5 respuestas 401 (consume/refund)', async () => {
      await mkUser('l7');
      const res = await Promise.all(Array.from({ length: 50 }, () => login('l7', 'Mala-Clave-000', proxyApp, '203.0.113.50')));
      expect(res.filter((r) => r.status === 401).length).toBeLessThanOrEqual(5);
    });
  });

  describe('cambiar de teléfono, desactivar y cambiar la clave', () => {
    let u: { secret: string; codes: string[] };
    beforeAll(async () => { await mkUser('p1'); u = await enable('p1'); });

    it('cambiar de teléfono: sin código 422; con código → QR nuevo y el viejo deja de servir', async () => {
      await api('post', '/users/me/two-factor/setup', 'p1').send({ password }).expect(422);
      await nextStep();
      const s = (await api('post', '/users/me/two-factor/setup', 'p1').send({ password, code: code(u.secret) }).expect(200)).body;
      // Mismo paso de 30 s que el último código usado del teléfono viejo: igual entra (B5)
      const r = await api('post', '/users/me/two-factor/enable', 'p1').send({ code: code(s.secret) }).expect(200);
      token.p1 = r.body.access_token;
      const old = u;
      u = { secret: s.secret, codes: r.body.recoveryCodes };
      await step2((await login('p1').expect(201)).body.challengeToken, old.codes[0]).expect(401);
      expect(await audits(uid.p1, 'TWO_FACTOR_DEVICE_CHANGED')).toHaveLength(1);
    });

    it('change-password con 2FA: sin código 422; clave actual mala 422 sin cerrar la sesión; con código → 201', async () => {
      await api('post', '/users/me/change-password', 'p1').send({ currentPassword: password, newPassword: 'Otra-Clave-77777' }).expect(422);
      await api('post', '/users/me/change-password', 'p1').send({ currentPassword: 'Mala-000000', newPassword: 'Otra-Clave-77777', code: '123456' }).expect(422);
      await api('get', '/auth/me', 'p1').expect(200);
      await nextStep();
      const r = await api('post', '/users/me/change-password', 'p1').send({ currentPassword: password, newPassword: 'Otra-Clave-77777', code: code(u.secret) }).expect(201);
      token.p1 = r.body.access_token;
      // vuelve a la clave de las pruebas
      await nextStep();
      token.p1 = (await api('post', '/users/me/change-password', 'p1').send({ currentPassword: 'Otra-Clave-77777', newPassword: password, code: code(u.secret) }).expect(201)).body.access_token;
    });

    it('regenerar códigos invalida los viejos; desactivar → después entra solo con clave', async () => {
      await nextStep();
      const r = (await api('post', '/users/me/two-factor/recovery-codes', 'p1').send({ password, code: code(u.secret) }).expect(200)).body;
      expect(r.recoveryCodes).toHaveLength(10);
      await step2((await login('p1').expect(201)).body.challengeToken, u.codes[1]).expect(401);
      await api('post', '/users/me/two-factor/disable', 'p1').send({ password, code: r.recoveryCodes[0] }).expect(200);
      const res = await login('p1').expect(201);
      expect(res.body.access_token).toEqual(expect.any(String));
    });
  });

  describe('restablecer (E9) y confirmación reforzada (G2, N3)', () => {
    let a: { secret: string; codes: string[] };
    beforeAll(async () => {
      await mkUser('r1');
      await enable('r1');
      a = await enable('admin'); // el ADMIN que actúa tiene 2FA: sus confirmaciones piden código
    });

    it('con solo el token (sin clave ni código) → 422 en todas las acciones delicadas', async () => {
      await api('post', '/auth/register', 'admin').send({ email: `x-${sfx}@test.local`, password, name: 'x', role: 'ACCOUNTANT' }).expect(422);
      await api('patch', `/users/${uid.acct}`, 'admin').send({ role: 'ADMIN' }).expect(422);
      await api('patch', `/users/${uid.admin2}`, 'admin').send({ email: `nuevo-${sfx}@test.local` }).expect(422);
      await api('post', `/users/${uid.acct}/reset-password`, 'admin').send({ password: 'Nueva-Clave-999' }).expect(422);
      await api('post', `/users/${uid.r1}/reset-two-factor`, 'admin').send({ newPassword: 'Nueva-Clave-999' }).expect(422);
      await api('post', `/users/${uid.r1}/reset-two-factor`, 'admin').send({ newPassword: 'Nueva-Clave-999', confirmPassword: password }).expect(422); // falta el código
    });

    it('E9: otra empresa 404; otros roles 403; a sí mismo 422; sin newPassword 400; usuario sin 2FA 422', async () => {
      await nextStep();
      const conf = () => ({ confirmPassword: password, confirmCode: code(a.secret), newPassword: 'Nueva-Clave-999' });
      await api('post', `/users/${uid.adminb}/reset-two-factor`, 'admin').send(conf()).expect(404);
      for (const who of ['acct', 'appr', 'view']) await api('post', `/users/${uid.r1}/reset-two-factor`, who).send(conf()).expect(403);
      await api('post', `/users/${uid.admin}/reset-two-factor`, 'admin').send(conf()).expect(422);
      await api('post', `/users/${uid.r1}/reset-two-factor`, 'admin').send({ confirmPassword: password }).expect(400);
      await api('post', `/users/${uid.acct}/reset-two-factor`, 'admin').send(conf()).expect(422);
    });

    it('E9 bien: la clave vieja ya no entra, la nueva sí y sin 2FA; contadores en cero; ventana de 72 h; visible en E11', async () => {
      await nextStep();
      await api('post', `/users/${uid.r1}/reset-two-factor`, 'admin').send({ confirmPassword: password, confirmCode: code(a.secret), newPassword: 'Nueva-Clave-999' }).expect(201);
      await login('r1').expect(401);
      const r = await login('r1', 'Nueva-Clave-999').expect(201);
      expect(r.body.access_token).toEqual(expect.any(String));
      const row = await prisma.userTwoFactor.findUniqueOrThrow({ where: { userId: uid.r1 } });
      expect([row.enabledAt, row.secretEnc, row.totpFailures]).toEqual([null, null, 0]);
      expect(row.enrollAllowedUntil!.getTime()).toBeGreaterThan(Date.now() + 71 * 3600_000);
      const ev = (await api('get', '/users/security-events', 'admin').expect(200)).body;
      expect(ev.find((e: { event: string; target: { id: string } | null }) => e.event === 'TWO_FACTOR_RESET' && e.target?.id === uid.r1)).toBeTruthy();
      await api('get', '/users/security-events', 'acct').expect(403);
    });

    it('con la confirmación correcta: crear usuario y ascender a ADMIN funcionan; el ascendido pierde su sesión', async () => {
      await nextStep();
      await api('post', '/auth/register', 'admin').send({ email: email('nuevo'), password, name: 'nuevo', confirmPassword: password, confirmCode: code(a.secret) }).expect(201);
      await nextStep();
      advance(1100);
      await api('patch', `/users/${uid.acct}`, 'admin').send({ role: 'ADMIN', confirmPassword: password, confirmCode: code(a.secret) }).expect(200);
      await api('get', '/auth/me', 'acct').expect(401);
      expect(await audits(uid.acct, 'ADMIN_GRANTED')).toHaveLength(1);
      await prisma.user.updateMany({ where: { id: uid.acct }, data: { role: 'ACCOUNTANT' } });
      token.acct = (await login('acct').expect(201)).body.access_token;
    });

    it('reset-password de un usuario con 2FA no quita el 2FA pero limpia sus contadores', async () => {
      await mkUser('r2');
      await enable('r2');
      await prisma.userTwoFactor.updateMany({ where: { userId: uid.r2 }, data: { totpFailures: 3 } });
      await nextStep();
      await api('post', `/users/${uid.r2}/reset-password`, 'admin').send({ password: 'Nueva-Clave-999', confirmPassword: password, confirmCode: code(a.secret) }).expect(201);
      const row = await prisma.userTwoFactor.findUniqueOrThrow({ where: { userId: uid.r2 } });
      expect([!!row.enabledAt, row.totpFailures]).toEqual([true, 0]);
    });
  });

  describe('política (D41) y llave', () => {
    afterEach(() => vi.restoreAllMocks());

    it('ADMIN sin 2FA y sin ventana → 403; con ventana → inscripción en el login (E3 → E2) con 10 códigos', async () => {
      vi.spyOn(tf, 'requiredRoles').mockReturnValue([UserRole.ADMIN]);
      await mkUser('pol1', UserRole.ADMIN, companyA, new Date(Date.now() - 100 * 3600_000), false);
      await login('pol1').expect(403);
      await mkUser('pol2', UserRole.ADMIN, companyA, undefined, false); // recién creado: tiene ventana de inscripción
      const res = await login('pol2').expect(201);
      expect(res.body).toMatchObject({ twoFactorSetupRequired: true, expiresInSeconds: 600 });
      const qr = (await request(server(app)).post('/auth/login/2fa/enroll').send({ challengeToken: res.body.challengeToken }).expect(200)).body;
      const r = await step2(res.body.challengeToken, code(qr.secret)).expect(200);
      expect(r.body.recoveryCodes).toHaveLength(10);
      token.pol2 = r.body.access_token;
      expect(await audits(uid.pol2, 'TWO_FACTOR_ENABLED')).toHaveLength(1);
      await nextStep();
      await api('post', '/users/me/two-factor/disable', 'pol2').send({ password, code: r.body.recoveryCodes[0] }).expect(422);
      await login('view').expect(201); // un rol no obligado entra como hoy
    });

    it('sin llave: activar → 503; TOTP en el login → 503; un código de emergencia entra; nunca 500', async () => {
      await mkUser('k1');
      const u = await enable('k1');
      const saved = (tf as unknown as { box: unknown }).box;
      (tf as unknown as { box: unknown }).box = null;
      try {
        await api('post', '/users/me/two-factor/setup', 'view').send({ password }).expect(503);
        const ch = (await login('k1').expect(201)).body.challengeToken;
        const t = await step2(ch, code(u.secret)).expect(503);
        expect(t.body.message).toMatch(/códigos de emergencia/);
        await step2(ch, u.codes[0]).expect(200);
      } finally { (tf as unknown as { box: unknown }).box = saved; }
    });
  });

  describe('nada se filtra y la bitácora no se modifica', () => {
    it('ninguna respuesta trae campos internos; ningún AuditLog.changes trae secretos', async () => {
      const bodies = [
        (await api('get', '/users/me/two-factor', 'u1').expect(200)).text,
        (await api('get', '/users', 'admin').expect(200)).text,
        (await api('get', `/users/${uid.u1}`, 'admin').expect(200)).text,
      ];
      for (const b of bodies) expect(b).not.toMatch(/secretEnc|pendingSecretEnc|codeHash|lastUsedStep|totpFailures|v1:/);
      expect(JSON.parse(bodies[2]).twoFactorEnabled).toBe(true);
      const logs = await prisma.auditLog.findMany({ where: { companyId: companyA } });
      expect(JSON.stringify(logs.map((l) => l.changes))).not.toMatch(/secretEnc|codeHash|challengeToken|"v1:|\$2b\$/);
    });

    it('UPDATE sobre AuditLog falla (disparador); deleteMany sigue funcionando', async () => {
      const l = await prisma.auditLog.findFirstOrThrow({ where: { companyId: companyA } });
      await expect(prisma.auditLog.updateMany({ where: { id: l.id }, data: { entityName: 'x' } })).rejects.toThrow(/no se modifica/);
    });

    it('regresión: toda escritura de userTwoFactor/userRecoveryCode filtra por userId o por empresa', () => {
      const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? (f === 'generated' ? [] : walk(join(d, f))) : f.endsWith('.ts') ? [join(d, f)] : []));
      const bad: string[] = [];
      for (const f of walk('src')) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/\.(userTwoFactor|userRecoveryCode)\.(updateMany|deleteMany)\(\{\s*where:\s*\{([^}]*)/g)) {
          if (!/userId|user:\s*\{\s*companyId|id:\s*found\.id/.test(m[3])) bad.push(`${f}: ${m[0].slice(0, 80)}`);
        }
      }
      expect(bad).toEqual([]);
    });
  });

  describe('comandos del operador', () => {
    const run = (script: string, args: string[]) => {
      const r = spawnSync('node', [`dist/cli/${script}.js`, ...args], { env: { ...process.env }, encoding: 'utf8' });
      return { code: r.status, out: r.stdout, err: r.stderr };
    };

    it('two-factor-status lista a los ADMIN sin 2FA y termina con error', () => {
      const r = run('two-factor-status', ['--rnc', `TF-A-${sfx}`]);
      expect(r.code).toBe(1);
      expect(r.err).toMatch(new RegExp(email('admin2')));
    });

    it('two-factor-reset exige --motivo, se niega si hay otro ADMIN (salvo --forzar) y deja via operator-cli', async () => {
      expect(run('two-factor-reset', ['--email', email('admin')]).code).toBe(1);
      const r1 = run('two-factor-reset', ['--email', email('admin'), '--motivo', 'Perdió el teléfono; confirmado por llamada']);
      expect([r1.code, /otro administrador activo/.test(r1.err)]).toEqual([1, true]);
      const r2 = run('two-factor-reset', ['--email', email('admin'), '--motivo', 'Perdió el teléfono; confirmado por llamada', '--forzar']);
      expect(r2.code).toBe(0);
      const temp = /CLAVE TEMPORAL[^:]*: ([0-9A-Z]{16})/.exec(r2.err)![1];
      await login('admin').expect(401);
      await login('admin', temp).expect(201);
      const ev = await audits(uid.admin, 'TWO_FACTOR_RESET');
      expect(ev.at(-1)!.changes).toMatchObject({ via: 'operator-cli' });
      expect(JSON.stringify(ev.map((e) => e.changes))).not.toContain(temp);
    });
  });
});
