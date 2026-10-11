import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction, TaxType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit } from '../../common/audit.js';
import { CreateTaxRateDto, ListTaxRatesQuery, UpdateTaxRateDto } from '../dto/tax-rate.dto.js';

const WITHHOLDING_TYPES: TaxType[] = [TaxType.ISR_WITHHOLDING, TaxType.ITBIS_WITHHOLDING];

@Injectable()
export class TaxRatesService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertAccounts(companyId: string, ids: (string | undefined)[]) {
    for (const id of ids.filter((x): x is string => !!x)) {
      const a = await this.prisma.account.findFirst({ where: { id, companyId } });
      if (!a) throw new NotFoundException('Cuenta contable no encontrada');
      if (!a.active || !a.isPostable) {
        throw new UnprocessableEntityException(`La cuenta ${a.code} está inactiva o no admite movimientos`);
      }
    }
  }

  async create(dto: CreateTaxRateDto, user: AuthUser) {
    await this.assertAccounts(user.companyId, [dto.salesAccountId, dto.purchaseAccountId]);
    return this.prisma.$transaction(async (tx) => {
      const tax = await tx.taxRate.create({
        data: { ...dto, companyId: user.companyId, isWithholding: WITHHOLDING_TYPES.includes(dto.type) },
      });
      await writeAudit(tx, user, 'TaxRate', tax.id, AuditAction.CREATE, { name: tax.name, rate: tax.rate.toString() });
      return tax;
    });
  }

  list(q: ListTaxRatesQuery, user: AuthUser) {
    const where: Prisma.TaxRateWhereInput = {
      companyId: user.companyId,
      active: q.active,
      type: q.type,
      // appliesTo=SALES devuelve también los BOTH
      ...(q.appliesTo ? { appliesTo: { in: [q.appliesTo, 'BOTH'] } } : {}),
    };
    return this.prisma.taxRate.findMany({ where, orderBy: [{ type: 'asc' }, { name: 'asc' }] });
  }

  async get(id: string, user: AuthUser) {
    const tax = await this.prisma.taxRate.findFirst({ where: { id, companyId: user.companyId } });
    if (!tax) throw new NotFoundException('Impuesto no encontrado');
    return tax;
  }

  async update(id: string, dto: UpdateTaxRateDto, user: AuthUser) {
    await this.get(id, user);
    await this.assertAccounts(user.companyId, [dto.salesAccountId, dto.purchaseAccountId]);
    return this.prisma.$transaction(async (tx) => {
      const tax = await tx.taxRate.update({ where: { id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'TaxRate', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)));
      return tax;
    });
  }
}