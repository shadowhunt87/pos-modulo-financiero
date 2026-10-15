import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { AccountType, AuditAction, PayrollConceptKind } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { CreatePayrollConceptDto, ListPayrollConceptsQuery, UpdatePayrollConceptDto, UpdatePayrollSettingsDto } from './dto.js';

type Tx = Prisma.TransactionClient;
const { ASSET, LIABILITY, EXPENSE } = AccountType;

/** Tipos de cuenta permitidos para cada cuenta de la nómina. */
export const PAYROLL_ACCOUNT_RULES = {
  salaryExpenseAccountId: { types: [EXPENSE], label: 'Gasto de sueldos' },
  employerContributionsExpenseAccountId: { types: [EXPENSE], label: 'Gasto de aportes patronales' },
  salariesPayableAccountId: { types: [LIABILITY], label: 'Sueldos por pagar' },
  tssPayableAccountId: { types: [LIABILITY], label: 'TSS por pagar' },
  isrPayableAccountId: { types: [LIABILITY], label: 'ISR retenido a asalariados por pagar' },
  otherDeductionsPayableAccountId: { types: [LIABILITY, ASSET], label: 'Otros descuentos de nómina' },
} as const;
export type PayrollAccountKey = keyof typeof PAYROLL_ACCOUNT_RULES;
const KEYS = Object.keys(PAYROLL_ACCOUNT_RULES) as PayrollAccountKey[];

const CONCEPT_ACCOUNT: Record<PayrollConceptKind, readonly AccountType[]> = {
  EARNING: [EXPENSE], // gasto (horas extra, comisiones...)
  DEDUCTION: [LIABILITY, ASSET], // por pagar a un tercero, o préstamo al empleado que se cobra
};

/** Configuración contable de la nómina y conceptos de ingreso y descuento (P3). */
@Injectable()
export class PayrollSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccount(tx: Tx, companyId: string, id: string, types: readonly AccountType[], label: string) {
    const a = await tx.account.findFirst({ where: { id, companyId } });
    if (!a) throw new NotFoundException('Cuenta contable no encontrada');
    if (!a.active || !a.isPostable) throw new UnprocessableEntityException(`La cuenta ${a.code} está inactiva o no admite movimientos`);
    if (!types.includes(a.type)) throw new UnprocessableEntityException(`La cuenta ${a.code} no sirve para «${label}»`);
  }

  async getSettings(user: AuthUser) {
    const s = await this.prisma.payrollSettings.findUnique({ where: { companyId: user.companyId } });
    const ids = KEYS.map((k) => s?.[k]).filter((x): x is string => !!x);
    const accounts = await this.prisma.account.findMany({ where: { companyId: user.companyId, id: { in: ids } }, select: { id: true, code: true, name: true } });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return {
      ...Object.fromEntries(KEYS.map((k) => [k, s?.[k] ? { accountId: s[k], ...byId.get(s[k]!) } : null])),
      srlRate: s?.srlRate ?? null,
    };
  }

  async updateSettings(dto: UpdatePayrollSettingsDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      for (const k of KEYS) {
        const id = dto[k];
        if (id) await this.assertAccount(tx, user.companyId, id, PAYROLL_ACCOUNT_RULES[k].types, PAYROLL_ACCOUNT_RULES[k].label);
      }
      await tx.payrollSettings.upsert({ where: { companyId: user.companyId }, update: dto, create: { ...dto, companyId: user.companyId } });
      await writeAudit(tx, user, 'PayrollSettings', user.companyId, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue);
    });
    return this.getSettings(user);
  }

  /** Para la nómina: las cuentas pedidas o 422 con sus nombres. */
  async require<K extends PayrollAccountKey>(tx: Tx, companyId: string, keys: readonly K[]): Promise<Record<K, string>> {
    const s = await tx.payrollSettings.findUnique({ where: { companyId } });
    const missing = keys.filter((k) => !s?.[k]);
    if (missing.length) {
      throw new UnprocessableEntityException(`Falta configurar en Configuración de nómina: ${missing.map((k) => PAYROLL_ACCOUNT_RULES[k].label).join(', ')}`);
    }
    return Object.fromEntries(keys.map((k) => [k, s![k]!])) as Record<K, string>;
  }

  // ---------------- Conceptos ----------------
  async createConcept(dto: CreatePayrollConceptDto, user: AuthUser) {
    if (dto.kind === PayrollConceptKind.DEDUCTION && (dto.affectsTss || dto.affectsIsr)) {
      throw new UnprocessableEntityException('«Cotiza TSS» y «Paga ISR» son solo para ingresos');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (dto.accountId) await this.assertAccount(tx, user.companyId, dto.accountId, CONCEPT_ACCOUNT[dto.kind], dto.name);
        const c = await tx.payrollConcept.create({ data: { ...dto, companyId: user.companyId } });
        await writeAudit(tx, user, 'PayrollConcept', c.id, AuditAction.CREATE, { code: c.code, name: c.name, kind: c.kind });
        return c;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Ya existe un concepto con el código ${dto.code}`);
      throw e;
    }
  }

  listConcepts(q: ListPayrollConceptsQuery, user: AuthUser) {
    return this.prisma.payrollConcept.findMany({
      where: { companyId: user.companyId, kind: q.kind, active: q.active },
      include: { account: { select: { id: true, code: true, name: true } } },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  async updateConcept(id: string, dto: UpdatePayrollConceptDto, user: AuthUser) {
    const cur = await this.prisma.payrollConcept.findFirst({ where: { id, companyId: user.companyId } });
    if (!cur) throw new NotFoundException('Concepto no encontrado');
    if (cur.kind === PayrollConceptKind.DEDUCTION && (dto.affectsTss || dto.affectsIsr)) {
      throw new UnprocessableEntityException('«Cotiza TSS» y «Paga ISR» son solo para ingresos');
    }
    return this.prisma.$transaction(async (tx) => {
      if (dto.accountId) await this.assertAccount(tx, user.companyId, dto.accountId, CONCEPT_ACCOUNT[cur.kind], cur.name);
      const c = await tx.payrollConcept.update({ where: { id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'PayrollConcept', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue);
      return c;
    });
  }
}
