import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { ModulesContainer } from '@nestjs/core';
import { PATH_METADATA, METHOD_METADATA, GUARDS_METADATA } from '@nestjs/common/constants.js';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import jwt from 'jsonwebtoken';
import { ROLES_KEY } from '../src/auth/decorators/roles.decorator.js';
import { AttemptLimiter } from '../src/auth/attempt-limiter.js';
import { validate, weakSecretReason } from '../src/config/env.validation.js';

// Segunda y tercera app con otra configuración (se crean con estas variables y luego se restauran)
const PROXY_APP_ENV = { TRUST_PROXY: '1', CORS_ORIGINS: 'https://app.example.com, https://admin.example.com' };

/**
 * Seguridad: precisión de montos al recalcular facturas, límite de intentos de login,
 * cabeceras HTTP, CORS y política de rutas (guards y roles).
 */
describe('Seguridad (e2e)', () => {
  let app: INestApplication; // sin proxy ni CORS (configuración por defecto)
  let proxyApp: INestApplication; // TRUST_PROXY=1 y CORS con dos orígenes
  let prisma: PrismaService;
  const sfx = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const email = (r: string) => `sec-${r}-${sfx}@test.local`;
  let companyA: string;
  const token: Record<string, string> = {};
  const acc: Record<string, string> = {};
  let customer: string;

  const api = (m: 'get' | 'post' | 'patch' | 'put' | 'delete', url: string, who: string) =>
    request(app.getHttpServer())[m](url).set('Authorization', `Bearer ${token[who]}`);

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
    Object.assign(process.env, PROXY_APP_ENV);
    proxyApp = await createApp({ silent: true });
    await proxyApp.init();
    for (const k of Object.keys(PROXY_APP_ENV)) delete process.env[k];
    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);
    companyA = (await prisma.company.create({ data: { name: `Sec A ${sfx}`, taxId: `S-A-${sfx}` } })).id;
    for (const [r, role] of [['admin', UserRole.ADMIN], ['acct', UserRole.ACCOUNTANT], ['view', UserRole.VIEWER]] as const) {
      await prisma.user.create({ data: { email: email(r), password: hash, name: r, role, companyId: companyA } });
      token[r] = (await request(app.getHttpServer()).post('/auth/login').send({ email: email(r), password })).body.access_token;
    }
    const mk = async (key: string, code: string, type: 'ASSET' | 'LIABILITY' | 'INCOME' | 'EXPENSE') =>
      (acc[key] = (await prisma.account.create({ data: { companyId: companyA, code, name: key, type } })).id);
    await mk('cxc', '1201', 'ASSET'); await mk('cxp', '2101', 'LIABILITY'); await mk('ventas', '4101', 'INCOME'); await mk('gastos', '5101', 'EXPENSE');
    await api('post', '/journals/defaults', 'admin').expect(201);
    await api('post', '/ncf/sequences', 'admin').send({ ncfType: 'B01', rangeStart: 1, rangeEnd: 100 }).expect(201);
    await api('put', '/settings/accounting', 'admin').send({
      receivableAccountId: acc.cxc, payableAccountId: acc.cxp, salesIncomeAccountId: acc.ventas, purchaseExpenseAccountId: acc.gastos,
    }).expect(200);
    customer = (await api('post', '/partners', 'acct').send({ type: 'CUSTOMER', name: 'Cliente', taxId: '131123456', taxIdType: 'RNC' }).expect(201)).body.id;
  }, 60000);

  afterAll(async () => {
    const where = { companyId: companyA };
    await prisma.invoiceWithholding.deleteMany({ where: { invoice: where } });
    await prisma.invoiceLine.deleteMany({ where: { invoice: where } });
    await prisma.invoice.deleteMany({ where });
    await prisma.journalEntryLine.deleteMany({ where: { journalEntry: where } });
    await prisma.journalEntry.deleteMany({ where });
    await prisma.auditLog.deleteMany({ where });
    await prisma.ncfSequence.deleteMany({ where });
    await prisma.documentSequence.deleteMany({ where });
    await prisma.journal.deleteMany({ where });
    await prisma.accountingSettings.deleteMany({ where });
    await prisma.partner.deleteMany({ where });
    await prisma.account.deleteMany({ where });
    await prisma.user.deleteMany({ where });
    await prisma.company.deleteMany({ where: { id: companyA } });
    await proxyApp.close();
    await app.close();
  });

  describe('Montos grandes: editar y emitir un borrador no altera un solo centavo', () => {
    // 18 dígitos significativos: no caben en un double (Number) sin perder precisión
    const BIG = '99999999999999.9999';
    const QTY = '2.0001';
    const RATE = '58.123457';

    it('editar un borrador (PATCH) conserva cantidad, precio, descuento, tasa y totales exactos', async () => {
      const inv = (await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: '2031-03-10', ncfType: 'B01', currency: 'USD', exchangeRate: 58,
        lines: [{ description: 'Item', quantity: 1, unitPrice: 1 }],
      }).expect(201)).body;
      // Valores que un double no puede representar: se escriben directo en BD
      await prisma.invoiceLine.updateMany({
        where: { invoiceId: inv.id },
        data: { quantity: QTY, unitPrice: BIG, discount: '0.5000' },
      });
      await prisma.invoice.update({ where: { id: inv.id }, data: { exchangeRate: RATE } });

      await api('patch', `/invoices/${inv.id}`, 'acct').send({ notes: 'solo cambio una nota' }).expect(200);

      const line = (await prisma.invoiceLine.findMany({ where: { invoiceId: inv.id } }))[0];
      expect(line.quantity.toFixed(4)).toBe(QTY);
      expect(line.unitPrice.toFixed(4)).toBe(BIG);
      expect(line.discount.toFixed(4)).toBe('0.5000');
      const header = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect(header.exchangeRate.toFixed(6)).toBe(RATE);
      // neto de la línea = cantidad x precio - descuento, a 2 decimales, calculado aparte con Decimal
      const net = new Prisma.Decimal(QTY).times(BIG).minus('0.5').toDecimalPlaces(2, 4);
      expect(header.subtotal.toFixed(2)).toBe(net.toFixed(2));
      expect(header.total.toFixed(2)).toBe(net.toFixed(2));
    });

    it('emitir un borrador recalcula desde la BD sin perder precisión: factura y asiento exactos', async () => {
      const inv = (await api('post', '/invoices', 'acct').send({
        type: 'SALE', partnerId: customer, issueDate: '2031-03-11', ncfType: 'B01', lines: [{ description: 'Item', quantity: 1, unitPrice: 1 }],
      }).expect(201)).body;
      await prisma.invoiceLine.updateMany({ where: { invoiceId: inv.id }, data: { quantity: '1.0000', unitPrice: '99999999999999.9949', discount: '0.0000' } });
      await api('post', `/invoices/${inv.id}/issue`, 'acct').send({}).expect(201);

      const expected = new Prisma.Decimal('99999999999999.9949').toDecimalPlaces(2, 4);
      const issued = await prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } });
      expect(issued.status).toBe('ISSUED');
      expect(issued.total.toFixed(2)).toBe(expected.toFixed(2));
      const lines = await prisma.journalEntryLine.findMany({ where: { journalEntryId: issued.journalEntryId! } });
      const sum = (k: 'debit' | 'credit') => lines.reduce((a, l) => a.plus(l[k]), new Prisma.Decimal(0));
      expect(sum('debit').toFixed(2)).toBe(expected.toFixed(2));
      expect(sum('credit').toFixed(2)).toBe(expected.toFixed(2));
    });
  });

  // ------------------------------------------------------------------
  describe('Límite de intentos fallidos', () => {
    let n = 0;
    const mkUser = async (role: UserRole = UserRole.ACCOUNTANT) => {
      const e = `sec-lim${n++}-${sfx}@test.local`;
      const u = await prisma.user.create({ data: { email: e, password: await bcrypt.hash(password, 4), name: e, role, companyId: companyA } });
      return { email: e, id: u.id };
    };
    const login = (a: INestApplication, email: string, pass: string, ip?: string) => {
      const r = request(a.getHttpServer()).post('/auth/login');
      return (ip ? r.set('X-Forwarded-For', ip) : r).send({ email, password: pass });
    };
    const BAD = 'clave-incorrecta-1';

    it('5 fallos seguidos de la misma cuenta desde la misma IP: el 6.º se bloquea (aunque la clave sea correcta)', async () => {
      const u = await mkUser();
      for (let i = 0; i < 5; i++) await login(app, u.email, BAD).expect(401);
      const r = await login(app, u.email, password).expect(429);
      expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
      expect(Number(r.headers['retry-after'])).toBeLessThanOrEqual(900);
      expect(r.body).toMatchObject({ statusCode: 429 });
      expect(r.body.message).toMatch(/Demasiados intentos/);
      expect(r.body.access_token).toBeUndefined();
    });

    it('otras cuentas desde esa misma IP siguen entrando', async () => {
      const u = await mkUser();
      await login(app, u.email, password).expect(201);
    });

    it('un correo que no existe se bloquea igual que uno que existe (no permite enumerar cuentas)', async () => {
      const ghost = `fantasma-${sfx}@test.local`;
      const codes: number[] = [];
      for (let i = 0; i < 7; i++) codes.push((await login(app, ghost, BAD)).status);
      const real = await mkUser();
      const codesReal: number[] = [];
      for (let i = 0; i < 7; i++) codesReal.push((await login(app, real.email, BAD)).status);
      expect(codes).toEqual([401, 401, 401, 401, 401, 429, 429]);
      expect(codesReal).toEqual(codes);
    });

    it('mayúsculas y espacios en el correo no sirven para esquivar el límite', async () => {
      const u = await mkUser();
      for (let i = 0; i < 5; i++) await login(app, i % 2 ? u.email.toUpperCase() : u.email, BAD).expect(401);
      await login(app, u.email, password).expect(429);
    });

    it('un acierto reinicia la cuenta del par cuenta+IP', async () => {
      const u = await mkUser();
      for (let i = 0; i < 4; i++) await login(app, u.email, BAD).expect(401);
      await login(app, u.email, password).expect(201);
      for (let i = 0; i < 4; i++) await login(app, u.email, BAD).expect(401);
      await login(app, u.email, password).expect(201);
    });

    it('pasada la ventana (15 min) se puede volver a intentar', async () => {
      const u = await mkUser();
      for (let i = 0; i < 5; i++) await login(app, u.email, BAD).expect(401);
      await login(app, u.email, password).expect(429);
      const limiter = app.get(AttemptLimiter);
      const spy = vi.spyOn(limiter as unknown as { now(): number }, 'now').mockReturnValue(Date.now() + 15 * 60_000 + 1000);
      try {
        await login(app, u.email, password).expect(201);
      } finally {
        spy.mockRestore();
      }
    });

    it('sin TRUST_PROXY no se puede falsear la IP con X-Forwarded-For', async () => {
      const u = await mkUser();
      for (let i = 0; i < 5; i++) await login(app, u.email, BAD, `10.9.8.${i}`).expect(401);
      await login(app, u.email, password, '10.9.8.99').expect(429);
    });

    it('con TRUST_PROXY=1 cada IP real lleva su propia cuenta: un atacante no deja fuera a la víctima', async () => {
      const u = await mkUser();
      for (let i = 0; i < 5; i++) await login(proxyApp, u.email, BAD, '203.0.113.7').expect(401);
      await login(proxyApp, u.email, password, '203.0.113.7').expect(429); // el atacante, bloqueado
      await login(proxyApp, u.email, password, '198.51.100.20').expect(201); // la víctima, desde su IP
    });

    it('ataque distribuido a una cuenta (muchas IPs): tope por cuenta de 20 fallos', async () => {
      const u = await mkUser();
      for (let i = 0; i < 20; i++) await login(proxyApp, u.email, BAD, `192.0.2.${i + 1}`).expect(401);
      await login(proxyApp, u.email, password, '192.0.2.200').expect(429);
    });

    it('una sola IP probando muchas cuentas (password spraying): tope por IP de 40 fallos', async () => {
      const u = await mkUser();
      for (let i = 0; i < 40; i++) await login(proxyApp, `nadie${i}-${sfx}@test.local`, BAD, '192.0.2.250').expect(401);
      await login(proxyApp, u.email, password, '192.0.2.250').expect(429);
      await login(proxyApp, u.email, password, '192.0.2.251').expect(201); // otra IP, sin problema
    });

    it('cambiar la clave: 5 fallos en la clave actual y se bloquea (token robado no puede adivinarla)', async () => {
      const u = await mkUser();
      const t = (await login(app, u.email, password).expect(201)).body.access_token as string;
      const change = (cur: string) =>
        request(app.getHttpServer()).post('/users/me/change-password').set('Authorization', `Bearer ${t}`).send({ currentPassword: cur, newPassword: 'Nueva-Clave-98765' });
      for (let i = 0; i < 5; i++) await change(BAD).expect(422); // 422, no 401: no cierra la sesión (ANEXO-S0 G3)
      const r = await change(password).expect(429);
      expect(Number(r.headers['retry-after'])).toBeGreaterThan(0);
    });
  });

  // ------------------------------------------------------------------
  describe('Cabeceras HTTP y CORS', () => {
    it('helmet: nosniff, HSTS, sin X-Powered-By, también en respuestas de error', async () => {
      for (const r of [await api('get', '/auth/me', 'view').expect(200), await request(app.getHttpServer()).get('/auth/me').expect(401)]) {
        expect(r.headers['x-powered-by']).toBeUndefined();
        expect(r.headers['x-content-type-options']).toBe('nosniff');
        expect(r.headers['strict-transport-security']).toMatch(/max-age=\d+/);
        expect(r.headers['x-frame-options']).toBeDefined();
      }
    });

    it('nginx: en cada ruta que pasa al API oculta las cabeceras que él mismo pone (cada una sale una sola vez)', async () => {
      // Las que pone nginx (security-headers.conf) y que helmet también manda: si no se ocultan en
      // /api/, el navegador recibe dos valores (p. ej. X-Frame-Options DENY y SAMEORIGIN, o dos CSP).
      const nginxHeaders = [...readFileSync('frontend/deploy/security-headers.conf', 'utf8').matchAll(/^\s*add_header\s+([\w-]+)/gm)].map((m) => m[1].toLowerCase());
      const fromApi = (await request(app.getHttpServer()).get('/auth/me').expect(401)).headers;
      const both = nginxHeaders.filter((h) => fromApi[h] !== undefined);
      expect(both.length).toBeGreaterThanOrEqual(3);
      const conf = readFileSync('frontend/deploy/nginx.conf', 'utf8');
      const apiLocations = [...conf.matchAll(/location[^{]*\{([^}]*)\}/g)].map((m) => m[1]).filter((body) => body.includes('proxy_pass'));
      expect(apiLocations.length).toBeGreaterThanOrEqual(2);
      for (const body of apiLocations) {
        const hidden = [...body.matchAll(/proxy_hide_header\s+([\w-]+)/g)].map((m) => m[1].toLowerCase());
        expect(both.filter((h) => !hidden.includes(h))).toEqual([]);
      }
    });

    it('CORS apagado por defecto: ningún origen recibe permiso', async () => {
      const r = await request(app.getHttpServer()).options('/auth/login').set('Origin', 'https://evil.example').set('Access-Control-Request-Method', 'POST');
      expect(r.headers['access-control-allow-origin']).toBeUndefined();
    });

    it('con CORS_ORIGINS solo entran los orígenes listados (nunca "*")', async () => {
      const pre = (origin: string) =>
        request(proxyApp.getHttpServer()).options('/auth/login').set('Origin', origin).set('Access-Control-Request-Method', 'POST').set('Access-Control-Request-Headers', 'authorization');
      const ok = await pre('https://admin.example.com');
      expect(ok.headers['access-control-allow-origin']).toBe('https://admin.example.com');
      expect(ok.headers['access-control-allow-headers']).toMatch(/authorization/i);
      expect(ok.headers['access-control-allow-credentials']).toBeUndefined();
      expect((await pre('https://app.example.com')).headers['access-control-allow-origin']).toBe('https://app.example.com');
      expect((await pre('https://evil.example')).headers['access-control-allow-origin']).toBeUndefined();
      const real = await request(proxyApp.getHttpServer()).get('/auth/me').set('Origin', 'https://app.example.com');
      expect(real.headers['access-control-expose-headers']).toMatch(/Content-Disposition/);
    });
  });

  // ------------------------------------------------------------------
  describe('Tokens JWT', () => {
    const secret = process.env.JWT_SECRET!;
    const me = (t: string) => request(app.getHttpServer()).get('/auth/me').set('Authorization', `Bearer ${t}`);

    it('el token propio funciona; sin token, token basura, firmado con otra clave, "alg: none" y vencido: 401', async () => {
      const payload = jwt.decode(token.view) as { sub: string; email: string; role: string; companyId: string };
      const claims = { sub: payload.sub, email: payload.email, role: payload.role, companyId: payload.companyId };
      await me(token.view).expect(200);
      await request(app.getHttpServer()).get('/auth/me').expect(401);
      await me('esto.no.es.un.jwt').expect(401);
      await me(jwt.sign(claims, 'otra-clave-distinta-de-la-del-servidor-0123456789', { expiresIn: 600 })).expect(401);
      await me(jwt.sign(claims, secret, { algorithm: 'HS384', expiresIn: 600 })).expect(401);
      const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ ...claims, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url')}.`;
      await me(none).expect(401);
      await me(jwt.sign(claims, secret, { expiresIn: -10 })).expect(401);
      await me(jwt.sign(claims, secret, { expiresIn: 600 })).expect(200); // control: bien firmado sí pasa
    });

    it('el rol del token no manda: un token que dice ADMIN pero el usuario es VIEWER sigue siendo VIEWER', async () => {
      const payload = jwt.decode(token.view) as { sub: string; email: string; companyId: string };
      const forged = jwt.sign({ sub: payload.sub, email: payload.email, companyId: payload.companyId, role: 'ADMIN' }, secret, { expiresIn: 600 });
      expect((await me(forged).expect(200)).body.role).toBe('VIEWER');
      await request(app.getHttpServer()).post('/auth/register').set('Authorization', `Bearer ${forged}`)
        .send({ email: `x-${sfx}@test.local`, password: 'Clave-Larga-12345', name: 'x' }).expect(403);
    });
  });

  // ------------------------------------------------------------------
  describe('JWT_SECRET: no arranca con un secreto débil', () => {
    const base = { DATABASE_URL: 'postgresql://x' };
    it('rechaza cortos, repetitivos y de ejemplo', () => {
      expect(() => validate({ ...base, JWT_SECRET: 'corto' })).toThrow(/JWT_SECRET/);
      expect(() => validate({ ...base, JWT_SECRET: 'a'.repeat(64) })).toThrow(/pocos caracteres distintos/);
      expect(() => validate({ ...base, JWT_SECRET: 'ab'.repeat(32) })).toThrow(/pocos caracteres distintos/);
      expect(() => validate({ ...base, JWT_SECRET: 'CAMBIAR-por-un-valor-largo-y-aleatorio-123456' })).toThrow(/ejemplo/);
      expect(() => validate({ ...base, JWT_SECRET: 'my-super-secret-key-for-jwt-tokens-2024' })).toThrow(/ejemplo/);
      expect(() => validate({ ...base, JWT_SECRET: 'password-password-password-1234567890' })).toThrow(/ejemplo/);
    });
    it('acepta uno real (openssl rand -hex 64)', () => {
      const good = 'f3a9c1d27be84a6091cd5e7f2b3a8d4c6e1f09a7b5c3d2e8f4a6b1c9d7e5f3a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e2f4a6b8c0d2e4f6a8b0c2d4e6f8a0b2c4d6e8f0a1b3';
      expect(weakSecretReason(good)).toBeNull();
      expect(() => validate({ ...base, JWT_SECRET: good })).not.toThrow();
    });
    it('TRUST_PROXY y CORS_ORIGINS se validan', () => {
      const good = 'f3a9c1d27be84a6091cd5e7f2b3a8d4c6e1f09a7b5c3d2e8f4a6b1c9d7e5f3a2';
      expect(() => validate({ ...base, JWT_SECRET: good, TRUST_PROXY: '99' })).toThrow(/TRUST_PROXY/);
      expect(() => validate({ ...base, JWT_SECRET: good, TRUST_PROXY: '1', CORS_ORIGINS: 'https://a.com' })).not.toThrow();
    });
  });

  // ------------------------------------------------------------------
  describe('Política de rutas', () => {
    const routes = (a: INestApplication) => {
      const out: { method: string; path: string; guards: string[]; roles?: string[] }[] = [];
      for (const m of a.get(ModulesContainer).values()) {
        for (const w of m.controllers.values()) {
          if (!w.instance) continue;
          const proto = Object.getPrototypeOf(w.instance);
          const base = Reflect.getMetadata(PATH_METADATA, w.metatype!);
          const classGuards = (Reflect.getMetadata(GUARDS_METADATA, w.metatype!) ?? []).map((g: { name: string }) => g.name);
          for (const name of Object.getOwnPropertyNames(proto)) {
            const h = proto[name];
            if (name === 'constructor' || typeof h !== 'function') continue;
            const method = Reflect.getMetadata(METHOD_METADATA, h);
            if (method === undefined) continue;
            const guards = [...classGuards, ...(Reflect.getMetadata(GUARDS_METADATA, h) ?? []).map((g: { name: string }) => g.name)];
            out.push({
              method: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'][method], path: `/${base}/${Reflect.getMetadata(PATH_METADATA, h)}`.replace(/\/+/g, '/'),
              guards, roles: Reflect.getMetadata(ROLES_KEY, h) ?? Reflect.getMetadata(ROLES_KEY, w.metatype!),
            });
          }
        }
      }
      return out;
    };

    it('toda ruta exige JWT, salvo el login', () => {
      const all = routes(app);
      expect(all.length).toBeGreaterThan(100);
      expect(all.filter((r) => !r.guards.includes('JwtAuthGuard')).map((r) => `${r.method} ${r.path}`).sort())
        .toEqual(['POST /auth/login', 'POST /auth/login/2fa', 'POST /auth/login/2fa/enroll']);
      // @Roles sin RolesGuard no restringe nada: toda ruta con roles debe llevar ambos guards
      expect(all.filter((r) => r.roles && !r.guards.includes('RolesGuard')).map((r) => `${r.method} ${r.path}`)).toEqual([]);
    });

    it('toda ruta que modifica datos declara roles explícitos (solo el login y la cuenta propia quedan abiertos)', () => {
      const open = routes(app).filter((r) => r.method !== 'GET' && !r.roles).map((r) => `${r.method} ${r.path}`).sort();
      expect(open).toEqual([
        'PATCH /users/me', 'POST /auth/login', 'POST /auth/login/2fa', 'POST /auth/login/2fa/enroll', 'POST /users/me/change-password',
        'POST /users/me/two-factor/disable', 'POST /users/me/two-factor/enable', 'POST /users/me/two-factor/recovery-codes', 'POST /users/me/two-factor/setup',
      ]);
    });

    it('lecturas restringidas: usuarios, comentarios recibidos y llaves de servicio son solo de ADMIN (el resto de lecturas es para cualquier rol)', () => {
      const restricted = routes(app).filter((r) => r.method === 'GET' && r.roles).map((r) => `${r.path} -> ${r.roles!.join(',')}`).sort();
      expect(restricted).toEqual(['/feedback/ -> ADMIN', '/service-keys/ -> ADMIN', '/users/ -> ADMIN', '/users/:id -> ADMIN', '/users/security-events -> ADMIN']);
    });

    it('un VIEWER recibe 403 en cada ruta que exige un rol que no tiene (modificaciones y lecturas restringidas)', async () => {
      const targets = routes(app).filter((r) => r.roles && !r.roles.includes('VIEWER')); // incluye lecturas restringidas (ej. GET /users)
      expect(targets.length).toBeGreaterThan(50);
      const uuid = '00000000-0000-4000-8000-000000000000';
      for (const r of targets) {
        const url = r.path.replace(/:\w+/g, uuid);
        const res = await api(r.method.toLowerCase() as 'post', url, 'view').send({});
        expect(res.status, `${r.method} ${r.path}`).toBe(403);
      }
    });
  });

  // ------------------------------------------------------------------
  describe('Regresión: escrituras por id siempre con companyId', () => {
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((f) => {
        const p = join(dir, f);
        if (statSync(p).isDirectory()) return f === 'generated' ? [] : files(p);
        return p.endsWith('.ts') ? [p] : [];
      });
    // Únicos update/delete por id sin companyId permitidos: el id es del propio usuario autenticado
    const ALLOWED = [
      { file: 'src/auth/auth.service.ts', where: 'id: user.id' }, // lastLoginAt del usuario que acaba de autenticarse
      { file: 'src/users/users.service.ts', where: 'id: me.id' }, // perfil propio
    ];

    it('ningún tx.X.update/delete({ where: { id } }) sin companyId en el código', () => {
      const bad: string[] = [];
      for (const f of files('src')) {
        const src = readFileSync(f, 'utf8');
        for (const m of src.matchAll(/\.(update|delete)\(\{\s*where:\s*\{([^}]*)\}/g)) {
          const where = m[2];
          if (where.includes('companyId')) continue;
          if (ALLOWED.some((a) => f.replace(/\\/g, '/').endsWith(a.file) && where.includes(a.where))) continue;
          bad.push(`${f}: ${m[0].slice(0, 90)}`);
        }
      }
      expect(bad).toEqual([]);
    });
  });

  // ------------------------------------------------------------------
  describe('AttemptLimiter (unidad, con reloj simulado)', () => {
    class Clock extends AttemptLimiter {
      t = 1_000_000;
      protected now() { return this.t; }
      size() { return (this as unknown as { hits: Map<string, unknown> }).hits.size; }
    }
    const rule = (key: string, limit = 3, windowMs = 60_000) => [{ key, limit, windowMs }];

    it('bloquea al llegar al límite y dice cuántos segundos faltan', () => {
      const l = new Clock();
      const r = rule('a');
      l.recordFailure(r); l.recordFailure(r);
      expect(l.check(r)).toBe(0);
      l.recordFailure(r);
      expect(l.check(r)).toBe(60);
      l.t += 10_500;
      expect(l.check(r)).toBe(50); // redondea hacia arriba
    });

    it('la ventana es fija desde el primer fallo y al vencer se limpia y empieza de cero', () => {
      const l = new Clock();
      const r = rule('a');
      l.recordFailure(r); l.t += 30_000; l.recordFailure(r); l.recordFailure(r);
      expect(l.check(r)).toBe(30); // se cuenta desde el primer fallo, no desde el último
      l.t += 30_000;
      expect(l.check(r)).toBe(0);
      expect(l.size()).toBe(0); // la entrada vencida se borra
      l.recordFailure(r);
      l.t += 61_000;
      l.recordFailure(r); // ventana vencida: arranca otra con 1 fallo, no acumula con la anterior
      l.recordFailure(r);
      expect(l.check(r)).toBe(0);
      l.recordFailure(r);
      expect(l.check(r)).toBeGreaterThan(0);
    });

    it('cada regla se evalúa por separado y clear() solo borra las claves indicadas', () => {
      const l = new Clock();
      const both = [...rule('x', 1), ...rule('y', 5)];
      l.recordFailure(both);
      expect(l.check(rule('x', 1))).toBeGreaterThan(0);
      expect(l.check(rule('y', 5))).toBe(0);
      l.clear(['x']);
      expect(l.check(rule('x', 1))).toBe(0);
      l.recordFailure(rule('y', 5));
      expect(l.size()).toBe(1);
    });

    it('memoria acotada: al pasar de 50 mil claves primero se barren las vencidas (sin tocar las vigentes)', () => {
      const l = new Clock();
      l.recordFailure(rule('vigente-vieja', 1, 600_000)); // la más antigua, pero vigente
      for (let i = 0; i < 6_000; i++) l.recordFailure(rule(`vencida${i}`, 1, 1_000));
      l.t += 5_000;
      for (let i = 0; i < 43_999; i++) l.recordFailure(rule(`k${i}`, 1, 600_000));
      expect(l.size()).toBe(50_000);
      l.recordFailure(rule('nueva', 1, 600_000)); // pasa el tope: barre 6 mil vencidas y con eso basta
      expect(l.size()).toBe(44_001);
      expect(l.check(rule('vigente-vieja', 1))).toBeGreaterThan(0); // sigue bloqueada
      expect(l.check(rule('vencida0', 1))).toBe(0);
    });

    it('memoria acotada: si todas están vigentes, se descarta ~10 % de las más viejas', () => {
      const l = new Clock();
      for (let i = 0; i < 50_001; i++) l.recordFailure(rule(`k${i}`, 1, 600_000));
      expect(l.size()).toBeLessThanOrEqual(45_000);
      expect(l.size()).toBeGreaterThan(44_000);
      expect(l.check(rule('k0', 1))).toBe(0); // la más vieja se descartó
      expect(l.check(rule('k50000', 1))).toBeGreaterThan(0); // la más nueva se conserva
    });
  });
});
