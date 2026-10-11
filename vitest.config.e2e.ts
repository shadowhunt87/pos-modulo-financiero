// vitest.config.e2e.ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { loadEnv } from 'vite';

// Los e2e BORRAN datos: se niegan a correr si la base no es de pruebas.
// .env.test (si existe) pisa a .env; ver .env.test.example y `docker compose up -d postgres-test`.
function testEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), '');
  const dbName = (() => {
    try { return decodeURIComponent(new URL(env.DATABASE_URL ?? '').pathname.slice(1)); } catch { return ''; }
  })();
  if (!/test/i.test(dbName)) {
    throw new Error(
      `Los tests e2e borran datos y DATABASE_URL apunta a "${dbName || '(vacia)'}", que no parece una base de pruebas.\n` +
      'Crea .env.test (copia .env.test.example), levanta la base con "docker compose up -d postgres-test"\n' +
      'y aplica las migraciones con "npm run test:db:migrate". El nombre de la base debe contener "test".',
    );
  }
  return env;
}

export default defineConfig(({ mode }) => ({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: testEnv(mode || 'test'),
    fileParallelism: false,
    hookTimeout: 60_000,
    testTimeout: 30_000,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
}));