import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction, TaxIdType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { writeAudit } from '../../common/audit.js';
import { CreatePartnerDto, ListPartnersQuery, UpdatePartnerDto } from '../dto/partner.dto.js';

/** Valida taxId contra su tipo; si no viene el tipo lo infiere (9 = RNC, 11 = cédula). */
export function resolveTaxId(taxId?: string | null, taxIdType?: TaxIdType | null) {
  if (!taxId) return { taxId: null, taxIdType: taxIdType ?? null };
  let type = taxIdType ?? null;
  if (!type) {
    if (/^\d{9}$/.test(taxId)) type = TaxIdType.RNC;
    else if (/^\d{11}$/.test(taxId)) type = TaxIdType.CEDULA;
    else throw new UnprocessableEntityException('Indica taxIdType: no se pudo inferir por la longitud');
  }
  const ok =
    (type === TaxIdType.RNC && /^\d{9}$/.test(taxId)) ||
    (type === TaxIdType.CEDULA && /^\d{11}$/.test(taxId)) ||
    ((type === TaxIdType.PASSPORT || type === TaxIdType.FOREIGN_ID) && /^[A-Za-z0-9]{3,20}$/.test(taxId));
  if (!ok) {
    throw new UnprocessableEntityException(
      type === TaxIdType.RNC ? 'El RNC debe tener 9 dígitos'
        : type === TaxIdType.CEDULA ? 'La cédula debe tener 11 dígitos'
        : 'Documento de identidad inválido',
    );
  }
  return { taxId, taxIdType: type };
}

@Injectable()
export class PartnersService {
  constructor(private readonly prisma: PrismaService) {}

  private async assertTaxIdFree(companyId: string, taxId: string | null, exceptId?: string) {
    if (!taxId) return;
    const dup = await this.prisma.partner.findFirst({
      where: { companyId, taxId, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { id: true, name: true },
    });
    if (dup) throw new ConflictException(`Ya existe un tercero con ese RNC/cédula: ${dup.name}`);
  }

  async create(dto: CreatePartnerDto, user: AuthUser) {
    const { taxId, taxIdType } = resolveTaxId(dto.taxId, dto.taxIdType);
    await this.assertTaxIdFree(user.companyId, taxId);
    return this.prisma.$transaction(async (tx) => {
      const partner = await tx.partner.create({
        data: { ...dto, taxId, taxIdType, companyId: user.companyId },
      });
      await writeAudit(tx, user, 'Partner', partner.id, AuditAction.CREATE, { name: partner.name, type: partner.type });
      return partner;
    });
  }

  async list(q: ListPartnersQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.PartnerWhereInput = {
      companyId: user.companyId,
      active: q.active,
      // Un tercero BOTH aparece tanto en clientes como en proveedores
      ...(q.type && q.type !== 'BOTH' ? { type: { in: [q.type, 'BOTH'] } } : q.type ? { type: q.type } : {}),
      ...(q.q
        ? {
            OR: [
              { name: { contains: q.q, mode: 'insensitive' } },
              { tradeName: { contains: q.q, mode: 'insensitive' } },
              { taxId: { contains: q.q.replace(/[\s-]/g, '') } },
            ],
          }
        : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.partner.findMany({ where, orderBy: { name: 'asc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.partner.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string, user: AuthUser) {
    const partner = await this.prisma.partner.findFirst({ where: { id, companyId: user.companyId } });
    if (!partner) throw new NotFoundException('Tercero no encontrado');
    return partner;
  }

  async update(id: string, dto: UpdatePartnerDto, user: AuthUser) {
    const current = await this.get(id, user);
    const data: Prisma.PartnerUpdateInput = { ...dto };

    if (dto.taxId !== undefined || dto.taxIdType !== undefined) {
      const { taxId, taxIdType } = resolveTaxId(dto.taxId ?? current.taxId, dto.taxIdType ?? current.taxIdType);
      await this.assertTaxIdFree(user.companyId, taxId, id);
      data.taxId = taxId;
      data.taxIdType = taxIdType;
    }

    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.partner.update({ where: { id }, data });
      await writeAudit(tx, user, 'Partner', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)));
      return updated;
    });
  }
}
