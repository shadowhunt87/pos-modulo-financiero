import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { json } from 'express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';

/**
 * ÚNICO lugar donde se crea y configura la app. main.ts y los e2e arrancan por
 * aquí, así que lo que se prueba es exactamente lo que corre en producción:
 * si alguien quita el ValidationPipe, los tests de validación fallan.
 */
export async function createApp(options: { silent?: boolean } = {}): Promise<INestApplication> {
  const app = await NestFactory.create(AppModule, {
    logger: options.silent ? false : undefined,
    // En tests, un error de arranque (ej. falta el .env) debe fallar el test con
    // un mensaje claro, no abortar el proceso con un stack nativo.
    abortOnError: options.silent ? false : undefined,
  });

  // Sin este pipe los decorators de class-validator en los DTOs NO se ejecutan.
  // whitelist + forbidNonWhitelisted: rechaza campos que el DTO no declara
  // (evita que alguien meta `role`, `companyId`, etc. por la puerta de atrás).
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const config = app.get(ConfigService);

  // Cabeceras de seguridad (nosniff, HSTS, sin X-Powered-By, etc.)
  app.use(helmet());

  // El CSV de un extracto bancario (ImportStatementDto) puede llegar a 5 MB, pero SOLO esa ruta
  // acepta cuerpos grandes: con 6 MB en todas, un POST sin sesión a /auth/login con miles de claves
  // congela el ValidationPipe durante minutos. Aquí el guard JWT corre antes que el pipe.
  // El primer parser que lee el cuerpo gana; el global (100 KB) se salta los que ya leyó este.
  app.use(/^\/bank-accounts\/[^/]+\/import$/, json({ limit: '6mb' }));
  (app as NestExpressApplication).useBodyParser('json', { limit: '100kb' });

  // Detrás de nginx/Cloudflare/load balancer hay que decir cuántos proxies son; si no, todos los
  // clientes parecen tener la IP del proxy y el límite de intentos de login castigaría a todos juntos.
  // Con TRUST_PROXY=0 (default) se ignora X-Forwarded-For: nadie puede falsear su IP.
  // Number(): ConfigService puede devolver '1' (texto) y Express lo leería como una IP, no como "1 proxy"
  const hops = Number(config.get('TRUST_PROXY') ?? 0);
  if (hops > 0) app.getHttpAdapter().getInstance().set('trust proxy', hops);

  // CORS apagado por defecto. Solo se abre a los orígenes listados (frontend), nunca a '*'.
  const origins = (config.get<string>('CORS_ORIGINS') ?? '').split(',').map((o) => o.trim()).filter(Boolean);
  if (origins.length) {
    app.enableCors({
      origin: origins,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      exposedHeaders: ['Content-Disposition', 'Retry-After'],
      maxAge: 600,
    });
  }
  return app;
}