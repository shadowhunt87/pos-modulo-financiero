import { randomUUID } from 'node:crypto';
import {
  BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AccountType, AuditAction, BankTransactionSource, BankTransactionStatus, JournalType, SourceDocumentType,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit, isUniqueViolation } from '../common/audit.js';
import { startOfDay, endOfDay } from '../reports/accounting-nature.utils.js';
import { PostingService } from '../posting/posting.service.js';
import { csvToRows, fingerprint, parseAmount, parseDate, type RawRow } from './csv.util.js';
import {
  AddTransactionDto, CategorizeDto, CreateBankAccountDto, CreateBankRuleDto, CreateCashRegisterDto,
  ImportStatementDto, ListBankRulesQuery, ListTransactionsQuery, TransferDto, UpdateBankAccountDto,
  UpdateBankRuleDto, UpdateCashRegisterDto,
} from './dto/treasury.dto.js';

type Dec = Prisma.Decimal;
const D = (v?: Dec | number | string | null): Dec => new Prisma.Decimal(v ?? 0);
const ZERO = D(0);

@Injectable()
export class TreasuryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly posting: PostingService,
  ) {}

  // ------------------------------------------------------------------
  // Utilidades
  // ------------------------------------------------------------------
  /** Saldo del mayor (débitos - créditos, solo asientos vigentes) por cuenta. */
  private async glBalances(companyId: string, accountIds: string[], asOf?: Date) {
    if (!accountIds.length) return new Map<string, Dec>();
    const rows = await this.prisma.journalEntryLine.groupBy({
      by: ['accountId'],
      where: {
        accountId: { in: accountIds },
        journalEntry: { companyId, status: 'POSTED', ...(asOf ? { date: { lte: asOf } } : {}) },
      },
      _sum: { debit: true, credit: true },
    });
    return new Map(rows.map((r) => [r.accountId, D(r._sum.debit).minus(D(r._sum.credit))]));
  }

  /** La cuenta contable debe ser un activo vigente que no use otro banco/caja. */
  private async assertGlAccount(companyId: string, accountId: string) {
    const a = await this.prisma.account.findFirst({ where: { id: accountId, companyId } });
    if (!a) throw new NotFoundException('Cuenta contable no encontrada');
    if (a.type !== AccountType.ASSET) throw new UnprocessableEntityException(`La cuenta ${a.code} debe ser de tipo ASSET`);
    if (!a.active || !a.isPostable) throw new UnprocessableEntityException(`La cuenta ${a.code} está inactiva o no admite movimientos`);
    const [bank, cash] = await Promise.all([
      this.prisma.bankAccount.findFirst({ where: { companyId, glAccountId: accountId } }),
      this.prisma.cashRegister.findFirst({ where: { companyId, glAccountId: accountId } }),
    ]);
    if (bank || cash) throw new ConflictException(`La cuenta ${a.code} ya está asociada a ${bank ? 'un banco' : 'una caja'}`);
  }

  private async baseCurrency(companyId: string) {
    return (await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } })).baseCurrency;
  }

  async getBankAccountOrFail(id: string, user: AuthUser) {
    const acc = await this.prisma.bankAccount.findFirst({ where: { id, companyId: user.companyId } });
    if (!acc) throw new NotFoundException('Cuenta bancaria no encontrada');
    return acc;
  }

  // ------------------------------------------------------------------
  // Cuentas bancarias
  // ------------------------------------------------------------------
  async createBankAccount(dto: CreateBankAccountDto, user: AuthUser) {
    await this.assertGlAccount(user.companyId, dto.glAccountId);
    const dup = await this.prisma.bankAccount.findFirst({ where: { companyId: user.companyId, bankName: dto.bankName, accountNumber: dto.accountNumber } });
    if (dup) throw new ConflictException('Ya existe esa cuenta en ese banco');
    return this.prisma.$transaction(async (tx) => {
      const acc = await tx.bankAccount.create({
        data: {
          companyId: user.companyId, bankName: dto.bankName, accountNumber: dto.accountNumber, iban: dto.iban, swift: dto.swift,
          type: dto.type, currency: dto.currency, glAccountId: dto.glAccountId, openingBalance: dto.openingBalance,
          openingBalanceDate: dto.openingBalanceDate ? new Date(dto.openingBalanceDate) : undefined,
        },
      });
      await writeAudit(tx, user, 'BankAccount', acc.id, AuditAction.CREATE, { bankName: acc.bankName, accountNumber: acc.accountNumber });
      return acc;
    });
  }

  async listBankAccounts(user: AuthUser) {
    const accounts = await this.prisma.bankAccount.findMany({ where: { companyId: user.companyId }, orderBy: [{ bankName: 'asc' }, { accountNumber: 'asc' }] });
    const balances = await this.glBalances(user.companyId, accounts.map((a) => a.glAccountId).filter((x): x is string => !!x));
    return accounts.map((a) => ({ ...a, glBalance: a.glAccountId ? balances.get(a.glAccountId) ?? ZERO : null }));
  }

  async getBankAccount(id: string, user: AuthUser) {
    const acc = await this.getBankAccountOrFail(id, user);
    const [bal, pending, last] = await Promise.all([
      this.glBalances(user.companyId, acc.glAccountId ? [acc.glAccountId] : []),
      this.prisma.bankTransaction.count({ where: { bankAccountId: id, status: BankTransactionStatus.PENDING } }),
      this.prisma.bankReconciliation.findFirst({
        where: { bankAccountId: id, status: 'COMPLETED' }, orderBy: { statementDate: 'desc' },
        select: { id: true, statementDate: true, statementBalance: true },
      }),
    ]);
    return { ...acc, glBalance: acc.glAccountId ? bal.get(acc.glAccountId) ?? ZERO : null, pendingTransactions: pending, lastReconciliation: last };
  }

  async updateBankAccount(id: string, dto: UpdateBankAccountDto, user: AuthUser) {
    await this.getBankAccountOrFail(id, user);
    return this.prisma.$transaction(async (tx) => {
      const acc = await tx.bankAccount.update({ where: { id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'BankAccount', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)));
      return acc;
    });
  }

  // ------------------------------------------------------------------
  // Cajas
  // ------------------------------------------------------------------
  async createCashRegister(dto: CreateCashRegisterDto, user: AuthUser) {
    await this.assertGlAccount(user.companyId, dto.glAccountId);
    if (dto.custodianId) await this.assertUser(user.companyId, dto.custodianId);
    return this.prisma.$transaction(async (tx) => {
      const reg = await tx.cashRegister.create({ data: { ...dto, companyId: user.companyId } });
      await writeAudit(tx, user, 'CashRegister', reg.id, AuditAction.CREATE, { name: reg.name });
      return reg;
    });
  }

  private async assertUser(companyId: string, userId: string) {
    const u = await this.prisma.user.findFirst({ where: { id: userId, companyId, active: true } });
    if (!u) throw new NotFoundException('Responsable no encontrado');
  }

  async listCashRegisters(user: AuthUser) {
    const regs = await this.prisma.cashRegister.findMany({ where: { companyId: user.companyId }, orderBy: { name: 'asc' } });
    const balances = await this.glBalances(user.companyId, regs.map((r) => r.glAccountId).filter((x): x is string => !!x));
    return regs.map((r) => ({ ...r, glBalance: r.glAccountId ? balances.get(r.glAccountId) ?? ZERO : null }));
  }

  async updateCashRegister(id: string, dto: UpdateCashRegisterDto, user: AuthUser) {
    const reg = await this.prisma.cashRegister.findFirst({ where: { id, companyId: user.companyId } });
    if (!reg) throw new NotFoundException('Caja no encontrada');
    if (dto.custodianId) await this.assertUser(user.companyId, dto.custodianId);
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.cashRegister.update({ where: { id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'CashRegister', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)));
      return upd;
    });
  }

  // ------------------------------------------------------------------
  // Movimientos del banco
  // ------------------------------------------------------------------
  async addTransaction(bankAccountId: string, dto: AddTransactionDto, user: AuthUser) {
    const acc = await this.getBankAccountOrFail(bankAccountId, user);
    if (D(dto.amount).isZero()) throw new UnprocessableEntityException('El monto no puede ser cero');
    try {
      return await this.prisma.bankTransaction.create({
        data: {
          bankAccountId, date: new Date(dto.date), description: dto.description, reference: dto.reference,
          amount: dto.amount, balanceAfter: dto.balanceAfter, currency: acc.currency, externalId: dto.externalId,
          source: BankTransactionSource.MANUAL,
        },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Ya existe un movimiento con ese externalId');
      throw e;
    }
  }

  async listTransactions(bankAccountId: string, q: ListTransactionsQuery, user: AuthUser) {
    await this.getBankAccountOrFail(bankAccountId, user);
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.BankTransactionWhereInput = {
      bankAccountId, status: q.status,
      ...(q.from || q.to ? { date: { ...(q.from && { gte: startOfDay(q.from) }), ...(q.to && { lte: endOfDay(q.to) }) } } : {}),
      ...(q.q ? { OR: [{ description: { contains: q.q, mode: 'insensitive' } }, { reference: { contains: q.q, mode: 'insensitive' } }] } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.bankTransaction.findMany({
        where, include: { matches: { select: { journalEntryLineId: true, amount: true } } },
        orderBy: [{ date: 'desc' }, { importedAt: 'desc' }], skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.bankTransaction.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  /** Importa un extracto (CSV o filas). Todo o nada: si una fila es inválida no se importa nada. */
  async importStatement(bankAccountId: string, dto: ImportStatementDto, user: AuthUser) {
    const acc = await this.getBankAccountOrFail(bankAccountId, user);
    if (!!dto.csv === !!dto.rows) throw new BadRequestException('Envía `csv` o `rows` (solo uno)');
    let raw: RawRow[];
    try {
      raw = dto.rows ?? csvToRows(dto.csv!, { delimiter: dto.delimiter, hasHeader: dto.hasHeader, columns: dto.columns });
    } catch (e) {
      throw new UnprocessableEntityException((e as Error).message);
    }
    if (raw.length === 0) throw new UnprocessableEntityException('El extracto no tiene movimientos');
    if (raw.length > 5000) throw new UnprocessableEntityException('Máximo 5000 movimientos por importación');

    const errors: string[] = [];
    const seen = new Map<string, number>();
    const batchId = randomUUID();
    const data: Prisma.BankTransactionCreateManyInput[] = [];
    raw.forEach((r, i) => {
      const line = i + (dto.hasHeader === false ? 1 : 2); // número de línea en el archivo
      const date = parseDate(r.date, dto.dateFormat);
      const description = String(r.description ?? '').trim().slice(0, 300);
      let amount: Dec | null = null;
      if (r.amount !== undefined && r.amount !== '') amount = parseAmount(r.amount, dto.decimalSeparator);
      else {
        const debit = parseAmount(r.debit, dto.decimalSeparator);
        const credit = parseAmount(r.credit, dto.decimalSeparator);
        if (debit || credit) amount = (credit ?? ZERO).minus(debit ?? ZERO); // débito = salida
      }
      if (!date) return void errors.push(`Línea ${line}: fecha inválida "${r.date ?? ''}"`);
      if (!description) return void errors.push(`Línea ${line}: falta la descripción`);
      if (!amount || amount.isZero()) return void errors.push(`Línea ${line}: monto inválido o cero`);
      const reference = String(r.reference ?? '').trim().slice(0, 100);
      const base = `${date.toISOString()}|${amount.toFixed(4)}|${description}|${reference}`;
      const occurrence = (seen.get(base) ?? 0) + 1;
      seen.set(base, occurrence);
      data.push({
        bankAccountId, date, description, reference: reference || null, amount,
        balanceAfter: parseAmount(r.balance, dto.decimalSeparator), currency: acc.currency,
        externalId: r.externalId?.trim() || fingerprint(date, amount, description, reference, occurrence),
        source: BankTransactionSource.FILE_IMPORT, importBatchId: batchId,
      });
    });
    if (errors.length) {
      throw new UnprocessableEntityException({ message: 'El extracto tiene filas inválidas; no se importó nada', errors: errors.slice(0, 20), totalErrors: errors.length });
    }

    const result = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bankTransaction.createMany({ data, skipDuplicates: true });
      await tx.bankAccount.update({ where: { id: bankAccountId, companyId: user.companyId }, data: { lastSyncedAt: new Date() } });
      await writeAudit(tx, user, 'BankAccount', bankAccountId, AuditAction.CREATE, { import: batchId, imported: created.count, rows: data.length });
      return created.count;
    });
    const rules = dto.applyRules ? await this.applyRules(bankAccountId, user) : undefined;
    return { batchId, total: data.length, imported: result, skipped: data.length - result, rules };
  }

  async ignoreTransaction(id: string, ignore: boolean, user: AuthUser) {
    const res = await this.prisma.bankTransaction.updateMany({
      where: { id, bankAccount: { companyId: user.companyId }, status: ignore ? BankTransactionStatus.PENDING : BankTransactionStatus.IGNORED },
      data: { status: ignore ? BankTransactionStatus.IGNORED : BankTransactionStatus.PENDING },
    });
    if (res.count === 0) throw new UnprocessableEntityException(ignore ? 'Solo se ignoran movimientos pendientes' : 'El movimiento no está ignorado');
    return this.prisma.bankTransaction.findUniqueOrThrow({ where: { id } });
  }

  // ------------------------------------------------------------------
  // Categorizar: crea el asiento de un movimiento que no está en libros
  // (comisiones, intereses, cargos) y lo deja conciliado con él
  // ------------------------------------------------------------------
  async categorize(txId: string, dto: CategorizeDto, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const { companyId } = user;
      const bt = await tx.bankTransaction.findFirst({ where: { id: txId, bankAccount: { companyId } }, include: { bankAccount: true } });
      if (!bt) throw new NotFoundException('Movimiento no encontrado');
      const base = (await tx.company.findUniqueOrThrow({ where: { id: companyId } })).baseCurrency;
      if (bt.bankAccount.currency !== base) throw new UnprocessableEntityException('Por ahora solo se categorizan movimientos de cuentas en moneda base');
      const gl = bt.bankAccount.glAccountId;
      if (!gl) throw new UnprocessableEntityException('La cuenta bancaria no tiene cuenta contable asociada');
      if (dto.accountId === gl) throw new UnprocessableEntityException('La contrapartida no puede ser la cuenta del banco');

      const claimed = await tx.bankTransaction.updateMany({ where: { id: txId, bankAccount: { companyId }, status: BankTransactionStatus.PENDING }, data: { status: BankTransactionStatus.MATCHED } });
      if (claimed.count === 0) throw new UnprocessableEntityException(`El movimiento está ${bt.status}; solo se categorizan los pendientes`);

      const amount = bt.amount.abs();
      const inflow = bt.amount.gt(0);
      const entry = await this.posting.post(tx, user, {
        date: bt.date, description: dto.description ?? bt.description, reference: bt.reference ?? undefined,
        journalType: JournalType.BANK, sourceType: SourceDocumentType.BANK_TRANSACTION, sourceId: bt.id,
        lines: [
          { accountId: gl, debit: inflow ? amount : ZERO, credit: inflow ? ZERO : amount, description: bt.description },
          { accountId: dto.accountId, debit: inflow ? ZERO : amount, credit: inflow ? amount : ZERO, description: bt.description },
        ],
      });
      const bankLine = entry.lines.find((l) => l.accountId === gl)!;
      await tx.bankMatch.create({ data: { bankTransactionId: bt.id, journalEntryLineId: bankLine.id, amount: bt.amount } });
      await writeAudit(tx, user, 'BankTransaction', bt.id, AuditAction.UPDATE, { categorizedTo: dto.accountId, entry: entry.number });
      return { transactionId: bt.id, status: BankTransactionStatus.MATCHED, entryId: entry.id, entryNumber: entry.number };
    });
  }

  // ------------------------------------------------------------------
  // Reglas de categorización
  // ------------------------------------------------------------------
  private async assertRuleAccount(companyId: string, accountId: string) {
    const a = await this.prisma.account.findFirst({ where: { id: accountId, companyId } });
    if (!a) throw new NotFoundException('Cuenta contable no encontrada');
    if (!a.active || !a.isPostable) throw new UnprocessableEntityException(`La cuenta ${a.code} está inactiva o no admite movimientos`);
  }

  async createRule(dto: CreateBankRuleDto, user: AuthUser) {
    await this.assertRuleAccount(user.companyId, dto.accountId);
    if (dto.bankAccountId) await this.getBankAccountOrFail(dto.bankAccountId, user);
    return this.prisma.$transaction(async (tx) => {
      const rule = await tx.bankRule.create({ data: { ...dto, companyId: user.companyId } });
      await writeAudit(tx, user, 'BankRule', rule.id, AuditAction.CREATE, { name: rule.name, matchText: rule.matchText });
      return rule;
    });
  }

  listRules(q: ListBankRulesQuery, user: AuthUser) {
    return this.prisma.bankRule.findMany({
      where: { companyId: user.companyId, active: q.active },
      include: { account: { select: { code: true, name: true } } }, orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
  }

  async updateRule(id: string, dto: UpdateBankRuleDto, user: AuthUser) {
    const rule = await this.prisma.bankRule.findFirst({ where: { id, companyId: user.companyId } });
    if (!rule) throw new NotFoundException('Regla no encontrada');
    if (dto.accountId) await this.assertRuleAccount(user.companyId, dto.accountId);
    return this.prisma.$transaction(async (tx) => {
      const upd = await tx.bankRule.update({ where: { id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'BankRule', id, AuditAction.UPDATE, JSON.parse(JSON.stringify(dto)));
      return upd;
    });
  }

  /** Aplica las reglas a los movimientos pendientes. Cada uno va en su propia transacción. */
  async applyRules(bankAccountId: string, user: AuthUser) {
    await this.getBankAccountOrFail(bankAccountId, user);
    const rules = await this.prisma.bankRule.findMany({
      where: { companyId: user.companyId, active: true, OR: [{ bankAccountId: null }, { bankAccountId }] },
      orderBy: [{ priority: 'asc' }, { name: 'asc' }],
    });
    if (!rules.length) return { categorized: 0, failed: [] as { id: string; reason: string }[] };
    const pending = await this.prisma.bankTransaction.findMany({
      where: { bankAccountId, status: BankTransactionStatus.PENDING }, orderBy: { date: 'asc' }, take: 1000,
    });
    let categorized = 0;
    const failed: { id: string; reason: string }[] = [];
    for (const bt of pending) {
      const text = bt.description.toLowerCase();
      const rule = rules.find((r) => text.includes(r.matchText.toLowerCase()));
      if (!rule) continue;
      try {
        await this.categorize(bt.id, { accountId: rule.accountId, description: bt.description }, user);
        categorized++;
      } catch (e) {
        failed.push({ id: bt.id, reason: (e as Error).message });
      }
    }
    return { categorized, failed };
  }

  // ------------------------------------------------------------------
  // Transferencias entre bancos y cajas (misma moneda base)
  // ------------------------------------------------------------------
  async transfer(dto: TransferDto, user: AuthUser) {
    if (dto.fromType === dto.toType && dto.fromId === dto.toId) throw new BadRequestException('Origen y destino son el mismo');
    const base = await this.baseCurrency(user.companyId);
    const load = async (type: 'BANK' | 'CASH', id: string) => {
      const r = type === 'BANK'
        ? await this.prisma.bankAccount.findFirst({ where: { id, companyId: user.companyId } })
        : await this.prisma.cashRegister.findFirst({ where: { id, companyId: user.companyId } });
      if (!r) throw new NotFoundException(type === 'BANK' ? 'Cuenta bancaria no encontrada' : 'Caja no encontrada');
      if (!r.active) throw new UnprocessableEntityException('Origen o destino inactivo');
      if (!r.glAccountId) throw new UnprocessableEntityException('Origen o destino sin cuenta contable asociada');
      if (r.currency !== base) throw new UnprocessableEntityException('Por ahora las transferencias solo aplican a cuentas en moneda base');
      return r.glAccountId;
    };
    const [from, to] = await Promise.all([load(dto.fromType, dto.fromId), load(dto.toType, dto.toId)]);
    const amount = D(dto.amount);
    return this.prisma.$transaction((tx) =>
      this.posting.post(tx, user, {
        date: new Date(dto.date), description: dto.description ?? 'Transferencia entre cuentas', reference: dto.reference,
        journalType: dto.fromType === 'BANK' || dto.toType === 'BANK' ? JournalType.BANK : JournalType.CASH,
        sourceType: SourceDocumentType.OTHER,
        lines: [
          { accountId: to, debit: amount, credit: ZERO, description: 'Transferencia recibida' },
          { accountId: from, debit: ZERO, credit: amount, description: 'Transferencia enviada' },
        ],
      }),
    );
  }
}