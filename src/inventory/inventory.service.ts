import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AuditAction, InventoryAdjustmentStatus, InventoryMovementType, InvoiceType, JournalType, SourceDocumentType,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { startOfDay, endOfDay } from '../reports/accounting-nature.utils.js';
import { AccountingSettingsService } from '../masters/accounting-settings/accounting-settings.service.js';
import { DocumentSequencesService } from '../masters/sequences/document-sequences.service.js';
import { PostingService, type PostLine } from '../posting/posting.service.js';
import { CreateAdjustmentDto, ListAdjustmentsQuery, MovementsQuery, StockQuery, VoidAdjustmentDto } from './dto.js';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;
const D = (v?: Dec | number | string | null): Dec => new Prisma.Decimal(v === null || v === undefined ? 0 : v);
const ZERO = D(0);
// Valores de inventario a 2 decimales (half-up), igual que el asiento: así el kárdex y el mayor cuadran centavo a centavo
const r2 = (d: Dec): Dec => d.toDecimalPlaces(2, 4);
const fmt = (d: Dec) => d.toDecimalPlaces(4).toString();

interface MoveInput {
  productId: string;
  date: Date;
  type: InventoryMovementType;
  /** + entra, − sale; nunca cero */
  quantity: Dec;
  /** Costo unitario (moneda base). Entradas: obligatorio salvo que venga totalCost. Salidas: si falta, el promedio. */
  unitCost?: Dec;
  /** Valor exacto (positivo) del movimiento: manda sobre unitCost (compras y devoluciones a valor de documento) */
  totalCost?: Dec;
  invoiceId?: string;
  adjustmentId?: string;
  reversalOfId?: string;
}

/** Acumulador de un asiento: monto firmado por cuenta (+ débito, − crédito). */
class EntryLines {
  private readonly byAccount = new Map<string, Dec>();
  add(accountId: string, signed: Dec) {
    if (signed.isZero()) return;
    this.byAccount.set(accountId, (this.byAccount.get(accountId) ?? ZERO).plus(signed));
  }
  /** Dr `debitAccount` / Cr `creditAccount` por `amount` (negativo invierte). */
  pair(debitAccount: string, creditAccount: string, amount: Dec) {
    this.add(debitAccount, amount);
    this.add(creditAccount, amount.neg());
  }
  lines(description: string): PostLine[] {
    return [...this.byAccount.entries()]
      .filter(([, v]) => !v.isZero())
      .map(([accountId, v]) => ({ accountId, debit: v.gt(0) ? v : ZERO, credit: v.lt(0) ? v.neg() : ZERO, description }));
  }
}

/**
 * Inventario perpetuo con costo promedio ponderado, un almacén (P2, docs/PLAN-catalogo-inventario-rrhh.md).
 * Es el ÚNICO que cambia stockQty/stockValue/avgCost de un producto: siempre con la fila bloqueada (FOR UPDATE) y dejando
 * un movimiento. El costo se calcula en el orden de registro (seq), no por fecha.
 */
