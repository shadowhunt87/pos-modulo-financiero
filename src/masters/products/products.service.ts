import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AccountType, AuditAction } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../../common/audit.js';
import { CreateProductDto, ListProductsQuery, UpdateProductDto } from '../dto/product.dto.js';

type Tx = Prisma.TransactionClient;
const { ASSET, INCOME, EXPENSE } = AccountType;

/** Tipos de cuenta permitidos para cada cuenta del producto (como SETTINGS_RULES). */
const ACCOUNT_RULES = {
  incomeAccountId: { types: [INCOME], label: 'de ingreso' },
  expenseAccountId: { types: [EXPENSE, ASSET], label: 'de gasto o costo' },
  inventoryAccountId: { types: [ASSET], label: 'de activo (inventario)' },
  cogsAccountId: { types: [EXPENSE], label: 'de costo de ventas' },
} as const;
type AccountField = keyof typeof ACCOUNT_RULES;

const INCLUDE = {
  saleTaxRate: { select: { id: true, name: true, rate: true } },
  purchaseTaxRate: { select: { id: true, name: true, rate: true } },
  incomeAccount: { select: { id: true, code: true, name: true } },
  expenseAccount: { select: { id: true, code: true, name: true } },
  inventoryAccount: { select: { id: true, code: true, name: true } },
  cogsAccount: { select: { id: true, code: true, name: true } },
} satisfies Prisma.ProductInclude;

/** Catálogo de productos y servicios (P1). La factura copia descripción, precio e impuesto; aquí solo hay valores de referencia. */
@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cuentas de esta empresa, utilizables y del tipo que corresponde. */
  private async assertAccounts(tx: Tx, companyId: string, dto: Partial<Record<AccountField, string | null>>) {
    for (const field of Object.keys(ACCOUNT_RULES) as AccountField[]) {
      const id = dto[field];
      if (!id) continue;
      const a = await tx.account.findFirst({ where: { id, companyId } });
      if (!a) throw new NotFoundException('Cuenta contable no encontrada');
      if (!a.active || !a.isPostable) throw new UnprocessableEntityException(`La cuenta ${a.code} está inactiva o no admite movimientos`);
      const rule = ACCOUNT_RULES[field];
      if (!(rule.types as readonly AccountType[]).includes(a.type)) {
        throw new UnprocessableEntityException(`La cuenta ${a.code} no es una cuenta ${rule.label}`);
      }
    }
  }

  /** Impuesto de venta o de compra: de esta empresa, activo, que aplique a ese lado y que no sea una retención. */
  private async assertTax(tx: Tx, companyId: string, id: string | null | undefined, side: 'SALES' | 'PURCHASES') {
    if (!id) return;
    const t = await tx.taxRate.findFirst({ where: { id, companyId } });
    if (!t) throw new NotFoundException('Impuesto no encontrado');
    if (!t.active) throw new UnprocessableEntityException(`El impuesto "${t.name}" está inactivo`);
    if (t.isWithholding) throw new UnprocessableEntityException(`"${t.name}" es una retención: no va en el producto`);
    if (t.appliesTo !== 'BOTH' && t.appliesTo !== side) {
      throw new UnprocessableEntityException(`El impuesto "${t.name}" no aplica a ${side === 'SALES' ? 'ventas' : 'compras'}`);
    }
  }

  private async validate(tx: Tx, companyId: string, dto: CreateProductDto | UpdateProductDto) {
    await this.assertAccounts(tx, companyId, dto);
    await this.assertTax(tx, companyId, dto.saleTaxRateId, 'SALES');
    await this.assertTax(tx, companyId, dto.purchaseTaxRateId, 'PURCHASES');
  }

  private duplicated(e: unknown, code: string | undefined): never {
    if (isUniqueViolation(e)) throw new ConflictException(`Ya existe un producto con el código ${code}`);
    throw e;
  }

  async create(dto: CreateProductDto, user: AuthUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validate(tx, user.companyId, dto);
        await this.assertInventoryRules(tx, user.companyId, null, dto);
        const p = await tx.product.create({ data: { ...dto, companyId: user.companyId }, include: INCLUDE });
        await writeAudit(tx, user, 'Product', p.id, AuditAction.CREATE, { code: p.code, name: p.name, kind: p.kind });
        return p;
      });
    } catch (e) {
      this.duplicated(e, dto.code);
    }
  }

  /**
   * P2: solo un bien controla inventario. Con existencia o kárdex no se apaga el control ni pasa a servicio:
   * los saldos de inventario y el mayor quedarían sin explicación.
   */
  private async assertInventoryRules(tx: Tx, companyId: string, cur: { id: string; kind: string; tracksInventory: boolean } | null, dto: CreateProductDto | UpdateProductDto) {
    const kind = dto.kind ?? cur?.kind ?? 'SERVICE';
    const tracks = dto.tracksInventory ?? cur?.tracksInventory ?? false;
    if (tracks && kind !== 'GOODS') throw new UnprocessableEntityException('Solo un bien (no un servicio) puede controlar inventario');
    if (cur?.tracksInventory && (!tracks || kind !== 'GOODS')) {
      const moves = await tx.inventoryMovement.count({ where: { companyId, productId: cur.id } });
      if (moves) throw new UnprocessableEntityException('Este producto ya tiene movimientos de inventario: no se puede quitar el control de inventario ni pasarlo a servicio');
    }
  }

  async list(q: ListProductsQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.ProductWhereInput = {
      companyId: user.companyId,
      active: q.active,
      kind: q.kind,
      tracksInventory: q.tracksInventory,
      ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, include: INCLUDE, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (page - 1) * limit, take: limit }),
      this.prisma.product.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string, user: AuthUser) {
    const p = await this.prisma.product.findFirst({ where: { id, companyId: user.companyId }, include: INCLUDE });
    if (!p) throw new NotFoundException('Producto no encontrado');
    return p;
  }

  async update(id: string, dto: UpdateProductDto, user: AuthUser) {
    const cur = await this.get(id, user);
    try {
      return await this.prisma.$transaction(async (tx) => {
        await this.validate(tx, user.companyId, dto);
        await this.assertInventoryRules(tx, user.companyId, cur, dto);
        const p = await tx.product.update({ where: { id, companyId: user.companyId }, data: dto, include: INCLUDE });
        await writeAudit(tx, user, 'Product', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue);
        return p;
      });
    } catch (e) {
      this.duplicated(e, dto.code);
    }
  }
}
