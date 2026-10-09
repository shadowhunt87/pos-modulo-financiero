import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
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
  return app;
}