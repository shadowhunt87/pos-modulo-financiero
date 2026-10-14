/**
 * Lista los ADMIN activos SIN verificación en dos pasos (ANEXO-S0 §8 paso 5). Termina con error si hay alguno:
 * antes de encender TWO_FACTOR_REQUIRED_ROLES=ADMIN debe terminar sin pendientes.
 *   node dist/cli/two-factor-status.js [--rnc <RNC>]
 */
import { arg, newPrisma, say } from './cli-common.js';

async function main() {
  const prisma = newPrisma();
  try {
    const rnc = arg('--rnc');
    const admins = await prisma.user.findMany({
      where: { role: 'ADMIN', active: true, isService: false, company: { active: true, ...(rnc ? { taxId: rnc } : {}) } },
      select: { email: true, company: { select: { name: true, taxId: true } }, twoFactor: { select: { enabledAt: true } } },
      orderBy: [{ companyId: 'asc' }, { email: 'asc' }],
    });
    const pending = admins.filter((a) => !a.twoFactor?.enabledAt);
    say(`ADMIN activos: ${admins.length} · con 2FA: ${admins.length - pending.length} · sin 2FA: ${pending.length}`);
    for (const p of pending) say(`  - ${p.email} (${p.company.name}, RNC ${p.company.taxId})`);
    if (pending.length) { say('Hay administradores sin verificación en dos pasos: NO enciendas la política todavía.'); process.exitCode = 1; }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e: unknown) => { say(e instanceof Error ? e.message : String(e)); process.exit(1); });
