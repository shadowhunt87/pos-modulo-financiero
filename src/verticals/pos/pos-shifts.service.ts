import { ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { AuditAction, JournalType, PosCashMovementType, PosPayMethod, PosSaleStatus, PosShiftStatus, SourceDocumentType } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../../common/audit.js';
import { AccountingSettingsService } from '../../masters/accounting-settings/accounting-settings.service.js';
import { DocumentSequencesService } from '../../masters/sequences/document-sequences.service.js';
import { PostingService } from '../../posting/posting.service.js';
import { CashMovementDto, CloseShiftDto, DrawerOpenDto, ListShiftsQuery, OpenShiftDto } from './dto.js';
import { PosConfigService } from './pos-config.service.js';
import { D, SOURCE, ZERO, drToday, isSupervisor, posError, r2, type Dec, type Tx } from './pos-common.js';

const methods = [PosPayMethod.CASH, PosPayMethod.CARD, PosPayMethod.TRANSFER] as const;

/** Turnos de caja (fase 2 de docs/PLAN-POS.md): apertura, efectivo, reporte X y cierre con conteo (reporte Z). */
@Injectable()
export class PosShiftsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PosConfigService,
    private readonly sequences: DocumentSequencesService,
    private readonly posting: PostingService,
    private readonly settings: AccountingSettingsService,
  ) {}

  private async terminal(db: Tx | PrismaService, companyId: string, id: string) {
    const t = await db.posTerminal.findFirst({ where: { id, companyId } });
    if (!t) throw new NotFoundException('Terminal no encontrada');
    if (!t.active) throw new UnprocessableEntityException(`La terminal ${t.name} está desactivada`);
    return t;
  }

  /** Cuenta contable de la caja (efectivo) de la terminal. */
  async cashAccount(db: Tx | PrismaService, companyId: string, cashRegisterId: string) {
    const c = await db.cashRegister.findFirst({ where: { id: cashRegisterId, companyId } });
    if (!c?.glAccountId) throw new UnprocessableEntityException('La caja de la terminal no tiene cuenta contable');
    return c.glAccountId;
  }

  async open(dto: OpenShiftDto, user: AuthUser) {
    const { companyId } = user;
    await this.config.require(this.prisma, companyId);
    try {
      const id = await this.prisma.$transaction(async (tx) => {
        const t = await this.terminal(tx, companyId, dto.terminalId);
        const number = await this.sequences.nextFor(tx, companyId, SOURCE.SHIFT, 'TU');
        const s = await tx.posShift.create({ data: { companyId, terminalId: t.id, number, openedById: user.id, openingCash: r2(D(dto.openingCash)) } });
        await writeAudit(tx, user, 'PosShift', s.id, AuditAction.CREATE, { number, terminal: t.code, openingCash: dto.openingCash });
        return s.id;
      });
      return this.get(id, user);
    } catch (e) {
      if (isUniqueViolation(e)) throw posError('SHIFT_ALREADY_OPEN', 'Esta terminal ya tiene un turno abierto: ciérralo antes de abrir otro');
      throw e;
    }
  }

  /** Turno abierto de la terminal (o null). */
  async current(terminalId: string, user: AuthUser) {
    const s = await this.prisma.posShift.findFirst({ where: { companyId: user.companyId, terminalId, status: PosShiftStatus.OPEN } });
    return s ? this.get(s.id, user) : null;
  }

  /** Turno abierto que el usuario puede operar (el suyo; un supervisor, cualquiera). */
  async requireOpen(tx: Tx, user: AuthUser, shiftId: string) {
    const s = await tx.posShift.findFirst({ where: { id: shiftId, companyId: user.companyId }, include: { terminal: true } });
    if (!s) throw new NotFoundException('Turno no encontrado');
    if (s.status !== PosShiftStatus.OPEN) throw posError('SHIFT_CLOSED', 'El turno está cerrado: abre uno nuevo');
    if (s.openedById !== user.id && !isSupervisor(user)) throw posError('SHIFT_NOT_YOURS', 'Este turno lo abrió otro cajero');
    if (!s.terminal.active) throw new UnprocessableEntityException(`La terminal ${s.terminal.name} está desactivada`);
    return s;
  }

  /** Cuentas que una entrada o salida de efectivo NO puede usar: se mueven solo con facturas y cobros (contrato §4.1.3). */
  private async assertMovementAccount(tx: Tx, companyId: string, accountId: string, cashAccountId: string) {
    const a = await tx.account.findFirst({ where: { id: accountId, companyId } });
    if (!a) throw new NotFoundException('Cuenta contable no encontrada');
    if (!a.active || !a.isPostable) throw new UnprocessableEntityException(`La cuenta ${a.code} está inactiva o no admite movimientos`);
    if (a.id === cashAccountId) throw new UnprocessableEntityException('La contrapartida no puede ser la misma caja');
    const s = await tx.accountingSettings.findUnique({ where: { companyId } });
    const blocked = [s?.receivableAccountId, s?.payableAccountId, s?.customerAdvanceAccountId, s?.supplierAdvanceAccountId].filter(Boolean);
    const taxes = await tx.taxRate.count({ where: { companyId, OR: [{ salesAccountId: accountId }, { purchaseAccountId: accountId }] } });
    if (blocked.includes(accountId) || taxes > 0 || a.subledger === 'RECEIVABLE' || a.subledger === 'PAYABLE') {
      throw new UnprocessableEntityException(`La cuenta ${a.code} solo se mueve con facturas, cobros o pagos: elige otra contrapartida`);
    }
  }

  /** Cuentas que la caja puede usar de contrapartida en entradas y salidas (el cajero no ve el plan de cuentas). */
  async movementAccounts(terminalId: string, user: AuthUser) {
    const { companyId } = user;
    const t = await this.terminal(this.prisma, companyId, terminalId);
    const cash = await this.cashAccount(this.prisma, companyId, t.cashRegisterId);
    const s = await this.prisma.accountingSettings.findUnique({ where: { companyId } });
    const taxAccounts = await this.prisma.taxRate.findMany({ where: { companyId }, select: { salesAccountId: true, purchaseAccountId: true } });
    const blocked = new Set([cash, s?.receivableAccountId, s?.payableAccountId, s?.customerAdvanceAccountId, s?.supplierAdvanceAccountId,
      ...taxAccounts.flatMap((x) => [x.salesAccountId, x.purchaseAccountId])].filter((x): x is string => !!x));
    const accounts = await this.prisma.account.findMany({
      where: { companyId, active: true, isPostable: true, OR: [{ subledger: null }, { subledger: { notIn: ['RECEIVABLE', 'PAYABLE'] } }] },
      select: { id: true, code: true, name: true, type: true }, orderBy: { code: 'asc' },
    });
    return accounts.filter((a) => !blocked.has(a.id));
  }

  /** Entrada o salida de efectivo con su asiento (VERTICAL pos.movimiento). Una salida de un cajero pide PIN. */
  async cashMovement(shiftId: string, dto: CashMovementDto, user: AuthUser) {
    const { companyId } = user;
    await this.prisma.$transaction(async (tx) => {
      const s = await this.requireOpen(tx, user, shiftId);
      const approvedById = dto.type === PosCashMovementType.OUT ? await this.config.consumeApproval(tx, user, 'CASH_OUT', dto.approvalId) : null;
      const cash = await this.cashAccount(tx, companyId, s.terminal.cashRegisterId);
      await this.assertMovementAccount(tx, companyId, dto.accountId, cash);
      if (dto.type === PosCashMovementType.OUT) {
        const totals = await this.totals(tx, companyId, s.id);
        if (D(dto.amount).gt(totals.expectedCash)) throw new UnprocessableEntityException(`En la gaveta debería haber ${totals.expectedCash.toFixed(2)}: no alcanza para esa salida`);
      }
      const m = await tx.posCashMovement.create({
        data: { companyId, shiftId: s.id, type: dto.type, amount: r2(D(dto.amount)), reason: dto.reason, accountId: dto.accountId, createdById: user.id, approvedById },
      });
      const amount = r2(D(dto.amount));
      const into = dto.type === PosCashMovementType.IN;
      const je = await this.posting.post(tx, user, {
        date: drToday(), description: `${into ? 'Entrada' : 'Salida'} de efectivo, turno ${s.number}: ${dto.reason}`, reference: s.number,
        journalType: JournalType.CASH, sourceType: SourceDocumentType.VERTICAL, sourceModule: SOURCE.MOVEMENT, sourceId: m.id,
        lines: [
          { accountId: cash, debit: into ? amount : ZERO, credit: into ? ZERO : amount, description: 'Gaveta' },
          { accountId: dto.accountId, debit: into ? ZERO : amount, credit: into ? amount : ZERO, description: dto.reason },
        ],
      });
      await tx.posCashMovement.update({ where: { id: m.id, companyId }, data: { journalEntryId: je.id } });
      await writeAudit(tx, user, 'PosCashMovement', m.id, AuditAction.CREATE, { type: dto.type, amount: amount.toString(), shift: s.number, approvedById });
    });
    return this.get(shiftId, user);
  }

  /** Abrir la gaveta sin venta: queda registrado (y un cajero necesita PIN). */
  async drawerOpen(shiftId: string, dto: DrawerOpenDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const s = await this.requireOpen(tx, user, shiftId);
      const approvedById = await this.config.consumeApproval(tx, user, 'DRAWER', dto.approvalId);
      const ev = await tx.posDrawerEvent.create({ data: { companyId: user.companyId, shiftId: s.id, reason: dto.reason, createdById: user.id, approvedById } });
      await writeAudit(tx, user, 'PosDrawerEvent', ev.id, AuditAction.CREATE, { shift: s.number, reason: dto.reason });
    });
    return { ok: true };
  }

  /**
   * Totales del turno (reporte X; al cerrar, Z): ventas y devoluciones por forma de pago, entradas y salidas, y el
   * efectivo que debería haber en la gaveta.
   */
  async totals(db: Tx | PrismaService, companyId: string, shiftId: string) {
    const s = await db.posShift.findFirstOrThrow({ where: { id: shiftId, companyId } });
    const sales = await db.posSale.findMany({ where: { companyId, shiftId }, include: { payments: true } });
    const returns = await db.posReturn.findMany({ where: { companyId, shiftId } });
    const movs = await db.posCashMovement.findMany({ where: { companyId, shiftId } });
    const drawer = await db.posDrawerEvent.count({ where: { companyId, shiftId } });
    const done = sales.filter((x) => x.status === PosSaleStatus.COMPLETED);
    const by = (m: PosPayMethod) => done.flatMap((x) => x.payments).filter((p) => p.method === m).reduce((a, p) => a.plus(p.amount), ZERO);
    const refunds = (m: PosPayMethod) => returns.filter((r) => r.method === m).reduce((a, r) => a.plus(r.total), ZERO);
    const sum = (rows: { total: Dec }[]) => rows.reduce((a, r) => a.plus(r.total), ZERO);
    const cashIn = movs.filter((m) => m.type === PosCashMovementType.IN).reduce((a, m) => a.plus(m.amount), ZERO);
    const cashOut = movs.filter((m) => m.type === PosCashMovementType.OUT).reduce((a, m) => a.plus(m.amount), ZERO);
    const salesByMethod = Object.fromEntries(methods.map((m) => [m, by(m)])) as Record<PosPayMethod, Dec>;
    const refundsByMethod = Object.fromEntries(methods.map((m) => [m, refunds(m)])) as Record<PosPayMethod, Dec>;
    const credit = sum(done).minus(done.reduce((a, x) => a.plus(x.paidTotal), ZERO));
    return {
      salesCount: done.length, voidedCount: sales.length - done.length, returnsCount: returns.length,
      grossSales: sum(done), discounts: done.reduce((a, x) => a.plus(x.discountTotal).plus(x.promoTotal), ZERO),
      taxes: done.reduce((a, x) => a.plus(x.taxTotal), ZERO), creditSales: credit,
      salesByMethod, refundsByMethod, cashIn, cashOut, drawerOpens: drawer,
      openingCash: s.openingCash,
      expectedCash: s.openingCash.plus(salesByMethod.CASH).minus(refundsByMethod.CASH).plus(cashIn).minus(cashOut),
    };
  }

  /** Cierre ciego: el cajero cuenta; la diferencia con lo esperado va a «Sobrantes y faltantes de caja». */
  async close(shiftId: string, dto: CloseShiftDto, user: AuthUser) {
    const { companyId } = user;
    await this.prisma.$transaction(async (tx) => {
      const s = await this.requireOpen(tx, user, shiftId);
      const settings = await this.config.require(tx, companyId);
      const parked = await tx.posParkedSale.count({ where: { companyId, terminalId: s.terminalId } });
      if (parked) throw posError('PARKED_PENDING', `Hay ${parked} venta(s) suspendida(s) en esta terminal: recupéralas o descártalas antes de cerrar`);
      const t = await this.totals(tx, companyId, s.id);
      const counted = r2(D(dto.countedCash));
      const diff = counted.minus(t.expectedCash);
      const claimed = await tx.posShift.updateMany({
        where: { id: s.id, companyId, status: PosShiftStatus.OPEN },
        data: {
          status: PosShiftStatus.CLOSED, closedById: user.id, closedAt: new Date(), expectedCash: t.expectedCash, countedCash: counted,
          difference: diff, countDetail: (dto.countDetail ?? undefined) as Prisma.InputJsonValue | undefined, closeNotes: dto.notes ?? null,
        },
      });
      if (claimed.count === 0) throw new ConflictException('El turno ya se cerró');
      if (!diff.isZero()) {
        if (!settings.cashOverShortAccountId) throw new UnprocessableEntityException('Hay diferencia en la caja y falta la cuenta de «Sobrantes y faltantes de caja» en Configuración del POS');
        const cash = await this.cashAccount(tx, companyId, s.terminal.cashRegisterId);
        const amount = diff.abs();
        const over = diff.gt(0);
        const je = await this.posting.post(tx, user, {
          date: drToday(), description: `${over ? 'Sobrante' : 'Faltante'} de caja, turno ${s.number}`, reference: s.number,
          journalType: JournalType.CASH, sourceType: SourceDocumentType.VERTICAL, sourceModule: SOURCE.SHIFT, sourceId: s.id,
          lines: [
            { accountId: cash, debit: over ? amount : ZERO, credit: over ? ZERO : amount, description: 'Gaveta' },
            { accountId: settings.cashOverShortAccountId, debit: over ? ZERO : amount, credit: over ? amount : ZERO, description: over ? 'Sobrante' : 'Faltante' },
          ],
        });
        await tx.posShift.update({ where: { id: s.id, companyId }, data: { journalEntryId: je.id } });
      }
      await writeAudit(tx, user, 'PosShift', s.id, AuditAction.UPDATE, {
        closed: true, expected: t.expectedCash.toString(), counted: counted.toString(), difference: diff.toString(),
      });
    });
    return this.get(shiftId, user);
  }

  async get(id: string, user: AuthUser) {
    const s = await this.prisma.posShift.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        terminal: { select: { id: true, code: true, name: true } },
        movements: { orderBy: { createdAt: 'asc' } },
        drawerEvents: { orderBy: { createdAt: 'asc' } },
      },
    });
    if (!s) throw new NotFoundException('Turno no encontrado');
    const users = await this.prisma.user.findMany({ where: { companyId: user.companyId, id: { in: [s.openedById, s.closedById].filter((x): x is string => !!x) } }, select: { id: true, name: true } });
    const name = (uid: string | null) => users.find((u) => u.id === uid)?.name ?? null;
    return { ...s, openedBy: name(s.openedById), closedBy: name(s.closedById), totals: await this.totals(this.prisma, user.companyId, s.id) };
  }

  async list(q: ListShiftsQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 30;
    const where: Prisma.PosShiftWhereInput = {
      companyId: user.companyId, terminalId: q.terminalId, status: q.status,
      ...(q.from || q.to ? { openedAt: { ...(q.from && { gte: new Date(`${q.from}T04:00:00Z`) }), ...(q.to && { lt: new Date(new Date(`${q.to}T04:00:00Z`).getTime() + 86_400_000) }) } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.posShift.findMany({ where, orderBy: { openedAt: 'desc' }, skip: (page - 1) * limit, take: limit, include: { terminal: { select: { code: true, name: true } }, _count: { select: { sales: true } } } }),
      this.prisma.posShift.count({ where }),
    ]);
    return { data, total, page, limit };
  }
}
