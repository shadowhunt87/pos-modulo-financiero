import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AccountType, AuditAction, PartnerType, UserRole } from '../../generated/prisma/enums.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../../common/audit.js';
import { PartnersService } from '../../masters/partners/partners.service.js';
import {
  CategoryDto, CreateApprovalDto, CreateTerminalDto, ProductSettingDto, PromotionDto, SetPinDto, UpdatePosSettingsDto, UpdateTerminalDto,
  type ApprovalAction,
} from './dto.js';
import { D, SUPERVISORS, isSupervisor, posError, type Tx } from './pos-common.js';

const APPROVAL_MINUTES = 2;
const PIN_MAX_FAILS = 5;
const PIN_LOCK_MINUTES = 5;

/** Configuración del POS: ajustes, terminales, catálogo de la caja, promociones, PIN y autorizaciones. */
@Injectable()
export class PosConfigService {
  constructor(private readonly prisma: PrismaService, private readonly partners: PartnersService) {}

  // ---------------- Ajustes ----------------
  async getSettings(user: AuthUser) {
    const s = await this.prisma.posSettings.findUnique({ where: { companyId: user.companyId } });
    if (!s) return null;
    const partner = await this.prisma.partner.findFirst({ where: { id: s.defaultPartnerId, companyId: user.companyId }, select: { id: true, name: true } });
    return { ...s, defaultPartner: partner };
  }

  /** Para operar: los ajustes o 422 POS_NOT_CONFIGURED. */
  async require(db: Tx | PrismaService, companyId: string) {
    const s = await db.posSettings.findUnique({ where: { companyId } });
    if (!s) throw posError('POS_NOT_CONFIGURED', 'El punto de venta no está configurado: un administrador debe completar «Configuración del POS»');
    return s;
  }

  private async assertPartner(companyId: string, id: string) {
    const p = await this.prisma.partner.findFirst({ where: { id, companyId } });
    if (!p) throw new NotFoundException('Cliente no encontrado');
    if (!p.active || p.type === PartnerType.SUPPLIER) throw new UnprocessableEntityException(`${p.name} no es un cliente activo`);
  }

  private async assertAccount(companyId: string, id: string, types: AccountType[], label: string) {
    const a = await this.prisma.account.findFirst({ where: { id, companyId } });
    if (!a) throw new NotFoundException('Cuenta contable no encontrada');
    if (!a.active || !a.isPostable) throw new UnprocessableEntityException(`La cuenta ${a.code} está inactiva o no admite movimientos`);
    if (!types.includes(a.type)) throw new UnprocessableEntityException(`La cuenta ${a.code} no sirve para «${label}»`);
  }

  async updateSettings(dto: UpdatePosSettingsDto, user: AuthUser) {
    const { companyId } = user;
    const cur = await this.prisma.posSettings.findUnique({ where: { companyId } });
    if (!cur && !dto.defaultPartnerId) throw new UnprocessableEntityException('Elige el cliente para las ventas sin cliente («Consumidor final») o crea uno con «Preparar»');
    if (dto.defaultPartnerId) await this.assertPartner(companyId, dto.defaultPartnerId);
    if (dto.cashOverShortAccountId) await this.assertAccount(companyId, dto.cashOverShortAccountId, [AccountType.EXPENSE, AccountType.INCOME], 'Sobrantes y faltantes de caja');
    const data = { ...dto, maxDiscountPct: dto.maxDiscountPct === undefined ? undefined : D(dto.maxDiscountPct) };
    await this.prisma.$transaction(async (tx) => {
      if (cur) await tx.posSettings.update({ where: { companyId }, data });
      else await tx.posSettings.create({ data: { ...data, companyId, defaultPartnerId: dto.defaultPartnerId! } });
      await writeAudit(tx, user, 'PosSettings', companyId, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue);
    });
    return this.getSettings(user);
  }

  /** «Preparar»: crea el cliente «Consumidor final» (cliente del núcleo) y los ajustes por defecto, si faltan. */
  async bootstrap(user: AuthUser) {
    const { companyId } = user;
    const cur = await this.prisma.posSettings.findUnique({ where: { companyId } });
    if (cur) return this.getSettings(user);
    let partner = await this.prisma.partner.findFirst({ where: { companyId, name: 'Consumidor final', type: { not: PartnerType.SUPPLIER } } });
    if (!partner) partner = await this.partners.create({ type: PartnerType.CUSTOMER, name: 'Consumidor final' }, user);
    return this.updateSettings({ defaultPartnerId: partner.id }, user);
  }

