/**
 * Exportación completa de una empresa desde el servidor (ANEXO-S0 §4.8), p. ej. cuando ya está desactivada:
 *   umask 077 && docker compose ... run --rm --no-deps -T api node dist/cli/data-export.js \
 *     --rnc <RNC> --as <correo de un ADMIN> --motivo "<obligatorio>" [--purpose CANCELLATION] > ~/financiero-exportaciones/<RNC>-<fecha>.zip
 * El ZIP sale por la salida ESTÁNDAR; todo lo demás (mensajes, Nest, Prisma) por la de errores.
 */
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { LoggerService } from '@nestjs/common';
import { AppModule } from '../app.module.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { DataExportService, type ExportPurpose } from '../data-export/data-export.service.js';
import { arg, opsLog, say } from './cli-common.js';

const stderrLogger: LoggerService = {
  log: (m) => say(`[nest] ${String(m)}`), error: (m) => say(`[nest] ERROR ${String(m)}`), warn: (m) => say(`[nest] ${String(m)}`),
  debug: () => undefined, verbose: () => undefined,
};

async function main() {
  const rnc = arg('--rnc'), as = arg('--as'), motivo = arg('--motivo');
  const purpose = (arg('--purpose') ?? 'CANCELLATION') as ExportPurpose;
  if (!rnc || !as || !motivo || motivo.trim().length < 5 || !['ON_DEMAND', 'CANCELLATION'].includes(purpose)) {
    say('Uso: node dist/cli/data-export.js --rnc <RNC> --as <correo de un ADMIN> --motivo "<texto>" [--purpose CANCELLATION|ON_DEMAND] > archivo.zip');
    process.exit(1);
  }
  if (process.stdout.isTTY) { say('La salida estándar es la pantalla: redirígela a un archivo (> archivo.zip).'); process.exit(1); }
  const app = await NestFactory.createApplicationContext(AppModule, { logger: stderrLogger });
  try {
    const prisma = app.get(PrismaService);
    const admin = await prisma.user.findFirst({ where: { email: as, role: 'ADMIN', isService: false, company: { taxId: rnc } } });
    if (!admin) { say('No hay un ADMIN con ese correo en la empresa de ese RNC.'); process.exitCode = 1; return; }
    const exporter = app.get(DataExportService);
    if (!exporter.tryAcquire()) { say('Ya hay una exportación en curso en este proceso.'); process.exitCode = 1; return; }
    try {
      const ctx = {
        companyId: admin.companyId, actor: { id: admin.id, email: admin.email, role: admin.role, companyId: admin.companyId },
        via: 'operator-cli' as const, purpose, motivo, meta: { ipAddress: null, userAgent: 'operator-cli' },
      };
      const id = await exporter.start(ctx);
      opsLog(`data-export empresa=${rnc} como=${as} proposito=${purpose} motivo="${motivo.replace(/"/g, "'")}" id=${id}`);
      await exporter.stream(process.stdout, ctx, id);
      say('Exportación terminada. Entrégala por el canal acordado (D48) y bórrala del servidor al confirmar la entrega.');
    } finally { exporter.release(); }
  } finally {
    await app.close();
  }
}

void main().catch((e: unknown) => { say(e instanceof Error ? e.message : String(e)); process.exit(1); });
