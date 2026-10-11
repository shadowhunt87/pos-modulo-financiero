import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AccountType, AuditAction } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit } from '../../common/audit.js';
import { UpdateAccountingSettingsDto } from '../dto/accounting-settings.dto.js';

const { ASSET, LIABILITY, EQUITY, INCOME, EXPENSE } = AccountType;

/** Tipos de cuenta permitidos para cada configuración. */
export const SETTINGS_RULES = {
  receivableAccountId: [ASSET],
  payableAccountId: [LIABILITY],
  salesIncomeAccountId: [INCOME],
  purchaseExpenseAccountId: [EXPENSE, ASSET],
  salesDiscountAccountId: [INCOME, EXPENSE],
  customerAdvanceAccountId: [LIABILITY],
  supplierAdvanceAccountId: [ASSET],
  retainedEarningsAccountId: [EQUITY],
  currentYearResultAccountId: [EQUITY],
  fxGainAccountId: [INCOME],
  fxLossAccountId: [EXPENSE],
  roundingAccountId: [INCOME, EXPENSE],
} as const satisfies Record<string, readonly AccountType[]>;

export type SettingsKey = keyof typeof SETTINGS_RULES;
const KEYS = Object.keys(SETTINGS_RULES) as SettingsKey[];

@Injectable()
export class AccountingSettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser) {
    const s = await this.prisma.accountingSettings.findUnique({ where: { companyId: user.companyId } });
    // Con cuenta resuelta (código y nombre) para que el front la muestre sin más consultas
    const ids = KEYS.map((k) => s?.[k]).filter((x): x is string => !!x);
    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId, id: { in: ids } },
      select: { id: true, code: true, name: true, type: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    return {
      ...(Object.fromEntries(
        KEYS.map((k) => [k, s?.[k] ? { accountId: s[k], ...byId.get(s[k]!) } : null]),
      ) as Record<SettingsKey, unknown>),
      requireEntryApproval: s?.requireEntryApproval ?? false,
    };
  }

  async update(dto: UpdateAccountingSettingsDto, user: AuthUser) {
    const data: Partial<Record<SettingsKey, string | null>> & { requireEntryApproval?: boolean } = {};
    if (dto.requireEntryApproval !== undefined) data.requireEntryApproval = dto.requireEntryApproval;
    for (const key of KEYS) {
      const value = dto[key];
      if (value === undefined) continue;
      if (value !== null) {
        const a = await this.prisma.account.findFirst({ where: { id: value, companyId: user.companyId } });
        if (!a) throw new NotFoundException(`Cuenta no encontrada para ${key}`);
        if (!a.active || !a.isPostable) {
          throw new UnprocessableEntityException(`La cuenta ${a.code} está inactiva o no admite movimientos`);
        }
        if (!(SETTINGS_RULES[key] as readonly AccountType[]).includes(a.type)) {
          throw new UnprocessableEntityException(
            `${key} requiere una cuenta ${SETTINGS_RULES[key].join(' o ')}; ${a.code} es ${a.type}`,
          );
        }
      }
      data[key] = value;
    }

    await this.prisma.$transaction(async (tx) => {
      const row = await tx.accountingSettings.upsert({
        where: { companyId: user.companyId },
        update: data,
        create: { companyId: user.companyId, ...data },
      });
      await writeAudit(tx, user, 'AccountingSettings', row.id, AuditAction.UPDATE, JSON.parse(JSON.stringify(data)));
    });
    return this.get(user);
  }

  /** Para facturación/pagos: devuelve las cuentas pedidas o falla indicando cuál falta. */
  async require<K extends SettingsKey>(companyId: string, keys: readonly K[]): Promise<Record<K, string>> {
    const s = await this.prisma.accountingSettings.findUnique({ where: { companyId } });
    const missing = keys.filter((k) => !s?.[k]);
    if (missing.length) {
      throw new UnprocessableEntityException(`Falta configurar en Configuración contable: ${missing.join(', ')}`);
    }
    return Object.fromEntries(keys.map((k) => [k, s![k]!])) as Record<K, string>;
  }
}
