import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import * as bcrypt from 'bcrypt';
import { createApp } from '../src/app.setup.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserRole } from '../src/generated/prisma/enums.js';

/**
 * Requiere Postgres arriba (docker compose up -d) y el .env configurado.
 * Crea sus propias empresas y usuarios con sufijo único y los borra al final,
 * así no toca tus datos reales.
 */
describe('Auth (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const suffix = Date.now().toString(36);
  const password = 'E2e-Pass-12345';
  const adminEmail = `e2e-admin-${suffix}@test.local`;
  const viewerEmail = `e2e-viewer-${suffix}@test.local`;
  const newUserEmail = `e2e-new-${suffix}@test.local`;

  let companyAId: string;
  let companyBId: string;
  let adminToken: string;
  let viewerToken: string;

  const login = (email: string, pass = password) =>
    request(app.getHttpServer()).post('/auth/login').send({ email, password: pass });

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();

    prisma = app.get(PrismaService);
    const hash = await bcrypt.hash(password, 4);

    const companyA = await prisma.company.create({
      data: { name: `E2E A ${suffix}`, taxId: `E2E-A-${suffix}` },
    });
    const companyB = await prisma.company.create({
      data: { name: `E2E B ${suffix}`, taxId: `E2E-B-${suffix}` },
    });
    companyAId = companyA.id;
    companyBId = companyB.id;

    await prisma.user.create({
      data: { email: adminEmail, password: hash, name: 'Admin E2E', role: UserRole.ADMIN, companyId: companyAId },
    });
    await prisma.user.create({
      data: { email: viewerEmail, password: hash, name: 'Viewer E2E', role: UserRole.VIEWER, companyId: companyAId },
    });

    adminToken = (await login(adminEmail)).body.access_token;
    viewerToken = (await login(viewerEmail)).body.access_token;
  });

  afterAll(async () => {
    const ids = [companyAId, companyBId].filter(Boolean);
    await prisma.user.deleteMany({ where: { companyId: { in: ids } } });
    await prisma.company.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe('login', () => {
    it('devuelve token y usuario con credenciales válidas', async () => {
      const res = await login(adminEmail).expect(201);
      expect(res.body.access_token).toEqual(expect.any(String));
      expect(res.body.user).toMatchObject({ email: adminEmail, role: 'ADMIN', companyId: companyAId });
      expect(res.body.user.password).toBeUndefined();
    });

    it('el token dura 8 horas (28800 s) por defecto', () => {
      const payload = JSON.parse(Buffer.from(adminToken.split('.')[1], 'base64url').toString());
      expect(payload.exp - payload.iat).toBe(28800);
    });

    it('401 con clave incorrecta', async () => {
      await login(adminEmail, 'clave-incorrecta-123').expect(401);
    });

    it('401 con email inexistente (mismo error que clave mala)', async () => {
      await login(`nadie-${suffix}@test.local`).expect(401);
    });

    it('400 con body inválido (el ValidationPipe está activo)', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: 'no-es-un-email', password: 12345678 })
        .expect(400);
    });
  });

  describe('GET /auth/me', () => {
    it('401 sin token', async () => {
      await request(app.getHttpServer()).get('/auth/me').expect(401);
    });

    it('401 con token basura', async () => {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', 'Bearer esto.no.sirve')
        .expect(401);
    });

    it('200 con token válido y trae role + companyId', async () => {
      const res = await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
      expect(res.body).toMatchObject({ email: adminEmail, role: 'ADMIN', companyId: companyAId });
    });
  });

  describe('POST /auth/register', () => {
    // confirmPassword: la clave del ADMIN que crea el usuario (ANEXO-S0 3.10b)
    const body = { email: newUserEmail, password, name: 'Nuevo E2E', confirmPassword: password };

    it('401 sin token', async () => {
      await request(app.getHttpServer()).post('/auth/register').send(body).expect(401);
    });

    it('403 si el usuario no es ADMIN', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${viewerToken}`)
        .send(body)
        .expect(403);
    });

    it('400 si intentan mandar companyId en el body (no se puede apuntar a otra empresa)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ ...body, companyId: companyBId })
        .expect(400);
    });

    it('ADMIN crea usuario en SU empresa, como ACCOUNTANT por defecto, sin hash ni token', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body)
        .expect(201);

      expect(res.body).toMatchObject({
        email: newUserEmail,
        role: 'ACCOUNTANT',
        companyId: companyAId,
      });
      expect(res.body.password).toBeUndefined();
      expect(res.body.access_token).toBeUndefined();
    });

    it('409 si el email ya existe', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .set('Authorization', `Bearer ${adminToken}`)
        .send(body)
        .expect(409);
    });

    it('el usuario recién creado puede iniciar sesión', async () => {
      await login(newUserEmail).expect(201);
    });
  });

  describe('empresa o usuario desactivado', () => {
    it('un token deja de servir apenas desactivan al usuario', async () => {
      await prisma.user.update({ where: { email: viewerEmail }, data: { active: false } });
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${viewerToken}`)
        .expect(401);
      await login(viewerEmail).expect(401);
    });
  });
});
