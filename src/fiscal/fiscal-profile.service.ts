import { Injectable } from '@nestjs/common';
import { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { UpdateFiscalProfileDto } from './dto/fiscal.dto.js';

/** Meses de cierre que admite la DGII (Guía 3.8): mar, jun, sep, dic. */
const ALLOWED_CLOSING_MONTHS = [3, 6, 9, 12];
const REQUIRED = ['dgiiClassification', 'taxRegime', 'legalForm', 'accountingFramework'] as const;

/** Ficha fiscal de la empresa (PLAN-v0.3 §6). Lee cualquiera de la empresa; guarda solo ADMIN (controller). */
@Injectable()
export class FiscalProfileService {
  constructor(private readonly prisma: PrismaService) {}

  async get(user: AuthUser) {
    const [profile, company] = await Promise.all([
      this.prisma.companyFiscalProfile.findUnique({ where: { companyId: user.companyId } }),
      this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { fiscalYearStartMonth: true } }),
    ]);
    // El cierre se deriva del inicio del año fiscal (no se guarda dos veces)
    const closingMonth = ((company.fiscalYearStartMonth + 10) % 12) + 1;
    const missing = REQUIRED.filter((f) => !profile?.[f]);
    return {
      dgiiClassification: profile?.dgiiClassification ?? null, taxRegime: profile?.taxRegime ?? null,
      legalForm: profile?.legalForm ?? null, accountingFramework: profile?.accountingFramework ?? null,
      frameworkAdoptionDate: profile?.frameworkAdoptionDate ?? null, ecfEmitterSince: profile?.ecfEmitterSince ?? null,
      isWithholdingAgent: profile?.isWithholdingAgent ?? false, updatedAt: profile?.updatedAt ?? null,
      closingMonth, closingMonthAllowed: ALLOWED_CLOSING_MONTHS.includes(closingMonth),
      complete: missing.length === 0, missing,
    };
  }

  async update(dto: UpdateFiscalProfileDto, user: AuthUser) {
    const data = {
      ...dto,
      frameworkAdoptionDate: dto.frameworkAdoptionDate === undefined ? undefined : dto.frameworkAdoptionDate ? new Date(dto.frameworkAdoptionDate) : null,
      ecfEmitterSince: dto.ecfEmitterSince === undefined ? undefined : dto.ecfEmitterSince ? new Date(dto.ecfEmitterSince) : null,
      updatedById: user.id,
    };
    await this.prisma.$transaction(async (tx) => {
      const p = await tx.companyFiscalProfile.upsert({
        where: { companyId: user.companyId }, create: { ...data, companyId: user.companyId }, update: data,
      });
      await writeAudit(tx, user, 'CompanyFiscalProfile', p.id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)));
    });
    return this.get(user);
  }
}
