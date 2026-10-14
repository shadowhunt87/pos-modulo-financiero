import { Injectable, NotFoundException } from '@nestjs/common';
import {
  FiscalPeriodStatus, InvoiceStatus, InvoiceType, JournalEntryStatus, JournalType, PartnerType, PaymentStatus,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { AccountingService } from '../modules/accounting/accounting.service.js';
import { DgiiService } from '../dgii/dgii.service.js';
import type { SettingsKey } from '../masters/accounting-settings/accounting-settings.service.js';
import { PeriodCloseQuery } from './dto/guidance.dto.js';

/**
 * Qué cuenta como "listo" en cada grupo del arranque. En un solo lugar para que las contadoras
 * lo ajusten (PLAN-v0.2 §9.3). Las cuentas automáticas son las que piden facturación y cobros
 * (settings.require en invoicing.service.ts y payments.service.ts).
 */
const REQUIRED_SETTINGS: { key: SettingsKey; name: string }[] = [
  { key: 'receivableAccountId', name: 'Cuentas por cobrar' },
  { key: 'payableAccountId', name: 'Cuentas por pagar' },
  { key: 'salesIncomeAccountId', name: 'Ingresos por ventas' },
  { key: 'purchaseExpenseAccountId', name: 'Gastos de compras' },
  { key: 'customerAdvanceAccountId', name: 'Anticipos de clientes' },
  { key: 'supplierAdvanceAccountId', name: 'Anticipos a proveedores' },
];
// Diarios que usa el motor de asientos (posting.service.ts) al contabilizar documentos
const REQUIRED_JOURNALS: { type: JournalType; name: string }[] = [
  { type: JournalType.GENERAL, name: 'General' }, { type: JournalType.SALES, name: 'Ventas' },
  { type: JournalType.PURCHASES, name: 'Compras' }, { type: JournalType.BANK, name: 'Bancos' }, { type: JournalType.CASH, name: 'Caja' },
];
// Comprobantes con los que se puede vender (ver invoicing.service.ts); las notas no cuentan como "para vender"
const SALES_NCF = ['B01', 'B02', 'B12', 'B14', 'B15', 'B16', 'E31', 'E32', 'E44', 'E45', 'E46'];

export interface SetupGroup { key: string; title: string; done: boolean; reason: string; route: string }
export interface FlowStep { key: string; title: string; done: boolean; detail: string; route: string | null }
export interface CloseCheck { key: string; title: string; ok: boolean; detail: string; route: string }

const startOfUtcDay = (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const list = (xs: string[]) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`);

/**
 * Guía para el usuario nuevo: qué le falta para arrancar, en qué paso va una factura y qué revisar
 * antes de cerrar un mes. Solo lee: los servicios de reportes y DGII se inyectan, no se copian.
 */
@Injectable()
export class GuidanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly dgii: DgiiService,
  ) {}

  // ------------------------------------------------------------------
  // Arranque en 5 grupos
  // ------------------------------------------------------------------
  async setupStatus(user: AuthUser): Promise<{ done: number; total: number; groups: SetupGroup[] }> {
    const { companyId } = user;
    const today = startOfUtcDay(new Date());
    const [company, year, accounts, unclassified, settings, itbis, journals, sequences, banks, cashes, customers, sale] = await Promise.all([
      this.prisma.company.findUniqueOrThrow({ where: { id: companyId } }),
      this.prisma.fiscalYear.findFirst({ where: { companyId, status: FiscalPeriodStatus.OPEN, startDate: { lte: today }, endDate: { gte: today } } }),
      this.prisma.account.count({ where: { companyId, active: true } }),
      this.prisma.account.count({ where: { companyId, active: true, isPostable: true, category: null } }),
      this.prisma.accountingSettings.findUnique({ where: { companyId } }),
      this.prisma.taxRate.count({ where: { companyId, active: true, type: 'ITBIS', isWithholding: false, salesAccountId: { not: null } } }),
      this.prisma.journal.findMany({ where: { companyId, active: true }, select: { type: true } }),
      this.prisma.ncfSequence.findMany({ where: { companyId, active: true, ncfType: { in: SALES_NCF } } }),
      this.prisma.bankAccount.count({ where: { companyId, active: true } }),
      this.prisma.cashRegister.count({ where: { companyId, active: true } }),
      this.prisma.partner.count({ where: { companyId, active: true, type: { in: [PartnerType.CUSTOMER, PartnerType.BOTH] } } }),
      this.prisma.invoice.count({ where: { companyId, type: InvoiceType.SALE, status: { notIn: [InvoiceStatus.DRAFT, InvoiceStatus.VOIDED] } } }),
    ]);

    // 1. Tu empresa
    const companyMissing = [
      ...(company.name.trim() ? [] : ['el nombre']),
      ...(/^(\d{9}|\d{11})$/.test(company.taxId) ? [] : ['el RNC (9 u 11 dígitos, sin guiones)']),
      ...(company.address ? [] : ['la dirección']),
    ];
    const g1: SetupGroup = {
      key: 'company', title: 'Tu empresa',
      done: !companyMissing.length && !!year,
      reason: companyMissing.length
        ? `Falta ${list(companyMissing)} de la empresa.`
        : !year ? `Falta crear el año fiscal que incluye hoy (${ymd(today)}).` : `Datos completos y año fiscal "${year.name}" abierto.`,
      route: companyMissing.length ? '/company' : '/fiscal-years',
    };

    // 2. Tu contabilidad lista
    const missingSettings = REQUIRED_SETTINGS.filter((s) => !settings?.[s.key]).map((s) => s.name);
    const have = new Set(journals.map((j) => j.type));
    const missingJournals = REQUIRED_JOURNALS.filter((j) => !have.has(j.type)).map((j) => j.name);
    let g2reason = 'Plan de cuentas, cuentas automáticas, ITBIS y diarios listos.';
    let g2route = '/accounting-settings';
    if (!accounts) { g2reason = 'Todavía no tienes plan de cuentas.'; g2route = '/accounts'; }
    else if (unclassified) { g2reason = `${unclassified} cuenta(s) que reciben movimientos no tienen clasificación: sin ella los reportes y el semáforo salen incompletos.`; g2route = '/account-classification'; }
    else if (missingSettings.length) g2reason = `Faltan cuentas automáticas: ${list(missingSettings)}.`;
    else if (!itbis) { g2reason = 'Falta el ITBIS de ventas con su cuenta contable.'; g2route = '/tax-rates'; }
    else if (missingJournals.length) { g2reason = `Faltan diarios: ${list(missingJournals)}.`; g2route = '/journals'; }
    const g2: SetupGroup = {
      key: 'accounting', title: 'Tu contabilidad lista',
      done: !!accounts && !unclassified && !missingSettings.length && !!itbis && !missingJournals.length,
      reason: g2reason, route: g2route,
    };

    // 3. Comprobantes fiscales: al menos una secuencia para vender, vigente y con números
    const usable = sequences.filter((s) => s.currentNumber < s.rangeEnd && (!s.expirationDate || s.expirationDate >= today));
    const g3: SetupGroup = {
      key: 'ncf', title: 'Tus comprobantes fiscales (NCF)', done: usable.length > 0,
      reason: usable.length
        ? `Puedes vender con ${list(usable.map((s) => s.ncfType))}.`
        : sequences.length ? 'Tus secuencias para vender están vencidas o agotadas: renueva una.' : 'Falta registrar el rango de NCF que te autorizó la DGII.',
      route: '/ncf',
    };

    // 4. Dónde entra el dinero
    const g4: SetupGroup = {
      key: 'money', title: 'Dónde entra el dinero', done: banks + cashes > 0,
      reason: banks + cashes > 0 ? `${banks} cuenta(s) de banco y ${cashes} caja(s).` : 'Falta una cuenta de banco o una caja para registrar cobros y pagos.',
      route: '/bank-accounts',
    };

    // 5. Tu primera factura
    const g5: SetupGroup = {
      key: 'firstInvoice', title: 'Tu primera factura', done: customers > 0 && sale > 0,
      reason: sale > 0 ? 'Ya emitiste tu primera factura de venta.' : customers > 0 ? 'Ya tienes clientes: emite tu primera factura.' : 'Crea un cliente y emite tu primera factura.',
      route: '/invoices/new',
    };

    const groups = [g1, g2, g3, g4, g5];
    return { done: groups.filter((g) => g.done).length, total: groups.length, groups };
  }

  // ------------------------------------------------------------------
  // En qué paso va una factura
  // ------------------------------------------------------------------
  async invoiceFlow(id: string, user: AuthUser) {
    const inv = await this.prisma.invoice.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        paymentAllocations: { include: { payment: { select: { id: true, number: true, status: true, journalEntry: { select: { reconciled: true } } } } } },
      },
    });
    if (!inv) throw new NotFoundException('Factura no encontrada');
    const draft = inv.status === InvoiceStatus.DRAFT;
    const voided = inv.status === InvoiceStatus.VOIDED;
    const payments = inv.paymentAllocations.filter((a) => a.payment.status === PaymentStatus.POSTED).map((a) => a.payment);
    const paid = !draft && !voided && inv.balance.lte(0);
    const pendingRecon = payments.filter((p) => !p.journalEntry?.reconciled);
    const sales = inv.type === InvoiceType.SALE || inv.type === InvoiceType.DEBIT_NOTE;
    const steps: FlowStep[] = [
      { key: 'created', title: 'Creada', done: true, detail: draft ? 'Es un borrador: aún no tiene número, NCF ni asiento.' : `Número ${inv.number}.`, route: null },
      {
        key: 'issued', title: 'Emitida', done: !draft,
        detail: draft ? 'Emítela para asignarle el NCF y generar el asiento.' : inv.ncf ? `NCF ${inv.ncf}.` : 'Emitida.',
        route: draft ? `/invoices/${inv.id}` : null,
      },
      {
        key: 'paymentApplied', title: sales ? 'Con cobro aplicado' : 'Con pago aplicado', done: inv.amountPaid.gt(0),
        detail: inv.amountPaid.gt(0) ? `Aplicado ${inv.amountPaid.toFixed(2)} de ${inv.total.minus(inv.withholdingTotal).toFixed(2)}.` : `Todavía no tiene ${sales ? 'cobros' : 'pagos'}.`,
        route: inv.amountPaid.gt(0) || draft || voided ? null : '/payments/new',
      },
      {
        key: 'paid', title: sales ? 'Cobrada completa' : 'Pagada completa', done: paid,
        detail: paid ? 'Saldo en cero.' : draft || voided ? '—' : `Saldo pendiente ${inv.balance.toFixed(2)}.`,
        route: paid || draft || voided ? null : '/payments/new',
      },
      {
        // Conciliada: cada cobro o pago aplicado ya aparece en el banco. Si se saldó solo con notas de crédito, no hay banco
        key: 'reconciled', title: 'Conciliada con el banco', done: paid && pendingRecon.length === 0,
        detail: !paid ? 'Se concilia cuando esté saldada.'
          : !payments.length ? 'Se saldó sin movimiento de banco (nota de crédito).'
            : pendingRecon.length ? `Falta conciliar ${list(pendingRecon.map((p) => p.number ?? 'un pago'))}.` : 'Todo conciliado.',
        route: paid && pendingRecon.length ? '/reconciliations' : null,
      },
    ];
    const current = voided ? null : steps.find((s) => !s.done)?.key ?? null;
    return { invoiceId: inv.id, number: inv.number, status: inv.status, voided, current, steps };
  }

  // ------------------------------------------------------------------
  // Antes de cerrar un mes
  // ------------------------------------------------------------------
  async periodClose(q: PeriodCloseQuery, user: AuthUser) {
    const { companyId } = user;
    const period = await this.prisma.fiscalPeriod.findFirst({ where: { id: q.periodId, companyId } });
    if (!period) throw new NotFoundException('Período no encontrado');
    const range = { gte: period.startDate, lte: period.endDate };

    const [pendingEntries, draftInvoices, unreconciled, trial] = await Promise.all([
      this.prisma.journalEntry.count({ where: { companyId, status: JournalEntryStatus.DRAFT, date: range } }),
      this.prisma.invoice.count({ where: { companyId, status: InvoiceStatus.DRAFT, issueDate: range } }),
      this.prisma.bankTransaction.count({ where: { bankAccount: { companyId }, date: range, reconciled: false, status: { not: 'IGNORED' } } }),
      this.accounting.trialBalance({ from: ymd(period.startDate), to: ymd(period.endDate) }, user),
    ]);

    // Avisos del 606/607 de cada mes del período (un período suele ser un mes)
    const months: string[] = [];
    for (let d = new Date(Date.UTC(period.startDate.getUTCFullYear(), period.startDate.getUTCMonth(), 1)); d <= period.endDate && months.length < 12;
      d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1))) {
      months.push(d.toISOString().slice(0, 7));
    }
    // Los errores de la empresa (p. ej. RNC) salen en ambos reportes y en cada mes: se cuentan una vez
    const errors = new Set<string>();
    const warnings = new Set<string>();
    for (const m of months) {
      for (const r of [await this.dgii.report606(m, user), await this.dgii.report607(m, user)]) {
        for (const e of r.errors) errors.add(`${e.invoiceId}|${e.message}`);
        for (const w of r.warnings) warnings.add(`${w.invoiceId}|${w.message}`);
      }
    }
    const dgiiErrors = errors.size;
    const dgiiWarnings = warnings.size;
    const firstErrors = [...new Set([...errors].map((e) => e.slice(e.indexOf('|') + 1)))].slice(0, 3);

    const checks: CloseCheck[] = [
      {
        key: 'pendingEntries', title: 'Asientos pendientes de aprobar', ok: pendingEntries === 0,
        detail: pendingEntries ? `Hay ${pendingEntries} asiento(s) esperando aprobación: apruébalos o recházalos.` : 'Ninguno pendiente.',
        route: '/entries',
      },
      {
        key: 'draftInvoices', title: 'Facturas en borrador', ok: draftInvoices === 0,
        detail: draftInvoices ? `Hay ${draftInvoices} factura(s) en borrador con fecha de este mes: emítelas o elimínalas.` : 'Ninguna en borrador.',
        route: '/invoices',
      },
      {
        key: 'bankReconciliation', title: 'Bancos conciliados', ok: unreconciled === 0,
        detail: unreconciled ? `Hay ${unreconciled} movimiento(s) de banco sin conciliar en el mes.` : 'Todos los movimientos del mes están conciliados.',
        route: '/reconciliations',
      },
      {
        key: 'trialBalance', title: 'Balanza cuadrada', ok: trial.balanced,
        detail: trial.balanced ? `Débitos y créditos del mes cuadran (${trial.totalDebit.toFixed(2)}).`
          : `No cuadra: débitos ${trial.totalDebit.toFixed(2)}, créditos ${trial.totalCredit.toFixed(2)}.`,
        route: '/reports',
      },
      {
        key: 'dgii', title: 'Reportes 606 y 607 sin errores', ok: dgiiErrors === 0,
        detail: dgiiErrors
          ? `${dgiiErrors} error(es) que impiden generar el archivo. Por ejemplo: ${firstErrors.join('; ')}.`
          : dgiiWarnings ? `Sin errores; ${dgiiWarnings} aviso(s) para revisar.` : 'Sin errores ni avisos.',
        route: '/dgii',
      },
    ];
    return {
      period: { id: period.id, name: period.name, startDate: period.startDate, endDate: period.endDate, status: period.status },
      closed: period.status === FiscalPeriodStatus.CLOSED,
      ready: checks.every((c) => c.ok),
      checks,
    };
  }
}
