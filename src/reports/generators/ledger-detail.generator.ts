import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import { JournalEntryStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ZERO, dec, startOfDay, endOfDay, byNature, natureOf } from '../accounting-nature.utils.js';
import { DocumentLedgerQuery } from '../dto/books-queries.dto.js';

interface Row {
  lineId: string; entryId: string; entryNumber: string | null; entryType: string; date: Date; description: string;
  reference: string | null; lineDescription: string | null; debit: Prisma.Decimal; credit: Prisma.Decimal; running: Prisma.Decimal;
  sourceType: string; sourceId: string | null; partnerId: string | null; partnerName: string | null;
  invoiceNumber: string | null; invoiceNcf: string | null; invoiceType: string | null;
  paymentNumber: string | null; paymentDirection: string | null;
}

/**
 * Mayor de una cuenta con trazabilidad completa: cada movimiento trae el asiento, el tercero
 * y el DOCUMENTO que lo originó (factura, pago...). Con `partnerId` es el auxiliar de ese tercero.
 * Es el último nivel del drill-down: Estado financiero -> cuenta -> movimiento -> documento.
 */
@Injectable()
export class LedgerDetailGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(accountId: string, q: DocumentLedgerQuery, user: AuthUser) {
    const account = await this.prisma.account.findFirst({ where: { id: accountId, companyId: user.companyId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    const from = q.from ? startOfDay(q.from) : undefined;
    const to = q.to ? endOfDay(q.to) : undefined;
    const page = q.page ?? 1;
    const limit = q.limit ?? 100;
    const posted = { companyId: user.companyId, status: JournalEntryStatus.POSTED };
    const partner = q.partnerId ? { partnerId: q.partnerId } : {};

    let openingRaw = ZERO;
    if (from) {
      const before = await this.prisma.journalEntryLine.aggregate({
        where: { accountId, ...partner, journalEntry: { ...posted, date: { lt: from } } }, _sum: { debit: true, credit: true },
      });
      openingRaw = dec(before._sum.debit).minus(dec(before._sum.credit));
    }
    const inRange: Prisma.JournalEntryLineWhereInput = { accountId, ...partner, journalEntry: { ...posted, date: { gte: from, lte: to } } };
    const fromSql = from ? Prisma.sql`AND e."date" >= ${from}` : Prisma.empty;
    const toSql = to ? Prisma.sql`AND e."date" <= ${to}` : Prisma.empty;
    const partnerSql = q.partnerId ? Prisma.sql`AND l."partnerId" = ${q.partnerId}` : Prisma.empty;

    const [rows, total, sums] = await Promise.all([
      this.prisma.$queryRaw<Row[]>(Prisma.sql`
        SELECT * FROM (
          SELECT l."id" AS "lineId", e."id" AS "entryId", e."number" AS "entryNumber", e."type"::text AS "entryType",
                 e."date" AS "date", e."createdAt" AS "createdAt", e."description" AS "description", e."reference" AS "reference",
                 l."description" AS "lineDescription", l."debit" AS "debit", l."credit" AS "credit",
                 SUM(l."debit" - l."credit") OVER (ORDER BY e."date", e."createdAt", l."id") AS "running",
                 e."sourceType"::text AS "sourceType", e."sourceId" AS "sourceId",
                 l."partnerId" AS "partnerId", pt."name" AS "partnerName",
                 i."number" AS "invoiceNumber", i."ncf" AS "invoiceNcf", i."type"::text AS "invoiceType",
                 py."number" AS "paymentNumber", py."direction"::text AS "paymentDirection"
          FROM "JournalEntryLine" l
          JOIN "JournalEntry" e ON e."id" = l."journalEntryId"
          LEFT JOIN "Partner" pt ON pt."id" = l."partnerId"
          LEFT JOIN "Invoice" i ON e."sourceType"::text = 'INVOICE' AND i."id" = e."sourceId"
          LEFT JOIN "Payment" py ON e."sourceType"::text = 'PAYMENT' AND py."id" = e."sourceId"
          WHERE e."companyId" = ${user.companyId} AND e."status" = 'POSTED' AND l."accountId" = ${accountId}
            ${partnerSql} ${fromSql} ${toSql}
        ) t
        ORDER BY t."date", t."createdAt", t."lineId"
        LIMIT ${limit} OFFSET ${(page - 1) * limit}`),
      this.prisma.journalEntryLine.count({ where: inRange }),
      this.prisma.journalEntryLine.aggregate({ where: inRange, _sum: { debit: true, credit: true } }),
    ]);

    const totalDebit = dec(sums._sum.debit);
    const totalCredit = dec(sums._sum.credit);
    const source = (r: Row) => {
      if (r.sourceType === 'INVOICE' && r.sourceId) {
        return { type: 'INVOICE', id: r.sourceId, number: r.invoiceNumber, ncf: r.invoiceNcf, kind: r.invoiceType, href: `/invoices/${r.sourceId}` };
      }
      if (r.sourceType === 'PAYMENT' && r.sourceId) {
        return { type: 'PAYMENT', id: r.sourceId, number: r.paymentNumber, kind: r.paymentDirection, href: `/payments/${r.sourceId}` };
      }
      return r.sourceType === 'MANUAL' ? null : { type: r.sourceType, id: r.sourceId };
    };

    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type, nature: natureOf(account.type) },
      partnerId: q.partnerId ?? null, from: q.from ?? null, to: q.to ?? null, page, limit, total,
      openingBalance: byNature(account.type, openingRaw), totalDebit, totalCredit,
      closingBalance: byNature(account.type, openingRaw.plus(totalDebit).minus(totalCredit)),
      movements: rows.map((r) => ({
        lineId: r.lineId, entryId: r.entryId, entryNumber: r.entryNumber, entryType: r.entryType, date: r.date,
        description: r.description, reference: r.reference, lineDescription: r.lineDescription,
        debit: dec(r.debit), credit: dec(r.credit), balance: byNature(account.type, openingRaw.plus(dec(r.running))),
        partner: r.partnerId ? { id: r.partnerId, name: r.partnerName } : null,
        source: source(r),
      })),
    };
  }
}