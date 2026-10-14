import { appendFileSync } from 'node:fs';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

/** Comandos de operación: todo mensaje va a la salida de ERRORES (la estándar queda libre para datos, p. ej. un ZIP). */
export const say = (msg: string) => process.stderr.write(`${msg}\n`);

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : undefined;
}
export const flag = (name: string) => process.argv.includes(name);

export const newPrisma = () => new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

/**
 * Línea en financiero-ops.log (OPS_LOG_FILE; en el contenedor, un volumen de la carpeta de operación).
 * Sin datos secretos: fecha, acción, empresa, correo, motivo.
 */
export function opsLog(line: string) {
  const file = process.env.OPS_LOG_FILE;
  const text = `${new Date().toISOString()} ${line}`;
  say(`[ops] ${text}`);
  if (!file) return;
  try { appendFileSync(file, `${text}\n`, { mode: 0o600 }); } catch (e) { say(`AVISO: no se pudo escribir en ${file}: ${(e as Error).message}`); }
}
