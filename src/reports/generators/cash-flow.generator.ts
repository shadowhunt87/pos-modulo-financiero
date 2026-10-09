import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '../../generated/prisma/client.js';
import {
  AccountCategory, AccountType, CashFlowCategory, JournalEntryStatus, JournalEntryType,
} from '../../generated/prisma/enums.js';
import type { AuthUser } from '../../auth/types/auth-user.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { ZERO, dec, startOfDay, endOfDay } from '../accounting-nature.utils.js';
import { CashFlowQuery } from '../dto/books-queries.dto.js';

export interface CashFlowLine { accountId: string | null; code: string | null; name: string; amount: Prisma.Decimal; kind?: string }

/**
 * Estado de Flujo de Efectivo, método indirecto (NIC 7 / IAS 7).
 * Se construye con el MOVIMIENTO del período de cada cuenta de balance, clasificada por
 * `Account.cashFlowCategory`: el efecto en caja de una cuenta es el inverso de su movimiento neto
 * (débito - crédito). Como todo asiento cuadra, si todas las cuentas están clasificadas la
 * variación de efectivo calculada coincide con la real. Lo que no esté clasificado sale aparte
 * en `unclassified` para que se corrija. Se excluyen los asientos de cierre de año.
 */
@Injectable()
export class CashFlowGenerator {
  constructor(private readonly prisma: PrismaService) {}

  async generate(q: CashFlowQuery, user: AuthUser) {
    const from = startOfDay(q.from);
    const to = endOfDay(q.to);
    if (from > to) throw new BadRequestException('from no puede ser posterior a to');
    const posted = { companyId: user.companyId, status: JournalEntryStatus.POSTED };

    const accounts = await this.prisma.account.findMany({
      where: { companyId: user.companyId },
      select: { id: true, code: true, name: true, type: true, category: true, cashFlowCategory: true, isContra: true },
    });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const cashIds = accounts.filter((a) => a.cashFlowCategory === CashFlowCategory.CASH_EQUIVALENT).map((a) => a.id);

    const movement = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: { journalEntry: { ...posted, type: { not: JournalEntryType.CLOSING }, date: { gte: from, lte: to } } },
      _sum: { debit: true, credit: true },
    });
    const cashBalance = async (date: { lt: Date } | { lte: Date }) => {
      if (!cashIds.length) return ZERO;
      const r = await this.prisma.journalEntryLine.aggregate({
        where: { accountId: { in: cashIds }, journalEntry: { ...posted, date } }, _sum: { debit: true, credit: true },
      });
      return dec(r._sum.debit).minus(dec(r._sum.credit));
    };
    const [cashOpening, cashClosing] = await Promise.all([cashBalance({ lt: from }), cashBalance({ lte: to })]);

    let netIncome = ZERO;
    let depreciation = ZERO;
    const depreciationAccounts: string[] = [];
    const lines = { operating: [] as CashFlowLine[], investing: [] as CashFlowLine[], financing: [] as CashFlowLine[], unclassified: [] as CashFlowLine[] };

    for (const m of movement) {
      const a = byId.get(m.accountId);
      if (!a) continue;
      const net = dec(m._sum.debit).minus(dec(m._sum.credit)); // débito - crédito
      if (net.isZero()) continue;
      const effect = net.neg(); // efecto en caja de que esta cuenta se movió
      if (a.type === AccountType.INCOME || a.type === AccountType.EXPENSE) { netIncome = netIncome.plus(effect); continue; }
      if (a.cashFlowCategory === CashFlowCategory.CASH_EQUIVALENT) continue;
      // Depreciación/amortización acumulada: partida no monetaria, se presenta como ajuste del resultado
      if (a.isContra && (a.category === AccountCategory.PROPERTY_PLANT_EQUIPMENT || a.category === AccountCategory.INTANGIBLE_ASSETS)) {
        depreciation = depreciation.plus(effect); depreciationAccounts.push(a.code); continue;
      }
      const line: CashFlowLine = { accountId: a.id, code: a.code, name: a.name, amount: effect };
      switch (a.cashFlowCategory) {
        case CashFlowCategory.OPERATING: lines.operating.push(line); break;
        case CashFlowCategory.INVESTING: lines.investing.push(line); break;
        case CashFlowCategory.FINANCING: lines.financing.push(line); break;
        default: lines.unclassified.push(line);
      }
    }
    const byCode = (l: CashFlowLine[]) => l.sort((x, y) => (x.code ?? '').localeCompare(y.code ?? ''));
    const operating: CashFlowLine[] = [{ accountId: null, code: null, name: 'Resultado neto del período', amount: netIncome, kind: 'NET_INCOME' }];
    if (!depreciation.isZero()) {
      operating.push({ accountId: null, code: null, name: `Depreciación y amortización (${depreciationAccounts.join(', ')})`, amount: depreciation, kind: 'NON_CASH' });
    }
    operating.push(...byCode(lines.operating));

    const total = (l: CashFlowLine[]) => l.reduce((s, x) => s.plus(x.amount), ZERO);
    const netOperating = total(operating), netInvesting = total(byCode(lines.investing)), netFinancing = total(byCode(lines.financing));
    const netUnclassified = total(lines.unclassified);
    const calculatedChange = netOperating.plus(netInvesting).plus(netFinancing).plus(netUnclassified);
    const cashChange = cashClosing.minus(cashOpening);
    const difference = cashChange.minus(calculatedChange);

    const warnings: string[] = [];
    if (!cashIds.length) warnings.push('Ninguna cuenta está clasificada como CASH_EQUIVALENT: no se puede calcular el efectivo. Usa PUT /account-classification.');
    if (lines.unclassified.length) warnings.push(`${lines.unclassified.length} cuenta(s) con movimiento sin clasificar para flujo de efectivo.`);
    if (!difference.isZero()) warnings.push(`El flujo calculado no coincide con la variación real de efectivo (diferencia ${difference.toFixed(2)}).`);

    return {
      from: q.from, to: q.to, method: 'INDIRECT',
      operating: { lines: operating, total: netOperating },
      investing: { lines: byCode(lines.investing), total: netInvesting },
      financing: { lines: byCode(lines.financing), total: netFinancing },
      unclassified: { lines: lines.unclassified, total: netUnclassified },
      netChangeInCash: cashChange, cashAtBeginning: cashOpening, cashAtEnd: cashClosing,
      calculatedChange, difference, balanced: difference.isZero() && cashIds.length > 0 && lines.unclassified.length === 0, warnings,
    };
  }
}
