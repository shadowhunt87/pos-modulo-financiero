import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { AuditAction } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../../common/audit.js';
import { CreateNcfSequenceDto, RenewNcfSequenceDto, UpdateNcfSequenceDto } from '../dto/ncf.dto.js';

export const NCF_TYPES: Record<string, string> = {
  B01: 'Crédito fiscal', B02: 'Consumo', B03: 'Nota de débito', B04: 'Nota de crédito',
  B11: 'Proveedores informales', B12: 'Registro único de ingresos', B13: 'Gastos menores',
  B14: 'Regímenes especiales', B15: 'Gubernamental', B16: 'Exportaciones', B17: 'Pagos al exterior',
  E31: 'e-CF Crédito fiscal', E32: 'e-CF Consumo', E33: 'e-CF Nota de débito', E34: 'e-CF Nota de crédito',
  E41: 'e-CF Compras', E43: 'e-CF Gastos menores', E44: 'e-CF Regímenes especiales',
  E45: 'e-CF Gubernamental', E46: 'e-CF Exportaciones', E47: 'e-CF Pagos al exterior',
};

/** B + 2 dígitos + 8 de secuencia (11); E + 2 + 10 (13). */
const seqDigits = (ncfType: string) => (ncfType.startsWith('E') ? 10 : 8);
export const formatNcf = (ncfType: string, n: number) => ncfType + String(n).padStart(seqDigits(ncfType), '0');
/** Valida el formato de un NCF recibido de un proveedor (compras). */
export const isValidNcfFormat = (ncf: string) => /^B(01|02|03|04|11|12|13|14|15|16|17)\d{8}$/.test(ncf) || /^E(31|32|33|34|41|43|44|45|46|47)\d{10}$/.test(ncf);

type NcfRow = {
  id: string; ncfType: string; currentNumber: number; rangeStart: number; rangeEnd: number;
  expirationDate: Date | null; warningThreshold: number; active: boolean;
};

@Injectable()
export class NcfService {
  constructor(private readonly prisma: PrismaService) {}

  catalog() {
    return Object.entries(NCF_TYPES).map(([code, name]) => ({ code, name }));
  }

  private view<T extends NcfRow>(s: T, now = new Date()) {
    const remaining = Math.max(s.rangeEnd - s.currentNumber, 0);
    const expired = !!s.expirationDate && s.expirationDate < now;
    return {
      ...s,
      remaining,
      nextNcf: remaining > 0 ? formatNcf(s.ncfType, s.currentNumber + 1) : null,
      expired,
      exhausted: remaining === 0,
      lowStock: remaining > 0 && remaining <= s.warningThreshold,
    };
  }

  /**
   * Consume el siguiente NCF de forma ATÓMICA. Debe llamarse con el `tx` de la
   * transacción que emite la factura: si esa transacción falla, el contador
   * también se revierte (no quedan saltos) y dos emisiones simultáneas nunca
   * reciben el mismo número (el UPDATE bloquea la fila).
   */
  async consumeNext(tx: Prisma.TransactionClient, companyId: string, ncfType: string, issueDate = new Date()) {
    const rows = await tx.$queryRaw<{ currentNumber: number; rangeEnd: number; expirationDate: Date | null }[]>(Prisma.sql`
      UPDATE "NcfSequence"
      SET "currentNumber" = "currentNumber" + 1
      WHERE "companyId" = ${companyId}
        AND "ncfType" = ${ncfType}
        AND "active" = true
        AND "currentNumber" < "rangeEnd"
        AND ("expirationDate" IS NULL OR "expirationDate" >= ${issueDate})
      RETURNING "currentNumber", "rangeEnd", "expirationDate"`);

    if (rows.length === 0) {
      const seq = await tx.ncfSequence.findUnique({ where: { companyId_ncfType: { companyId, ncfType } } });
      if (!seq) throw new UnprocessableEntityException(`No hay secuencia configurada para ${ncfType}`);
      if (!seq.active) throw new UnprocessableEntityException(`La secuencia ${ncfType} está inactiva`);
      if (seq.expirationDate && seq.expirationDate < issueDate) {
        throw new UnprocessableEntityException(`La secuencia ${ncfType} venció el ${seq.expirationDate.toISOString().slice(0, 10)}`);
      }
      throw new UnprocessableEntityException(`Se agotó el rango autorizado de ${ncfType}; solicita uno nuevo y renueva la secuencia`);
    }
    const { currentNumber, rangeEnd } = rows[0];
    return { ncf: formatNcf(ncfType, currentNumber), number: currentNumber, remaining: rangeEnd - currentNumber };
  }

