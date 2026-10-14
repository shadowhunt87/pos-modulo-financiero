/**
 * Rescate del único ADMIN que perdió el teléfono y los códigos (ANEXO-S0 §3.10). Lo ejecuta Carlos por SSH, después de
 * confirmar la identidad por el teléfono del contrato (D43):
 *   node dist/cli/two-factor-reset.js --email <correo> --motivo "<texto>" [--forzar]
 * Hace lo mismo que el restablecimiento desde la aplicación, incluida una CLAVE NUEVA, que se muestra UNA vez aquí
 * (salida de errores) y nunca se guarda en la bitácora ni en el log.
 */
import * as bcrypt from 'bcrypt';
import { AuditAction } from '../generated/prisma/enums.js';
import { writeAudit } from '../common/audit.js';
import { ENROLL_WINDOW_MS } from '../auth/two-factor/two-factor.service.js';
import { newRecoveryCode } from '../auth/two-factor/recovery-codes.js';
import { arg, flag, newPrisma, opsLog, say } from './cli-common.js';

async function main() {
  const email = arg('--email');
  const motivo = arg('--motivo');
  if (!email || !motivo || motivo.trim().length < 5) {
    say('Uso: node dist/cli/two-factor-reset.js --email <correo> --motivo "<por qué, quién lo pidió y cómo se confirmó>" [--forzar]');
    process.exit(1);
  }
  const prisma = newPrisma();
  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { company: { select: { id: true, name: true, taxId: true } } } });
    if (!user || user.isService) { say('No existe un usuario con ese correo.'); process.exitCode = 1; return; }
    const others = await prisma.user.findMany({
      where: { companyId: user.companyId, role: 'ADMIN', active: true, isService: false, id: { not: user.id } }, select: { email: true },
    });
    if (others.length && !flag('--forzar')) {
      say(`Esta empresa tiene otro administrador activo (${others.map((o) => o.email).join(', ')}): que lo restablezca desde la aplicación.`);
      say('Si de verdad hace falta hacerlo desde aquí, agrega --forzar (queda anotado).');
      process.exitCode = 1; return;
    }
    const temp = newRecoveryCode().replace(/-/g, ''); // 16 caracteres, 80 bits
    const hash = await bcrypt.hash(temp, 10);
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { id: user.id, companyId: user.companyId }, data: { password: hash, passwordChangedAt: now } });
      await tx.userRecoveryCode.deleteMany({ where: { userId: user.id, user: { companyId: user.companyId } } });
      const data = {
        secretEnc: null, enabledAt: null, enabledIp: null, pendingSecretEnc: null, pendingExpiresAt: null, lastUsedStep: null,
        totpFailures: 0, totpLockedUntil: null, totpDayFailures: 0, totpDayStart: null, enrollAllowedUntil: new Date(now.getTime() + ENROLL_WINDOW_MS),
      };
      const r = await tx.userTwoFactor.updateMany({ where: { userId: user.id, user: { companyId: user.companyId } }, data });
      if (r.count === 0) await tx.userTwoFactor.create({ data: { userId: user.id, ...data } });
      // La columna exige un usuario: actor = el propio usuario; las pantallas lo muestran como «operador del sistema»
      const actor = { id: user.id, email: user.email, role: user.role, companyId: user.companyId };
      await writeAudit(tx, actor, 'User', user.id, AuditAction.UPDATE, { event: 'TWO_FACTOR_RESET', via: 'operator-cli', motivo, forzado: flag('--forzar') }, { ipAddress: null, userAgent: 'operator-cli' });
      await writeAudit(tx, actor, 'User', user.id, AuditAction.UPDATE, { event: 'PASSWORD_RESET_BY_ADMIN', via: 'operator-cli', passwordReset: true }, { ipAddress: null, userAgent: 'operator-cli' });
    });
    opsLog(`two-factor-reset empresa=${user.company.taxId} correo=${user.email} forzado=${flag('--forzar')} motivo="${motivo.replace(/"/g, "'")}"`);
    say('');
    say('Listo. Verificación en dos pasos restablecida y sesiones cerradas.');
    say(`CLAVE TEMPORAL (se muestra solo esta vez): ${temp}`);
    say('Díctasela a la persona por el teléfono del contrato y pídele que la cambie al entrar. Tiene 72 horas para inscribir su teléfono.');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e: unknown) => { say(e instanceof Error ? e.message : String(e)); process.exit(1); });