@Injectable()
export class InventoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AccountingSettingsService,
    private readonly sequences: DocumentSequencesService,
    private readonly posting: PostingService,
  ) {}

  // ------------------------------------------------------------------
  // Movimiento (núcleo)
  // ------------------------------------------------------------------
  private async move(tx: Tx, user: AuthUser, m: MoveInput) {
    if (m.quantity.isZero()) throw new BadRequestException('La cantidad de un movimiento de inventario no puede ser cero');
    // Bloquea la fila: dos ventas simultáneas del mismo producto no leen la misma existencia
    await tx.$queryRaw`SELECT id FROM "Product" WHERE id = ${m.productId} AND "companyId" = ${user.companyId} FOR UPDATE`;
    const p = await tx.product.findFirst({ where: { id: m.productId, companyId: user.companyId } });
    if (!p) throw new NotFoundException('Producto no encontrado');
    if (!p.tracksInventory) throw new UnprocessableEntityException(`El producto ${p.code} no controla inventario`);

    let value: Dec; // firmado, como la cantidad
    if (m.quantity.gt(0)) {
      if (!m.totalCost && !m.unitCost) throw new BadRequestException(`Falta el costo de la entrada de ${p.code}`);
      value = m.totalCost ? r2(m.totalCost) : r2(m.quantity.times(m.unitCost!));
    } else {
      const out = m.quantity.neg();
      if (p.stockQty.lt(out)) {
        throw new UnprocessableEntityException(`No hay existencia suficiente de ${p.code} - ${p.name}: hay ${fmt(p.stockQty)} y se necesitan ${fmt(out)}`);
      }
      if (m.totalCost) value = r2(m.totalCost).neg();
      // Si sale todo, sale todo el valor: no quedan centavos sueltos por redondeo
      else if (p.stockQty.eq(out)) value = p.stockValue.neg();
      else value = r2(out.times(m.unitCost ?? p.avgCost)).neg();
    }
    const qtyAfter = p.stockQty.plus(m.quantity);
    const valueAfter = p.stockValue.plus(value);
    const unitCost = value.abs().div(m.quantity.abs()).toDecimalPlaces(6, 4);
    // Sin existencia se conserva el último promedio (referencia para la próxima salida)
    const avgCost = qtyAfter.gt(0) ? valueAfter.div(qtyAfter).toDecimalPlaces(6, 4) : (m.quantity.gt(0) ? unitCost : p.avgCost);

    await tx.product.update({ where: { id: p.id, companyId: user.companyId }, data: { stockQty: qtyAfter, stockValue: valueAfter, avgCost } });
    const mv = await tx.inventoryMovement.create({
      data: {
        companyId: user.companyId, productId: p.id, date: m.date, type: m.type, quantity: m.quantity, unitCost, totalCost: value,
        qtyAfter, valueAfter, invoiceId: m.invoiceId ?? null, adjustmentId: m.adjustmentId ?? null,
        reversalOfId: m.reversalOfId ?? null, createdById: user.id,
      },
    });
    return { mv, product: p };
  }

  /** Revierte movimientos al mismo valor (anulación de factura o ajuste) y anula sus asientos de costo. */
  private async reverseAll(tx: Tx, user: AuthUser, where: Prisma.InventoryMovementWhereInput, reason: string) {
    const moves = await tx.inventoryMovement.findMany({
      where: { ...where, companyId: user.companyId, type: { not: InventoryMovementType.REVERSAL }, reversedBy: { is: null } },
      orderBy: { seq: 'asc' },
      include: { product: { select: { code: true, name: true } } },
    });
    for (const m of moves) {
      try {
        await this.move(tx, user, {
          productId: m.productId, date: m.date, type: InventoryMovementType.REVERSAL, quantity: m.quantity.neg(),
          totalCost: m.totalCost.abs(), invoiceId: m.invoiceId ?? undefined, adjustmentId: m.adjustmentId ?? undefined, reversalOfId: m.id,
        });
      } catch (e) {
        if (e instanceof UnprocessableEntityException && m.quantity.gt(0)) {
          throw new UnprocessableEntityException(
            `No se puede anular: ya salió mercancía que entró con este documento (${m.product.code} - ${m.product.name}). ` +
            'Registra una devolución o un ajuste en su lugar',
          );
        }
        throw e;
      }
    }
    const entries = [...new Set(moves.map((m) => m.journalEntryId).filter((x): x is string => !!x))];
    for (const id of entries) await this.posting.voidEntry(tx, user, id, reason);
    return moves.length;
  }

  /** Cuentas de inventario y costo de un producto: las suyas o las de Configuración contable. */
  private async accountsFor(companyId: string, p: { inventoryAccountId: string | null; cogsAccountId: string | null }, needCogs: boolean) {
    let inventory = p.inventoryAccountId;
    let cogs = p.cogsAccountId;
    if (!inventory || (needCogs && !cogs)) {
      const keys = [...(!inventory ? (['inventoryAccountId'] as const) : []), ...(needCogs && !cogs ? (['cogsAccountId'] as const) : [])];
      const s = await this.settings.require(companyId, keys);
      inventory ??= (s as Record<string, string>).inventoryAccountId;
      if (needCogs) cogs ??= (s as Record<string, string>).cogsAccountId;
    }
    return { inventory: inventory!, cogs: cogs ?? '' };
  }

  /**
   * Cuenta de la línea de una compra (o su nota de crédito) con un producto que controla inventario: siempre la de
   * inventario. Si fuera a gasto, el mayor y el kárdex dejarían de cuadrar. La usa facturación al armar el documento.
   */
  async purchaseInventoryAccount(companyId: string, p: { inventoryAccountId: string | null }) {
    return (await this.accountsFor(companyId, { inventoryAccountId: p.inventoryAccountId, cogsAccountId: null }, false)).inventory;
  }

  // ------------------------------------------------------------------
  // Facturación (dentro de SU transacción)
  // ------------------------------------------------------------------
  /**
   * Al emitir: compra → entra al costo neto de la línea (en moneda base); venta → sale al promedio con asiento de costo;
   * NC de venta → vuelve al costo con que salió; NC de compra → sale al valor de la nota. Las notas de débito no mueven.
   */
  async onInvoiceIssued(tx: Tx, user: AuthUser, invoiceId: string) {
    const inv = await tx.invoice.findFirstOrThrow({
      where: { id: invoiceId, companyId: user.companyId },
      include: { lines: { include: { product: true } }, relatedInvoice: { select: { id: true, type: true } } },
    });
    const lines = inv.lines.filter((l) => l.product?.tracksInventory);
    if (!lines.length || inv.type === InvoiceType.DEBIT_NOTE) return;
    const sales = inv.type === InvoiceType.SALE || (inv.type === InvoiceType.CREDIT_NOTE && inv.relatedInvoice?.type === InvoiceType.SALE);
    const entry = new EntryLines();
    const costed: string[] = []; // movimientos que llevan el asiento de costo

    for (const l of lines) {
      const p = l.product!;
      const base = r2(l.total.times(inv.exchangeRate)); // neto de la línea en moneda base
      if (inv.type === InvoiceType.PURCHASE) {
        await this.move(tx, user, { productId: p.id, date: inv.issueDate, type: InventoryMovementType.PURCHASE, quantity: l.quantity, totalCost: base, invoiceId: inv.id });
      } else if (inv.type === InvoiceType.SALE) {
        const { mv } = await this.move(tx, user, { productId: p.id, date: inv.issueDate, type: InventoryMovementType.SALE, quantity: l.quantity.neg(), invoiceId: inv.id });
        const acc = await this.accountsFor(user.companyId, p, true);
        entry.pair(acc.cogs, acc.inventory, mv.totalCost.abs());
        costed.push(mv.id);
      } else if (sales) {
        // Devolución de cliente: al costo con que salió en la venta original (si no se encuentra, al promedio actual)
        const orig = await tx.inventoryMovement.findFirst({
          where: { companyId: user.companyId, invoiceId: inv.relatedInvoiceId!, productId: p.id, type: InventoryMovementType.SALE, reversedBy: { is: null } },
          orderBy: { seq: 'asc' },
        });
        const { mv } = await this.move(tx, user, {
          productId: p.id, date: inv.issueDate, type: InventoryMovementType.SALE_RETURN, quantity: l.quantity,
          unitCost: orig?.unitCost ?? p.avgCost, invoiceId: inv.id,
        });
        const acc = await this.accountsFor(user.companyId, p, true);
        entry.pair(acc.inventory, acc.cogs, mv.totalCost);
        costed.push(mv.id);
      } else {
        // Devolución al proveedor: el asiento de la nota ya acredita inventario por este valor
        await this.move(tx, user, { productId: p.id, date: inv.issueDate, type: InventoryMovementType.PURCHASE_RETURN, quantity: l.quantity.neg(), totalCost: base, invoiceId: inv.id });
      }
    }

    const postLines = entry.lines(`Costo ${inv.number}`);
    if (postLines.length >= 2) {
      const je = await this.posting.post(tx, user, {
        date: inv.issueDate,
        description: `Costo de ventas ${inv.type === InvoiceType.SALE ? 'de la factura' : 'devuelto con la nota'} ${inv.number}`,
        reference: inv.number, journalType: JournalType.GENERAL, sourceType: SourceDocumentType.INVENTORY, sourceId: inv.id, lines: postLines,
      });
      await tx.inventoryMovement.updateMany({ where: { id: { in: costed }, companyId: user.companyId }, data: { journalEntryId: je.id } });
    }
  }

  /** Al anular una factura: revierte sus movimientos al mismo valor y anula su asiento de costo. */
  async onInvoiceVoided(tx: Tx, user: AuthUser, invoiceId: string, reason: string) {
    await this.reverseAll(tx, user, { invoiceId }, reason);
  }

  // ------------------------------------------------------------------
  // Ajustes
  // ------------------------------------------------------------------
  async createAdjustment(dto: CreateAdjustmentDto, user: AuthUser) {
    const { companyId } = user;
    const id = await this.prisma.$transaction(async (tx) => {
      const counterAccountId = dto.counterAccountId
        ?? (await this.settings.require(companyId, ['inventoryAdjustmentAccountId'] as const)).inventoryAdjustmentAccountId;
      const counter = await tx.account.findFirst({ where: { id: counterAccountId, companyId } });
      if (!counter) throw new NotFoundException('Cuenta de contrapartida no encontrada');
      const ids = new Set<string>();
      for (const l of dto.lines) {
        if (l.quantity === 0) throw new BadRequestException('Cada línea debe tener una cantidad distinta de cero');
        if (l.quantity > 0 && l.unitCost === undefined) throw new BadRequestException('Las entradas llevan su costo unitario (unitCost)');
        if (ids.has(l.productId)) throw new BadRequestException('Un producto aparece dos veces en el ajuste: júntalo en una línea');
        ids.add(l.productId);
      }
      const date = new Date(dto.date);
      await this.posting.assertPeriodOpen(tx, companyId, date);
      const number = await this.sequences.next(tx, companyId, 'INVENTORY_ADJUSTMENT');
      const adj = await tx.inventoryAdjustment.create({
        data: { companyId, number, date, reason: dto.reason, counterAccountId, createdById: user.id },
      });

      const entry = new EntryLines();
      const moved: string[] = [];
      for (const l of dto.lines) {
        const qty = D(l.quantity);
        const { mv, product } = await this.move(tx, user, {
          productId: l.productId, date, type: qty.gt(0) ? InventoryMovementType.ADJUSTMENT_IN : InventoryMovementType.ADJUSTMENT_OUT,
          quantity: qty, unitCost: l.unitCost !== undefined && qty.gt(0) ? D(l.unitCost) : undefined, adjustmentId: adj.id,
        });
        await tx.inventoryAdjustmentLine.create({
          data: { adjustmentId: adj.id, productId: l.productId, quantity: qty, unitCost: mv.unitCost, totalCost: mv.totalCost },
        });
        const acc = await this.accountsFor(companyId, product, false);
        entry.pair(acc.inventory, counterAccountId, mv.totalCost); // entrada: Dr inventario; salida (negativa): Cr inventario
        moved.push(mv.id);
      }

      const postLines = entry.lines(`Ajuste ${number}`);
      if (postLines.length >= 2) {
        const je = await this.posting.post(tx, user, {
          date, description: `Ajuste de inventario ${number}: ${dto.reason}`, reference: number,
          journalType: JournalType.GENERAL, sourceType: SourceDocumentType.INVENTORY, sourceId: adj.id, lines: postLines,
        });
        await tx.inventoryAdjustment.update({ where: { id: adj.id, companyId }, data: { journalEntryId: je.id } });
        await tx.inventoryMovement.updateMany({ where: { id: { in: moved }, companyId }, data: { journalEntryId: je.id } });
      }
      await writeAudit(tx, user, 'InventoryAdjustment', adj.id, AuditAction.POST, { number, lines: dto.lines.length, reason: dto.reason });
      return adj.id;
    });
    return this.getAdjustment(id, user);
  }

  async voidAdjustment(id: string, dto: VoidAdjustmentDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const res = await tx.inventoryAdjustment.updateMany({
        where: { id, companyId: user.companyId, status: InventoryAdjustmentStatus.POSTED },
        data: { status: InventoryAdjustmentStatus.VOIDED, voidedAt: new Date(), voidReason: dto.reason },
      });
      if (res.count === 0) {
        const exists = await tx.inventoryAdjustment.findFirst({ where: { id, companyId: user.companyId } });
        if (!exists) throw new NotFoundException('Ajuste no encontrado');
        throw new ConflictException('El ajuste ya está anulado');
      }
      const adj = await tx.inventoryAdjustment.findUniqueOrThrow({ where: { id } });
      await this.reverseAll(tx, user, { adjustmentId: id }, `Anulación ${adj.number}: ${dto.reason}`);
      await writeAudit(tx, user, 'InventoryAdjustment', id, AuditAction.VOID, { reason: dto.reason });
    });
    return this.getAdjustment(id, user);
  }

  // ------------------------------------------------------------------
  // Consultas
  // ------------------------------------------------------------------
  async stock(q: StockQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 100;
    const where: Prisma.ProductWhereInput = {
      companyId: user.companyId, tracksInventory: true,
      ...(q.withStock ? { stockQty: { not: 0 } } : {}),
      ...(q.q ? { OR: [{ code: { contains: q.q, mode: 'insensitive' } }, { name: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [data, total, sums] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where, orderBy: [{ name: 'asc' }, { code: 'asc' }], skip: (page - 1) * limit, take: limit,
        select: { id: true, code: true, name: true, unit: true, active: true, stockQty: true, avgCost: true, stockValue: true },
      }),
      this.prisma.product.count({ where }),
      this.prisma.product.aggregate({ where: { companyId: user.companyId, tracksInventory: true }, _sum: { stockValue: true } }),
    ]);
    return { data, total, page, limit, totalValue: D(sums._sum.stockValue) };
  }

  async movements(productId: string, q: MovementsQuery, user: AuthUser) {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, companyId: user.companyId },
      select: { id: true, code: true, name: true, unit: true, tracksInventory: true, stockQty: true, avgCost: true, stockValue: true },
    });
    if (!product) throw new NotFoundException('Producto no encontrado');
    const page = q.page ?? 1;
    const limit = q.limit ?? 100;
    const where: Prisma.InventoryMovementWhereInput = {
      companyId: user.companyId, productId,
      ...(q.from || q.to ? { date: { ...(q.from && { gte: startOfDay(q.from) }), ...(q.to && { lte: endOfDay(q.to) }) } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryMovement.findMany({
        where, orderBy: { seq: 'asc' }, skip: (page - 1) * limit, take: limit,
        include: {
          invoice: { select: { id: true, number: true, type: true, ncf: true } },
          adjustment: { select: { id: true, number: true } },
          journalEntry: { select: { id: true, number: true } },
        },
      }),
      this.prisma.inventoryMovement.count({ where }),
    ]);
    return { product, data, total, page, limit };
  }

  async listAdjustments(q: ListAdjustmentsQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.InventoryAdjustmentWhereInput = {
      companyId: user.companyId,
      ...(q.from || q.to ? { date: { ...(q.from && { gte: startOfDay(q.from) }), ...(q.to && { lte: endOfDay(q.to) }) } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.inventoryAdjustment.findMany({
        where, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit,
        include: { counterAccount: { select: { id: true, code: true, name: true } }, _count: { select: { lines: true } } },
      }),
      this.prisma.inventoryAdjustment.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async getAdjustment(id: string, user: AuthUser) {
    const adj = await this.prisma.inventoryAdjustment.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        counterAccount: { select: { id: true, code: true, name: true } },
        journalEntry: { select: { id: true, number: true, status: true } },
        lines: { include: { product: { select: { id: true, code: true, name: true, unit: true } } } },
      },
    });
    if (!adj) throw new NotFoundException('Ajuste no encontrado');
    return adj;
  }
}
