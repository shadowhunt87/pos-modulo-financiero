import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createApp } from '../src/app.setup.js';

/**
 * Tamaño máximo del cuerpo JSON: 100 KB en todas las rutas; solo la importación de extractos
 * bancarios acepta hasta 6 MB. Un cuerpo enorme con miles de claves en /auth/login (sin sesión)
 * congelaba el ValidationPipe durante minutos.
 */
describe('Límite del cuerpo JSON (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createApp({ silent: true });
    await app.init();
  });
  afterAll(async () => { await app.close(); });

  const bigEmail = () => Object.fromEntries(Array.from({ length: 20_000 }, (_, i) => [`k${i}`, 0]));

  it('rechaza con 413 un login de más de 100 KB sin llegar a validarlo', async () => {
    const t0 = Date.now();
    const res = await request(app.getHttpServer()).post('/auth/login').send({ email: bigEmail(), password: 'x' });
    expect(res.status).toBe(413);
    expect(Date.now() - t0).toBeLessThan(2000);
  });

  it('la importación de extractos acepta más de 100 KB (llega al guard: 401 sin sesión, no 413)', async () => {
    const csv = 'fecha,descripcion,monto\n' + '2026-01-01,pago,100.00\n'.repeat(20_000);
    const res = await request(app.getHttpServer())
      .post('/bank-accounts/00000000-0000-4000-8000-000000000000/import')
      .send({ csv });
    expect(res.status).toBe(401);
  });
});
