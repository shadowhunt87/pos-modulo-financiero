import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UpdateCompanyDto } from './dto/company.dto.js';

const SELECT = {
  id: true, name: true, legalName: true, taxId: true, baseCurrency: true, country: true,
  fiscalYearStartMonth: true, address: true, phone: true, email: true, logoUrl: true, createdAt: true, updatedAt: true,
} as const;

@Injectable()
export class CompanyService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser) {
    const c = await this.prisma.company.findUnique({ where: { id: user.companyId }, select: SELECT });
    if (!c) throw new NotFoundException('Empresa no encontrada');
    return c;
  }

  async update(dto: UpdateCompanyDto, user: AuthUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const cur = await tx.company.findUnique({ where: { id: user.companyId } });
        if (!cur) throw new NotFoundException('Empresa no encontrada');

        if (dto.baseCurrency !== undefined && dto.baseCurrency !== cur.baseCurrency) {
          const entries = await tx.journalEntry.count({ where: { companyId: user.companyId } });
          if (entries > 0) {
            throw new UnprocessableEntityException('No se puede cambiar la moneda base: ya hay asientos registrados');
          }
        }
        if (dto.fiscalYearStartMonth !== undefined && dto.fiscalYearStartMonth !== cur.fiscalYearStartMonth) {
          const years = await tx.fiscalYear.count({ where: { companyId: user.companyId } });
          if (years > 0) {
            throw new UnprocessableEntityException('No se puede cambiar el mes de inicio fiscal: ya hay años fiscales creados');
          }
        }

        const updated = await tx.company.update({ where: { id: user.companyId }, data: { ...dto, name: dto.name }, select: SELECT });
        const changes: Record<string, { from: unknown; to: unknown }> = {};
        for (const k of Object.keys(dto) as (keyof UpdateCompanyDto)[]) {
          if (cur[k] !== updated[k as keyof typeof updated]) changes[k] = { from: cur[k], to: updated[k as keyof typeof updated] };
        }
        await writeAudit(tx, user, 'Company', user.companyId, AuditAction.UPDATE, JSON.parse(JSON.stringify(changes)));
        return updated;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya existe una empresa con ese RNC');
      throw e;
    }
  }
}
