// vitest.config.e2e.ts
import { defineConfig } from 'vitest/config';
import swc from 'unplugin-swc';
import { loadEnv } from 'vite';

export default defineConfig(({ mode }) => ({
  test: {
    globals: true,
    root: './',
    include: ['test/**/*.e2e-spec.ts'],
    env: loadEnv(mode || 'test', process.cwd(), ''),
    fileParallelism: false,
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
}));