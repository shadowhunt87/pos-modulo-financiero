import { Injectable, NotFoundException } from '@nestjs/common';
import { JournalEntryStatus } from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ZERO, dec, startOfDay, endOfDay, byNature } from '../accounting-nature.utils.js';
import { SubledgerQuery } from '../dto/books-queries.dto.js';

/**
 * Mayor auxiliar: el saldo de una cuenta de control (CxC, CxP, anticipos...) desglosado
 * por tercero. La suma de los terceros más "sin tercero" siempre iguala al mayor general;
 * si "sin tercero" no es cero, hay movimientos en la cuenta de control sin auxiliar asignado.
 */
@Injectable()
export class SubledgerGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(q: SubledgerQuery, user: AuthUser) {
    const account = await this.prisma.account.findFirst({ where: { id: q.accountId, companyId: user.companyId } });
    if (!account) throw new NotFoundException('Cuenta no encontrada');
    const from = q.from ? startOfDay(q.from) : undefined;
    const to = q.to ? endOfDay(q.to) : undefined;
    const posted = { companyId: user.companyId, status: JournalEntryStatus.POSTED };

    const [before, within] = await Promise.all([
      from
        ? this.prisma.journalEntryLine.groupBy({
            by: ['partnerId'], where: { accountId: q.accountId, journalEntry: { ...posted, date: { lt: from } } }, _sum: { debit: true, credit: true },
          })
        : Promise.resolve([]),
      this.prisma.journalEntryLine.groupBy({
        by: ['partnerId'], where: { accountId: q.accountId, journalEntry: { ...posted, date: { gte: from, lte: to } } }, _sum: { debit: true, credit: true },
      }),
    ]);

    const acc = new Map<string | null, { opening: typeof ZERO; debit: typeof ZERO; credit: typeof ZERO }>();
    const slot = (k: string | null) => acc.get(k) ?? acc.set(k, { opening: ZERO, debit: ZERO, credit: ZERO }).get(k)!;
    for (const r of before) slot(r.partnerId).opening = dec(r._sum.debit).minus(dec(r._sum.credit));
    for (const r of within) { const s = slot(r.partnerId); s.debit = dec(r._sum.debit); s.credit = dec(r._sum.credit); }

    const ids = [...acc.keys()].filter((k): k is string => !!k);
    const partners = await this.prisma.partner.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, taxId: true } });
    const info = new Map(partners.map((p) => [p.id, p]));

    const rows = [...acc.entries()].map(([partnerId, s]) => {
      const closingRaw = s.opening.plus(s.debit).minus(s.credit);
      return {
        partnerId, name: partnerId ? info.get(partnerId)?.name ?? '(tercero eliminado)' : 'Sin tercero asignado',
        taxId: partnerId ? info.get(partnerId)?.taxId ?? null : null,
        openingBalance: byNature(account.type, s.opening), debit: s.debit, credit: s.credit, closingBalance: byNature(account.type, closingRaw),
      };
    }).filter((r) => !(r.openingBalance.isZero() && r.debit.isZero() && r.credit.isZero()))
      .sort((a, b) => b.closingBalance.abs().comparedTo(a.closingBalance.abs()));

    const sum = (f: (r: (typeof rows)[number]) => typeof ZERO) => rows.reduce((s, r) => s.plus(f(r)), ZERO);
    const unassigned = rows.find((r) => r.partnerId === null);
    return {
      account: { id: account.id, code: account.code, name: account.name, type: account.type },
      from: q.from ?? null, to: q.to ?? null, partners: rows,
      totals: { openingBalance: sum((r) => r.openingBalance), debit: sum((r) => r.debit), credit: sum((r) => r.credit), closingBalance: sum((r) => r.closingBalance) },
      unassignedBalance: unassigned?.closingBalance ?? ZERO,
      warnings: unassigned && !unassigned.closingBalance.isZero()
        ? ['La cuenta tiene movimientos sin tercero asignado: el auxiliar no cuadra con la cuenta de control por partida.'] : [],
    };
  }
}