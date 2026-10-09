// prisma/seed.ts
import 'dotenv/config';
import bcrypt from 'bcrypt'; // usa el mismo paquete que auth.service.ts (bcrypt o bcryptjs)
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client.js';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? 'admin@sirtech.do';
  const password = process.env.SEED_ADMIN_PASSWORD;
  const companyName = process.env.SEED_COMPANY_NAME ?? 'Sirtech';
  const taxId = process.env.SEED_COMPANY_TAX_ID; // RNC

  if (!password || password.length < 8) {
    throw new Error('Define SEED_ADMIN_PASSWORD (mínimo 8 caracteres)');
  }
  if (!taxId) {
    throw new Error('Define SEED_COMPANY_TAX_ID (RNC de la empresa)');
  }

  // 1. Empresa (taxId es único, así que el seed se puede repetir sin duplicar)
  const company = await prisma.company.upsert({
    where: { taxId },
    update: {},
    create: {
      name: companyName,
      taxId,
      baseCurrency: 'DOP',
    },
  });

  // 2. Usuario admin (email es único global)
  const hash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: {
      email,
      password: hash,
      name: 'Yovanny',
      role: 'ADMIN',
      companyId: company.id,
    },
  });

  console.log('Empresa:', company.id, '-', company.name);
  console.log('Admin listo:', user.email, '-', user.role);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());