  // ---------------- Terminales ----------------
  private async assertFunds(companyId: string, dto: { cashRegisterId?: string; cardBankAccountId?: string | null; transferBankAccountId?: string | null }) {
    if (dto.cashRegisterId) {
      const c = await this.prisma.cashRegister.findFirst({ where: { id: dto.cashRegisterId, companyId } });
      if (!c) throw new NotFoundException('Caja no encontrada');
      if (!c.active || !c.glAccountId) throw new UnprocessableEntityException(`La caja «${c.name}» está inactiva o no tiene cuenta contable`);
    }
    for (const id of [dto.cardBankAccountId, dto.transferBankAccountId]) {
      if (!id) continue;
      const b = await this.prisma.bankAccount.findFirst({ where: { id, companyId } });
      if (!b) throw new NotFoundException('Cuenta bancaria no encontrada');
      if (!b.active || !b.glAccountId) throw new UnprocessableEntityException(`La cuenta ${b.bankName} ${b.accountNumber} está inactiva o no tiene cuenta contable`);
    }
  }

  listTerminals(user: AuthUser) {
    return this.prisma.posTerminal.findMany({ where: { companyId: user.companyId }, orderBy: { code: 'asc' } });
  }

  async createTerminal(dto: CreateTerminalDto, user: AuthUser) {
    await this.assertFunds(user.companyId, dto);
    try {
      return await this.prisma.$transaction(async (tx) => {
        const t = await tx.posTerminal.create({ data: { ...dto, companyId: user.companyId } });
        await writeAudit(tx, user, 'PosTerminal', t.id, AuditAction.CREATE, { code: t.code, name: t.name });
        return t;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Ya existe la terminal ${dto.code}`);
      throw e;
    }
  }

  async updateTerminal(id: string, dto: UpdateTerminalDto, user: AuthUser) {
    const t = await this.prisma.posTerminal.findFirst({ where: { id, companyId: user.companyId } });
    if (!t) throw new NotFoundException('Terminal no encontrada');
    await this.assertFunds(user.companyId, dto);
    return this.prisma.$transaction(async (tx) => {
      const n = await tx.posTerminal.update({ where: { id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'PosTerminal', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue);
      return n;
    });
  }

  // ---------------- Categorías, productos en caja y códigos de barra ----------------
  listCategories(user: AuthUser) {
    return this.prisma.posCategory.findMany({ where: { companyId: user.companyId }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
  }

  async saveCategory(id: string | null, dto: CategoryDto, user: AuthUser) {
    try {
      return await this.prisma.$transaction(async (tx) => {
        if (id) {
          const cur = await tx.posCategory.findFirst({ where: { id, companyId: user.companyId } });
          if (!cur) throw new NotFoundException('Categoría no encontrada');
          const c = await tx.posCategory.update({ where: { id, companyId: user.companyId }, data: dto });
          await writeAudit(tx, user, 'PosCategory', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue);
          return c;
        }
        const c = await tx.posCategory.create({ data: { ...dto, companyId: user.companyId } });
        await writeAudit(tx, user, 'PosCategory', c.id, AuditAction.CREATE, { name: c.name });
        return c;
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException(`Ya existe la categoría ${dto.name}`);
      throw e;
    }
  }

  /** Cómo se ve cada producto del núcleo en la caja: categoría, orden, si aparece y sus códigos de barra. */
  async saveProductSettings(rows: ProductSettingDto[], user: AuthUser) {
    const { companyId } = user;
    const ids = [...new Set(rows.map((r) => r.productId))];
    const products = await this.prisma.product.count({ where: { companyId, id: { in: ids } } });
    if (products !== ids.length) throw new NotFoundException('Algún producto no existe');
    const cats = [...new Set(rows.map((r) => r.categoryId).filter((x): x is string => !!x))];
    if (cats.length && (await this.prisma.posCategory.count({ where: { companyId, id: { in: cats } } })) !== cats.length) {
      throw new NotFoundException('Alguna categoría no existe');
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const r of rows) {
          const { barcodes, productId, ...data } = r;
          await tx.posProductSetting.upsert({ where: { productId }, update: data, create: { ...data, productId, companyId } });
          if (barcodes) {
            await tx.posBarcode.deleteMany({ where: { companyId, productId } });
            if (barcodes.length) await tx.posBarcode.createMany({ data: [...new Set(barcodes)].map((code) => ({ companyId, productId, code })) });
          }
        }
        await writeAudit(tx, user, 'PosProductSetting', companyId, AuditAction.UPDATE, { products: rows.length });
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Un código de barras ya está asignado a otro producto');
      throw e;
    }
    return { saved: rows.length };
  }

  /** Para la pantalla «Productos en caja»: los productos del núcleo con cómo se ven en la caja. */
  async listProductSettings(user: AuthUser) {
    const { companyId } = user;
    const [products, metas, codes] = await Promise.all([
      this.prisma.product.findMany({ where: { companyId, active: true }, select: { id: true, code: true, name: true, salePrice: true, kind: true }, orderBy: { name: 'asc' } }),
      this.prisma.posProductSetting.findMany({ where: { companyId } }),
      this.prisma.posBarcode.findMany({ where: { companyId } }),
    ]);
    const meta = new Map(metas.map((m) => [m.productId, m]));
    return products.map((p) => ({
      ...p, categoryId: meta.get(p.id)?.categoryId ?? null, showInPos: meta.get(p.id)?.showInPos ?? true, sortOrder: meta.get(p.id)?.sortOrder ?? 0,
      barcodes: codes.filter((c) => c.productId === p.id).map((c) => c.code),
    }));
  }

  // ---------------- Promociones ----------------
  listPromotions(user: AuthUser) {
    return this.prisma.posPromotion.findMany({ where: { companyId: user.companyId }, orderBy: [{ active: 'desc' }, { priority: 'desc' }, { name: 'asc' }] });
  }

  private validatePromotion(dto: PromotionDto) {
    if ((dto.type === 'PERCENT' || dto.type === 'FIXED_PRICE') && dto.value === undefined) throw new UnprocessableEntityException('Falta el valor de la promoción');
    if (dto.type === 'PERCENT' && (dto.value ?? 0) > 100) throw new UnprocessableEntityException('El porcentaje no puede pasar de 100');
    if (dto.type === 'BUY_X_PAY_Y' && (!dto.buyQty || dto.payQty === undefined || dto.payQty >= dto.buyQty)) {
      throw new UnprocessableEntityException('En «lleva X paga Y», Y debe ser menor que X (por ejemplo, lleva 2 paga 1)');
    }
    if (dto.startsAt && dto.endsAt && dto.endsAt < dto.startsAt) throw new UnprocessableEntityException('La promoción termina antes de empezar');
  }

  async savePromotion(id: string | null, dto: PromotionDto, user: AuthUser) {
    this.validatePromotion(dto);
    const data = {
      name: dto.name, type: dto.type, value: dto.value === undefined ? null : D(dto.value), buyQty: dto.buyQty ?? null, payQty: dto.payQty ?? null,
      productIds: dto.productIds ?? [], categoryIds: dto.categoryIds ?? [], startsAt: dto.startsAt ? new Date(dto.startsAt) : null,
      endsAt: dto.endsAt ? new Date(dto.endsAt) : null, weekdays: dto.weekdays ?? [], timeFrom: dto.timeFrom ?? null, timeTo: dto.timeTo ?? null,
      priority: dto.priority ?? 0, active: dto.active ?? true,
    };
    return this.prisma.$transaction(async (tx) => {
      if (id) {
        const cur = await tx.posPromotion.findFirst({ where: { id, companyId: user.companyId } });
        if (!cur) throw new NotFoundException('Promoción no encontrada');
        const p = await tx.posPromotion.update({ where: { id, companyId: user.companyId }, data });
        await writeAudit(tx, user, 'PosPromotion', id, AuditAction.UPDATE, { name: p.name, active: p.active });
        return p;
      }
      const p = await tx.posPromotion.create({ data: { ...data, companyId: user.companyId } });
      await writeAudit(tx, user, 'PosPromotion', p.id, AuditAction.CREATE, { name: p.name, type: p.type });
      return p;
    });
  }

  // ---------------- PIN y autorizaciones ----------------
  async setPin(dto: SetPinDto, user: AuthUser) {
    if (!isSupervisor(user)) throw new UnprocessableEntityException('Solo un supervisor (administrador, contador o aprobador) tiene PIN de POS');
    const pinHash = await bcrypt.hash(dto.pin, 10);
    await this.prisma.$transaction(async (tx) => {
      await tx.posUserPin.upsert({
        where: { userId: user.id }, update: { pinHash, failedCount: 0, lockedUntil: null },
        create: { userId: user.id, companyId: user.companyId, pinHash },
      });
      await writeAudit(tx, user, 'PosUserPin', user.id, AuditAction.UPDATE, { pinChanged: true });
    });
    return { ok: true };
  }

  /** Un supervisor autoriza con su PIN una acción del cajero: sirve una vez y por 2 minutos. */
  async createApproval(dto: CreateApprovalDto, user: AuthUser) {
    const { companyId } = user;
    const sup = await this.prisma.user.findFirst({
      where: { companyId, email: dto.supervisorEmail.trim().toLowerCase(), active: true, role: { in: SUPERVISORS as UserRole[] } },
      select: { id: true, name: true },
    });
    const pin = sup ? await this.prisma.posUserPin.findUnique({ where: { userId: sup.id } }) : null;
    // Mismo mensaje si no existe o no tiene PIN: no se revela quién es supervisor
    if (!sup || !pin) throw posError('APPROVAL_INVALID', 'Supervisor o PIN incorrecto');
    if (pin.lockedUntil && pin.lockedUntil > new Date()) {
      throw posError('PIN_LOCKED', `El PIN de este supervisor está bloqueado hasta las ${pin.lockedUntil.toLocaleTimeString('es-DO', { timeZone: 'America/Santo_Domingo', hour: '2-digit', minute: '2-digit' })}`);
    }
    if (!(await bcrypt.compare(dto.pin, pin.pinHash))) {
      const fails = pin.failedCount + 1;
      await this.prisma.posUserPin.update({
        where: { userId: sup.id, companyId },
        data: { failedCount: fails >= PIN_MAX_FAILS ? 0 : fails, lockedUntil: fails >= PIN_MAX_FAILS ? new Date(Date.now() + PIN_LOCK_MINUTES * 60_000) : null },
      });
      throw posError('APPROVAL_INVALID', 'Supervisor o PIN incorrecto');
    }
    return this.prisma.$transaction(async (tx) => {
      await tx.posUserPin.update({ where: { userId: sup.id, companyId }, data: { failedCount: 0, lockedUntil: null } });
      const a = await tx.posApproval.create({
        data: { companyId, action: dto.action, approvedById: sup.id, requestedById: user.id, expiresAt: new Date(Date.now() + APPROVAL_MINUTES * 60_000) },
      });
      await writeAudit(tx, user, 'PosApproval', a.id, AuditAction.CREATE, { action: dto.action, approvedBy: sup.id });
      return { approvalId: a.id, approvedBy: sup.name, expiresAt: a.expiresAt };
    });
  }

  /**
   * Dentro de la transacción de la acción: un supervisor no necesita autorización; un cajero, una autorización vigente,
   * sin usar y de esa acción. Devuelve quién autorizó.
   */
  async consumeApproval(tx: Tx, user: AuthUser, action: ApprovalAction, approvalId: string | undefined): Promise<string> {
    if (isSupervisor(user)) return user.id;
    if (!approvalId) throw posError('APPROVAL_REQUIRED', 'Esta acción necesita la autorización de un supervisor', { action });
    const res = await tx.posApproval.updateMany({
      where: { id: approvalId, companyId: user.companyId, action, used: false, expiresAt: { gt: new Date() }, requestedById: user.id },
      data: { used: true },
    });
    if (res.count !== 1) throw posError('APPROVAL_INVALID', 'La autorización no vale (ya se usó, venció o es de otra acción): pídela de nuevo', { action });
    const a = await tx.posApproval.findFirstOrThrow({ where: { id: approvalId, companyId: user.companyId } });
    return a.approvedById;
  }
}