  async createSequence(dto: CreateNcfSequenceDto, user: AuthUser) {
    if (dto.rangeEnd < dto.rangeStart) throw new UnprocessableEntityException('rangeEnd no puede ser menor que rangeStart');
    const last = dto.lastUsedNumber ?? dto.rangeStart - 1;
    if (last < dto.rangeStart - 1 || last > dto.rangeEnd) {
      throw new UnprocessableEntityException('lastUsedNumber fuera del rango autorizado');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const seq = await tx.ncfSequence.create({
          data: {
            companyId: user.companyId, ncfType: dto.ncfType, prefix: dto.ncfType,
            rangeStart: dto.rangeStart, rangeEnd: dto.rangeEnd, currentNumber: last,
            expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
            warningThreshold: dto.warningThreshold,
          },
        });
        await writeAudit(tx, user, 'NcfSequence', seq.id, AuditAction.CREATE, {
          ncfType: seq.ncfType, rangeStart: seq.rangeStart, rangeEnd: seq.rangeEnd,
        });
        return this.view(seq);
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Ya existe una secuencia ${dto.ncfType}; usa /renew o PATCH`);
      throw e;
    }
  }

  async listSequences(user: AuthUser) {
    const rows = await this.prisma.ncfSequence.findMany({ where: { companyId: user.companyId }, orderBy: { ncfType: 'asc' } });
    return rows.map((r) => this.view(r));
  }

  async getSequence(id: string, user: AuthUser) {
    const seq = await this.prisma.ncfSequence.findFirst({ where: { id, companyId: user.companyId } });
    if (!seq) throw new NotFoundException('Secuencia no encontrada');
    return seq;
  }

  async updateSequence(id: string, dto: UpdateNcfSequenceDto, user: AuthUser) {
    const seq = await this.getSequence(id, user);
    if (dto.rangeEnd !== undefined && dto.rangeEnd < seq.rangeEnd) {
      throw new UnprocessableEntityException('Solo se puede ampliar el rango; no reducirlo');
    }
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ncfSequence.update({
        where: { id, companyId: user.companyId },
        data: {
          rangeEnd: dto.rangeEnd,
          warningThreshold: dto.warningThreshold,
          active: dto.active,
          expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : undefined,
        },
      });
      await writeAudit(tx, user, 'NcfSequence', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)));
      return this.view(updated);
    });
  }

  /** Reemplaza el rango cuando el anterior se agotó o venció. */
  async renewSequence(id: string, dto: RenewNcfSequenceDto, user: AuthUser) {
    const seq = await this.getSequence(id, user);
    const state = this.view(seq);
    if (!state.exhausted && !state.expired) {
      throw new UnprocessableEntityException('Solo se renueva una secuencia agotada o vencida; para ampliarla usa PATCH');
    }
    if (dto.rangeEnd < dto.rangeStart) throw new UnprocessableEntityException('rangeEnd no puede ser menor que rangeStart');
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.ncfSequence.update({
        where: { id, companyId: user.companyId },
        data: {
          rangeStart: dto.rangeStart, rangeEnd: dto.rangeEnd, currentNumber: dto.rangeStart - 1,
          expirationDate: dto.expirationDate ? new Date(dto.expirationDate) : null, active: true,
        },
      });
      await writeAudit(tx, user, 'NcfSequence', id, AuditAction.UPDATE, {
        renewed: true, previousRange: [seq.rangeStart, seq.rangeEnd], newRange: [dto.rangeStart, dto.rangeEnd],
      });
      return this.view(updated);
    });
  }
}