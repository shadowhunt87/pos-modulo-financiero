/**
 * Rescate de una contraseña olvidada, desde la terminal del servidor (o de la máquina de desarrollo):
 *   node --env-file=.env dist/cli/password-reset.js --lista
 *   node --env-file=.env dist/cli/password-reset.js --email <correo> --motivo "<texto>"
 * --lista muestra los usuarios (correo, rol, empresa, si está activo), nunca contraseñas.
 * Con --email pone una CLAVE NUEVA al azar, que se muestra UNA vez aquí (salida de errores) y nunca se guarda en la
 * bitácora ni en el log. Cierra las sesiones abiertas (passwordChangedAt). La verificación en dos pasos no se toca:
 * si también se perdió el teléfono, se usa two-factor-reset.js.
 */
import * as bcrypt from 'bcrypt';
import { AuditAction } from '../generated/prisma/enums.js';
import { writeAudit } from '../common/audit.js';
import { newRecoveryCode } from '../auth/two-factor/recovery-codes.js';
import { arg, flag, newPrisma, opsLog, say } from './cli-common.js';

async function main() {
  const email = arg('--email');
  const motivo = arg('--motivo');
  if (!flag('--lista') && (!email || !motivo || motivo.trim().length < 5)) {
    say('Uso: node --env-file=.env dist/cli/password-reset.js --lista');
    say('     node --env-file=.env dist/cli/password-reset.js --email <correo> --motivo "<por qué y quién lo pidió>"');
    process.exit(1);
  }
  const prisma = newPrisma();
  try {
    if (flag('--lista')) {
      const users = await prisma.user.findMany({
        where: { isService: false }, orderBy: [{ company: { name: 'asc' } }, { email: 'asc' }],
        select: { email: true, role: true, active: true, company: { select: { name: true } } },
      });
      if (!users.length) { say('No hay usuarios en esta base. Crea el primero con: npx prisma db seed'); return; }
      for (const u of users) say(`${u.company.name.padEnd(24)} ${u.email.padEnd(36)} ${u.role.padEnd(12)} ${u.active ? 'activo' : 'INACTIVO'}`);
      return;
    }
    const user = await prisma.user.findUnique({ where: { email: email! }, include: { company: { select: { taxId: true } } } });
    if (!user || user.isService) { say('No existe un usuario con ese correo. Usa --lista para ver los correos.'); process.exitCode = 1; return; }
    const temp = newRecoveryCode().replace(/-/g, ''); // 16 caracteres, 80 bits
    const hash = await bcrypt.hash(temp, 10);
    await prisma.$transaction(async (tx) => {
      await tx.user.updateMany({ where: { id: user.id, companyId: user.companyId }, data: { password: hash, passwordChangedAt: new Date() } });
      // La columna exige un usuario: actor = el propio usuario; las pantallas lo muestran como «operador del sistema»
      const actor = { id: user.id, email: user.email, role: user.role, companyId: user.companyId };
      await writeAudit(tx, actor, 'User', user.id, AuditAction.UPDATE, { event: 'PASSWORD_RESET_BY_ADMIN', via: 'operator-cli', passwordReset: true, motivo }, { ipAddress: null, userAgent: 'operator-cli' });
    });
    opsLog(`password-reset empresa=${user.company.taxId} correo=${user.email} motivo="${motivo!.replace(/"/g, "'")}"`);
    say('');
    say(`Listo. Contraseña de ${user.email} cambiada y sesiones cerradas.`);
    say(`CLAVE TEMPORAL (se muestra solo esta vez): ${temp}`);
    if (!user.active) say('OJO: este usuario está INACTIVO; no podrá entrar hasta que un administrador lo active.');
    say('Entra con ella y cámbiala en el menú de tu nombre › «Mi perfil y clave».');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e: unknown) => { say(e instanceof Error ? e.message : String(e)); process.exit(1); });
