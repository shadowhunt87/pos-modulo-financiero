import { readFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadEnv } from 'vite';
import { PrismaClient } from '../src/generated/prisma/client.js';
import { applyLoad, parseCatalog } from '../src/fiscal/fiscal-loader.js';

/**
 * Antes de los e2e: carga el catálogo fiscal del repositorio en la base de pruebas (R9: el sistema no tiene
 * valores fiscales en el código, así que la base de pruebas los necesita). Es idempotente: si ya está, no hace nada.
 */
export default async function setup() {
  const env = loadEnv('test', process.cwd(), '');
  const file = 'docs/normativa-dgii/parametros/2026-10-14_catalogo-inicial.json';
  const text = readFileSync(file, 'utf8');
  const parsed = parseCatalog(text);
  if (!parsed.file) throw new Error(`Catálogo fiscal inválido:\n${parsed.errors.join('\n')}`);
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: env.DATABASE_URL }) });
  try {
    const r = await applyLoad(prisma, parsed.file, text, { fileName: file, gitCommit: '0000000', loadedBy: 'e2e' });
    if (!r.ok) throw new Error(`No se pudo cargar el catálogo fiscal de pruebas:\n${r.errors.join('\n')}`);
  } finally {
    await prisma.$disconnect();
  }
}
