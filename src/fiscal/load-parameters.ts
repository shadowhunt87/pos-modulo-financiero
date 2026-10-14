/**
 * Comando del cargador de parámetros fiscales (PLAN-v0.3 §5.5). Lo corre devops en el contenedor, con autorización de Carlos:
 *   node dist/fiscal/load-parameters.js <archivo.json> [--dry-run] --commit <hash-git> [--by "Nombre"]
 * Sale con código 1 si el archivo tiene errores o la carga falla. Nunca modifica ni borra filas.
 */
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { userInfo } from 'node:os';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { applyLoad, parseCatalog, planLoad, type LoadReport } from './fiscal-loader.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : undefined;
}

function print(r: LoadReport, dry: boolean) {
  const out = console.log;
  out(dry ? '== SIMULACIÓN (--dry-run): no se escribió nada ==' : '== CARGA ==');
  out(`sha256 del archivo: ${r.sha256}`);
  for (const n of r.newRows) out(`  + ${n.key} desde ${n.validFrom} (revisión ${n.revision}): ${n.value}`);
  for (const v of r.revisions) out(`  ~ ${v.key} desde ${v.validFrom}: la revisión ${v.revision} reemplaza a ${v.replaces}`);
  for (const v of r.validations) out(`  ✓ ${v.key} desde ${v.validFrom} validado por ${v.validatedBy}`);
  for (const o of r.newObligations) out(`  + obligación ${o.code} desde ${o.validFrom} (revisión ${o.revision})`);
  for (const h of r.newHolidays) out(`  + feriado ${h.date}: ${h.name}`);
  out(`Filas nuevas: ${r.newRows.length} · revisiones: ${r.revisions.length} · validaciones: ${r.validations.length} · sin cambios: ${r.skipped}`);
  if (r.affected.length) {
    out('Documentos emitidos con un valor que se corrige (revisa con la contadora si hacen falta notas):');
    for (const a of r.affected) out(`  ! empresa ${a.companyId} · factura ${a.number ?? a.invoiceId}${a.ncf ? ` (${a.ncf})` : ''} · ${a.key}`);
  }
  for (const e of r.errors) console.error(`  ERROR: ${e}`);
  if (r.loadId) out(`Carga registrada: ${r.loadId}`);
}

async function main() {
  const file = process.argv[2];
  const dry = process.argv.includes('--dry-run');
  const commit = arg('--commit');
  if (!file || file.startsWith('--')) { console.error('Uso: node dist/fiscal/load-parameters.js <archivo.json> [--dry-run] --commit <hash-git> [--by "Nombre"]'); process.exit(1); }
  if (!dry && !commit) { console.error('Falta --commit <hash-git> (el commit del archivo en git)'); process.exit(1); }
  const text = readFileSync(file, 'utf8');
  const parsed = parseCatalog(text);
  if (!parsed.file) { for (const e of parsed.errors) console.error(`  ERROR: ${e}`); console.error('Archivo rechazado: no se cargó nada.'); process.exit(1); }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const report = dry
      ? await planLoad(prisma, parsed.file, text)
      : await applyLoad(prisma, parsed.file, text, { fileName: basename(file), gitCommit: commit!, loadedBy: arg('--by') ?? userInfo().username });
    print(report, dry);
    if (!report.ok) { console.error('Carga rechazada: no se escribió nada.'); process.exitCode = 1; }
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((e: unknown) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
