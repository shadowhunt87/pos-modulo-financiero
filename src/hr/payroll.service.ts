import { randomUUID } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import {
  AuditAction, EmployeeStatus, JournalType, PayFrequency, PayrollConceptKind, PayrollRunStatus, PayrollRunType, SourceDocumentType,
} from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { DocumentSequencesService } from '../masters/sequences/document-sequences.service.js';
import { PostingService, type PostLine } from '../posting/posting.service.js';
import { FiscalParametersService } from '../fiscal/fiscal-parameters.service.js';
import { PayrollSettingsService } from './payroll-settings.service.js';
import {
  activeDays, calcLine, daysInclusive, parseIsrScale, periodSalary, r2, type LineResult, type PayrollRates,
} from './payroll-calc.js';
import { CreatePayrollRunDto, ListPayrollRunsQuery, MonthQuery, PayPayrollDto, SetPayrollItemsDto, VoidPayrollDto } from './dto.js';

type Tx = Prisma.TransactionClient;
type Dec = Prisma.Decimal;
const D = (v?: Dec | number | string | null): Dec => new Prisma.Decimal(v === null || v === undefined ? 0 : v);
const ZERO = D(0);
const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
const LIVE: PayrollRunStatus[] = [PayrollRunStatus.DRAFT, PayrollRunStatus.POSTED, PayrollRunStatus.PAID];
const LABEL: Record<PayrollRunType, string> = { REGULAR: 'Nómina', CHRISTMAS_BONUS: 'Regalía pascual' };

/** Claves de Valores fiscales que usa la nómina (docs/normativa-dgii/parametros/2026-10-15_nomina.json). */
const RATE_KEYS = {
  afpEmployee: 'TSS_AFP_EMPLEADO', sfsEmployee: 'TSS_SFS_EMPLEADO', afpEmployer: 'TSS_AFP_EMPLEADOR', sfsEmployer: 'TSS_SFS_EMPLEADOR',
  srlEmployer: 'TSS_SRL_EMPLEADOR', infotepEmployer: 'INFOTEP_EMPLEADOR', minWage: 'TSS_SALARIO_MINIMO_COTIZABLE',
  capAfp: 'TSS_TOPE_AFP_SALARIOS', capSfs: 'TSS_TOPE_SFS_SALARIOS', capSrl: 'TSS_TOPE_SRL_SALARIOS',
} as const;
const ISR_SCALE_KEY = 'ISR_ASALARIADOS_ESCALA';

const RESULT_FIELDS = [
  'salary', 'otherEarnings', 'grossTotal', 'tssBase', 'afpEmployee', 'sfsEmployee', 'isrBase', 'isr', 'otherDeductions', 'netPay',
  'afpEmployer', 'sfsEmployer', 'srlEmployer', 'infotepEmployer',
] as const satisfies readonly (keyof LineResult)[];

/** Asiento agrupado por cuenta, centro de costo y lado. */
class EntryBuilder {
  private readonly items = new Map<string, { accountId: string; costCenterId?: string; dr: boolean; amount: Dec; description: string }>();
  add(accountId: string, amount: Dec, dr: boolean, description: string, costCenterId?: string) {
    if (amount.lte(0)) return;
    const key = `${accountId}|${costCenterId ?? ''}|${dr}`;
    const cur = this.items.get(key);
    if (cur) cur.amount = cur.amount.plus(amount);
    else this.items.set(key, { accountId, costCenterId, dr, amount, description });
  }
  lines(): PostLine[] {
    return [...this.items.values()].map((i) => ({
      accountId: i.accountId, costCenterId: i.costCenterId, description: i.description,
      debit: i.dr ? i.amount : ZERO, credit: i.dr ? ZERO : i.amount,
    }));
  }
}

/**
 * Nómina dominicana (P3, docs/PLAN-catalogo-inventario-rrhh.md): borrador calculado → novedades → contabilizar → pagar,
 * o anular. Los valores legales salen de Valores fiscales vigentes al cierre del período (R9) y quedan guardados en la nómina.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sequences: DocumentSequencesService,
    private readonly posting: PostingService,
    private readonly fiscal: FiscalParametersService,
    private readonly settings: PayrollSettingsService,
  ) {}

  // ------------------------------------------------------------------
  // Valores legales
  // ------------------------------------------------------------------
  private async rates(tx: Tx, companyId: string, date: Date): Promise<{ rates: PayrollRates; snapshot: Prisma.InputJsonValue }> {
    const snapshot: Record<string, unknown>[] = [];
    const values = {} as Record<keyof typeof RATE_KEYS, Dec>;
    for (const [field, key] of Object.entries(RATE_KEYS) as [keyof typeof RATE_KEYS, string][]) {
      const p = await this.fiscal.numberAt(key, date, tx);
      values[field] = p.value;
      snapshot.push({ key, value: p.value.toString(), id: p.id, status: p.status });
    }
    // La tasa de riesgos laborales que la TSS le asignó a la empresa manda sobre la tasa base
    const s = await tx.payrollSettings.findUnique({ where: { companyId }, select: { srlRate: true } });
    if (s?.srlRate) {
      values.srlEmployer = s.srlRate;
      snapshot.push({ key: 'SRL_EMPRESA', value: s.srlRate.toString(), source: 'Configuración de nómina' });
    }
    const scale = await this.fiscal.valueAt(ISR_SCALE_KEY, date, tx);
    let isrScale;
    try {
      isrScale = parseIsrScale(scale.valueJson);
    } catch (e) {
      throw new UnprocessableEntityException(`El valor fiscal ${ISR_SCALE_KEY} no se puede leer (${(e as Error).message}); avísanos`);
    }
    snapshot.push({ key: ISR_SCALE_KEY, id: scale.id, status: scale.status });
    return { rates: { ...values, isrScale }, snapshot: snapshot as Prisma.InputJsonValue };
  }

  // ------------------------------------------------------------------
  // Crear (borrador ya calculado)
  // ------------------------------------------------------------------
  async create(dto: CreatePayrollRunDto, user: AuthUser) {
    const { companyId } = user;
    const type = dto.type ?? PayrollRunType.REGULAR;
    const payDate = day(dto.payDate);
    let frequency: PayFrequency;
    let periodStart: Date, periodEnd: Date;
    if (type === PayrollRunType.CHRISTMAS_BONUS) {
      // Regalía pascual: el año de la fecha de pago (Código de Trabajo art. 219: se paga a más tardar el 20 de diciembre)
      const y = payDate.getUTCFullYear();
      periodStart = new Date(Date.UTC(y, 0, 1));
      periodEnd = new Date(Date.UTC(y, 11, 31));
      frequency = PayFrequency.MONTHLY;
    } else {
      if (!dto.frequency || !dto.periodStart || !dto.periodEnd) throw new BadRequestException('La nómina regular lleva frequency, periodStart y periodEnd');
      frequency = dto.frequency;
      periodStart = day(dto.periodStart);
      periodEnd = day(dto.periodEnd);
      if (periodEnd < periodStart) throw new BadRequestException('El período termina antes de empezar');
      if (daysInclusive(periodStart, periodEnd) > 31) throw new BadRequestException('Un período de nómina no pasa de 31 días');
    }

    const id = await this.prisma.$transaction(async (tx) => {
      // Empleados: los pedidos, o todos los activos de esa frecuencia con días en el período
      const where: Prisma.EmployeeWhereInput = dto.employeeIds?.length
        ? { companyId, id: { in: dto.employeeIds } }
        : {
            companyId, status: { not: EmployeeStatus.SUSPENDED }, hireDate: { lte: periodEnd },
            OR: [{ terminationDate: null }, { terminationDate: { gte: periodStart } }],
            ...(type === PayrollRunType.REGULAR ? { payFrequency: frequency } : {}),
          };
      const employees = await tx.employee.findMany({ where, orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }] });
      if (dto.employeeIds?.length && employees.length !== new Set(dto.employeeIds).size) throw new NotFoundException('Algún empleado no existe');
      for (const e of employees) {
        if (e.status === EmployeeStatus.SUSPENDED) throw new UnprocessableEntityException(`${e.firstName} ${e.lastName} está suspendido`);
        if (activeDays(periodStart, periodEnd, e.hireDate, e.terminationDate) === 0) {
          throw new UnprocessableEntityException(`${e.firstName} ${e.lastName} no trabajó en ese período`);
        }
      }
      if (!employees.length) throw new UnprocessableEntityException('No hay empleados para esta nómina');

      // Un empleado no cobra dos veces el mismo período (ni dos regalías el mismo año)
      const clash = await tx.payrollLine.findFirst({
        where: {
          employeeId: { in: employees.map((e) => e.id) },
          run: { companyId, type, status: { in: LIVE }, periodStart: { lte: periodEnd }, periodEnd: { gte: periodStart } },
        },
        include: { employee: { select: { firstName: true, lastName: true } }, run: { select: { number: true } } },
      });
      if (clash) throw new ConflictException(`${clash.employee.firstName} ${clash.employee.lastName} ya está en la nómina ${clash.run.number} de ese período`);

      const { rates, snapshot } = type === PayrollRunType.REGULAR ? await this.rates(tx, companyId, periodEnd) : { rates: null, snapshot: [] };
      const run = await tx.payrollRun.create({
        data: {
          companyId, number: `BORR-${randomUUID().slice(0, 8)}`, type, frequency, periodStart, periodEnd, payDate,
          notes: dto.notes ?? null, parameters: snapshot, createdById: user.id,
        },
      });
      for (const e of employees) {
        const days = activeDays(periodStart, periodEnd, e.hireDate, e.terminationDate);
        const periodDays = daysInclusive(periodStart, periodEnd);
        const salary = type === PayrollRunType.REGULAR
          ? periodSalary(e.baseSalary, frequency).times(days).div(periodDays)
          : await this.christmasBonus(tx, companyId, e, periodStart, periodEnd, days, periodDays);
        const result = calcLine({ frequency, salary, earnings: [], deductions: [], exempt: type !== PayrollRunType.REGULAR }, rates);
        await tx.payrollLine.create({
          data: { runId: run.id, employeeId: e.id, baseSalary: e.baseSalary, periodDays, daysWorked: days, ...this.pick(result) },
        });
      }
      await this.refreshTotals(tx, run.id, companyId);
      await writeAudit(tx, user, 'PayrollRun', run.id, AuditAction.CREATE, {
        type, frequency, periodStart: periodStart.toISOString().slice(0, 10), periodEnd: periodEnd.toISOString().slice(0, 10), employees: employees.length,
      });
      return run.id;
    });
    return this.get(id, user);
  }

  /**
   * Regalía = la doceava parte del salario ordinario pagado en el año (Código de Trabajo art. 219). Con nóminas del año
   * contabilizadas se usa su salario; si no hay, salario mensual × días contratado en el año ÷ días del año.
   */
  private async christmasBonus(tx: Tx, companyId: string, e: { id: string; baseSalary: Dec }, yearStart: Date, yearEnd: Date, days: number, yearDays: number) {
    const paid = await tx.payrollLine.aggregate({
      where: {
        employeeId: e.id,
        run: { companyId, type: PayrollRunType.REGULAR, status: { in: [PayrollRunStatus.POSTED, PayrollRunStatus.PAID] }, periodStart: { gte: yearStart, lte: yearEnd } },
      },
      _sum: { salary: true },
    });
    const ordinary = D(paid._sum.salary);
    return ordinary.gt(0) ? ordinary.div(12) : e.baseSalary.times(12).times(days).div(yearDays).div(12);
  }

  private pick(r: LineResult) {
    return Object.fromEntries(RESULT_FIELDS.map((f) => [f, r[f]])) as Record<(typeof RESULT_FIELDS)[number], Dec>;
  }

  private async refreshTotals(tx: Tx, runId: string, companyId: string) {
    const s = await tx.payrollLine.aggregate({
      where: { runId },
      _sum: { grossTotal: true, afpEmployee: true, sfsEmployee: true, isr: true, otherDeductions: true, netPay: true, afpEmployer: true, sfsEmployer: true, srlEmployer: true, infotepEmployer: true },
    });
    const v = (x: Dec | null) => D(x);
    await tx.payrollRun.update({
      where: { id: runId, companyId },
      data: {
        grossTotal: v(s._sum.grossTotal), employeeTssTotal: v(s._sum.afpEmployee).plus(v(s._sum.sfsEmployee)), isrTotal: v(s._sum.isr),
        otherDeductionsTotal: v(s._sum.otherDeductions), netTotal: v(s._sum.netPay),
        employerTotal: v(s._sum.afpEmployer).plus(v(s._sum.sfsEmployer)).plus(v(s._sum.srlEmployer)).plus(v(s._sum.infotepEmployer)),
      },
    });
  }

  private async draft(tx: Tx, companyId: string, id: string) {
    const run = await tx.payrollRun.findFirst({ where: { id, companyId } });
    if (!run) throw new NotFoundException('Nómina no encontrada');
    if (run.status !== PayrollRunStatus.DRAFT) throw new UnprocessableEntityException('Solo se modifica una nómina en borrador');
    return run;
  }

  /** Recalcula una línea con sus novedades actuales. */
  private async recalcLine(tx: Tx, run: { companyId: string; frequency: PayFrequency; type: PayrollRunType }, lineId: string, rates: PayrollRates | null, salary?: Dec) {
    const line = await tx.payrollLine.findUniqueOrThrow({ where: { id: lineId }, include: { items: { include: { concept: true } } } });
    const result = calcLine({
      frequency: run.frequency, salary: salary ?? line.salary,
      earnings: line.items.filter((i) => i.concept.kind === PayrollConceptKind.EARNING)
        .map((i) => ({ amount: i.amount, affectsTss: i.concept.affectsTss, affectsIsr: i.concept.affectsIsr })),
      deductions: line.items.filter((i) => i.concept.kind === PayrollConceptKind.DEDUCTION).map((i) => i.amount),
      exempt: run.type !== PayrollRunType.REGULAR,
    }, rates);
    if (result.netPay.lt(0)) throw new UnprocessableEntityException('Los descuentos dejan el neto a pagar en negativo');
    await tx.payrollLine.update({ where: { id: lineId, run: { companyId: run.companyId } }, data: this.pick(result) });
  }

  // ------------------------------------------------------------------
  // Novedades y recálculo
  // ------------------------------------------------------------------
  async setItems(runId: string, lineId: string, dto: SetPayrollItemsDto, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const run = await this.draft(tx, user.companyId, runId);
      if (run.type !== PayrollRunType.REGULAR) throw new UnprocessableEntityException('La regalía pascual no lleva novedades');
      const line = await tx.payrollLine.findFirst({ where: { id: lineId, runId } });
      if (!line) throw new NotFoundException('El empleado no está en esta nómina');
      const ids = [...new Set(dto.items.map((i) => i.conceptId))];
      const concepts = await tx.payrollConcept.findMany({ where: { companyId: user.companyId, id: { in: ids } } });
      if (concepts.length !== ids.length) throw new NotFoundException('Algún concepto no existe');
      const off = concepts.filter((c) => !c.active);
      if (off.length) throw new UnprocessableEntityException(`Conceptos inactivos: ${off.map((c) => c.name).join(', ')}`);
      await tx.payrollItem.deleteMany({ where: { lineId } });
      if (dto.items.length) {
        await tx.payrollItem.createMany({
          data: dto.items.map((i) => ({ lineId, conceptId: i.conceptId, amount: r2(D(i.amount)), description: i.description ?? null })),
        });
      }
      const { rates } = await this.rates(tx, user.companyId, run.periodEnd);
      await this.recalcLine(tx, run, lineId, rates);
      await this.refreshTotals(tx, runId, user.companyId);
      await writeAudit(tx, user, 'PayrollRun', runId, AuditAction.UPDATE, { line: lineId, items: dto.items.length });
    });
    return this.get(runId, user);
  }

  /** Vuelve a leer salarios, fechas de ingreso/salida y valores fiscales; conserva las novedades. */
  async recalculate(runId: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const run = await this.draft(tx, user.companyId, runId);
      const regular = run.type === PayrollRunType.REGULAR;
      const { rates, snapshot } = regular ? await this.rates(tx, user.companyId, run.periodEnd) : { rates: null, snapshot: [] };
      const lines = await tx.payrollLine.findMany({ where: { runId }, include: { employee: true } });
      for (const l of lines) {
        const e = l.employee;
        const days = activeDays(run.periodStart, run.periodEnd, e.hireDate, e.terminationDate);
        if (days === 0) throw new UnprocessableEntityException(`${e.firstName} ${e.lastName} ya no tiene días en este período: quítalo creando la nómina de nuevo`);
        const periodDays = daysInclusive(run.periodStart, run.periodEnd);
        const salary = regular
          ? periodSalary(e.baseSalary, run.frequency).times(days).div(periodDays)
          : await this.christmasBonus(tx, user.companyId, e, run.periodStart, run.periodEnd, days, periodDays);
        await tx.payrollLine.update({ where: { id: l.id, run: { companyId: user.companyId } }, data: { baseSalary: e.baseSalary, daysWorked: days, periodDays } });
        await this.recalcLine(tx, run, l.id, rates, salary);
      }
      await tx.payrollRun.update({ where: { id: runId, companyId: user.companyId }, data: { parameters: snapshot } });
      await this.refreshTotals(tx, runId, user.companyId);
      await writeAudit(tx, user, 'PayrollRun', runId, AuditAction.UPDATE, { recalculated: true });
    });
    return this.get(runId, user);
  }

  async remove(runId: string, user: AuthUser) {
    await this.prisma.$transaction(async (tx) => {
      const run = await this.draft(tx, user.companyId, runId);
      await tx.payrollItem.deleteMany({ where: { line: { runId } } });
      await tx.payrollLine.deleteMany({ where: { runId } });
      await tx.payrollRun.delete({ where: { id: runId, companyId: user.companyId } });
      await writeAudit(tx, user, 'PayrollRun', runId, AuditAction.DELETE, { number: run.number });
    });
    return { deleted: true };
  }

  // ------------------------------------------------------------------
  // Contabilizar, pagar, anular
  // ------------------------------------------------------------------
  /**
   * Dr gasto de sueldos (y cuentas de los conceptos de ingreso) + Dr gasto de aportes patronales;
   * Cr TSS por pagar (empleado + empleador + INFOTEP), Cr ISR por pagar, Cr descuentos y Cr sueldos por pagar (neto).
   */
  async post(runId: string, user: AuthUser) {
    const { companyId } = user;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.payrollRun.updateMany({ where: { id: runId, companyId, status: PayrollRunStatus.DRAFT }, data: { status: PayrollRunStatus.POSTED } });
      if (claimed.count === 0) {
        const exists = await tx.payrollRun.findFirst({ where: { id: runId, companyId } });
        if (!exists) throw new NotFoundException('Nómina no encontrada');
        throw new ConflictException('La nómina ya no está en borrador');
      }
      const run = await tx.payrollRun.findUniqueOrThrow({
        where: { id: runId },
        include: { lines: { include: { employee: { select: { costCenterId: true } }, items: { include: { concept: true } } } } },
      });
      if (!run.lines.length) throw new UnprocessableEntityException('La nómina no tiene empleados');
      const needsOther = run.lines.some((l) => l.items.some((i) => i.concept.kind === PayrollConceptKind.DEDUCTION && !i.concept.accountId));
      const acc = await this.settings.require(tx, companyId, [
        'salaryExpenseAccountId', 'salariesPayableAccountId',
        ...(run.employerTotal.gt(0) ? (['employerContributionsExpenseAccountId'] as const) : []),
        ...(run.employerTotal.plus(run.employeeTssTotal).gt(0) ? (['tssPayableAccountId'] as const) : []),
        ...(run.isrTotal.gt(0) ? (['isrPayableAccountId'] as const) : []),
        ...(needsOther ? (['otherDeductionsPayableAccountId'] as const) : []),
      ]);
      const a = acc as Partial<Record<string, string>>;

      const e = new EntryBuilder();
      for (const l of run.lines) {
        const cc = l.employee.costCenterId ?? undefined;
        const employer = l.afpEmployer.plus(l.sfsEmployer).plus(l.srlEmployer).plus(l.infotepEmployer);
        e.add(a.salaryExpenseAccountId!, l.salary, true, LABEL[run.type], cc);
        for (const i of l.items) {
          if (i.concept.kind === PayrollConceptKind.EARNING) e.add(i.concept.accountId ?? a.salaryExpenseAccountId!, i.amount, true, i.concept.name, cc);
          else e.add(i.concept.accountId ?? a.otherDeductionsPayableAccountId!, i.amount, false, i.concept.name);
        }
        if (employer.gt(0)) e.add(a.employerContributionsExpenseAccountId!, employer, true, 'Aportes patronales TSS e INFOTEP', cc);
        e.add(a.tssPayableAccountId ?? '', l.afpEmployee.plus(l.sfsEmployee).plus(employer), false, 'TSS e INFOTEP por pagar');
        e.add(a.isrPayableAccountId ?? '', l.isr, false, 'ISR retenido a asalariados');
        e.add(a.salariesPayableAccountId!, l.netPay, false, 'Sueldos por pagar');
      }
      const number = await this.sequences.next(tx, companyId, 'PAYROLL');
      const span = `${run.periodStart.toISOString().slice(0, 10)} al ${run.periodEnd.toISOString().slice(0, 10)}`;
      const je = await this.posting.post(tx, user, {
        date: run.periodEnd, description: `${LABEL[run.type]} ${number} (${span})`, reference: number,
        journalType: JournalType.GENERAL, sourceType: SourceDocumentType.PAYROLL, sourceId: run.id, lines: e.lines(),
      });
      await tx.payrollRun.update({ where: { id: runId, companyId }, data: { number, journalEntryId: je.id, postedAt: new Date() } });
      await writeAudit(tx, user, 'PayrollRun', runId, AuditAction.POST, { number, entry: je.number, net: run.netTotal.toString() });
    });
    return this.get(runId, user);
  }

  /** Pago del neto desde una cuenta bancaria: Dr sueldos por pagar / Cr banco. */
  async pay(runId: string, dto: PayPayrollDto, user: AuthUser) {
    const { companyId } = user;
    await this.prisma.$transaction(async (tx) => {
      const bank = await tx.bankAccount.findFirst({ where: { id: dto.bankAccountId, companyId } });
      if (!bank) throw new NotFoundException('Cuenta bancaria no encontrada');
      if (!bank.active) throw new UnprocessableEntityException('La cuenta bancaria está inactiva');
      if (!bank.glAccountId) throw new UnprocessableEntityException(`La cuenta bancaria ${bank.bankName} no tiene cuenta contable`);
      const claimed = await tx.payrollRun.updateMany({ where: { id: runId, companyId, status: PayrollRunStatus.POSTED }, data: { status: PayrollRunStatus.PAID } });
      if (claimed.count === 0) {
        const exists = await tx.payrollRun.findFirst({ where: { id: runId, companyId } });
        if (!exists) throw new NotFoundException('Nómina no encontrada');
        throw new ConflictException(exists.status === PayrollRunStatus.DRAFT ? 'Primero contabiliza la nómina' : 'La nómina ya está pagada o anulada');
      }
      const run = await tx.payrollRun.findUniqueOrThrow({ where: { id: runId } });
      const { salariesPayableAccountId } = await this.settings.require(tx, companyId, ['salariesPayableAccountId'] as const);
      const date = dto.date ? day(dto.date) : run.payDate;
      const je = await this.posting.post(tx, user, {
        date, description: `Pago ${LABEL[run.type].toLowerCase()} ${run.number}`, reference: run.number,
        journalType: JournalType.BANK, sourceType: SourceDocumentType.PAYROLL, sourceId: run.id,
        lines: [
          { accountId: salariesPayableAccountId, debit: run.netTotal, credit: ZERO, description: 'Sueldos por pagar' },
          { accountId: bank.glAccountId, debit: ZERO, credit: run.netTotal, description: `${bank.bankName} ${bank.accountNumber}` },
        ],
      });
      await tx.payrollRun.update({ where: { id: runId, companyId }, data: { paymentEntryId: je.id, bankAccountId: bank.id, paidAt: new Date() } });
      await writeAudit(tx, user, 'PayrollRun', runId, AuditAction.UPDATE, { paid: date.toISOString().slice(0, 10), bank: bank.id, entry: je.number });
    });
    return this.get(runId, user);
  }

  /** Anula una nómina contabilizada o pagada: reversa el pago (si lo hay) y la contabilización. Un borrador se elimina. */
  async void(runId: string, dto: VoidPayrollDto, user: AuthUser) {
    const { companyId } = user;
    await this.prisma.$transaction(async (tx) => {
      const run = await tx.payrollRun.findFirst({ where: { id: runId, companyId } });
      if (!run) throw new NotFoundException('Nómina no encontrada');
      if (run.status === PayrollRunStatus.DRAFT) throw new UnprocessableEntityException('Un borrador se elimina, no se anula');
      if (run.status === PayrollRunStatus.VOIDED) throw new ConflictException('La nómina ya está anulada');
      const res = await tx.payrollRun.updateMany({
        where: { id: runId, companyId, status: run.status },
        data: { status: PayrollRunStatus.VOIDED, voidedAt: new Date(), voidReason: dto.reason },
      });
      if (res.count === 0) throw new ConflictException('El estado de la nómina cambió; reintenta');
      const reason = `Anulación ${run.number}: ${dto.reason}`;
      if (run.paymentEntryId) await this.posting.voidEntry(tx, user, run.paymentEntryId, reason);
      if (run.journalEntryId) await this.posting.voidEntry(tx, user, run.journalEntryId, reason);
      await writeAudit(tx, user, 'PayrollRun', runId, AuditAction.VOID, { reason: dto.reason });
    });
    return this.get(runId, user);
  }

  // ------------------------------------------------------------------
  // Consultas y reportes
  // ------------------------------------------------------------------
  async list(q: ListPayrollRunsQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.PayrollRunWhereInput = {
      companyId: user.companyId, status: q.status, type: q.type,
      ...(q.from || q.to ? { payDate: { ...(q.from && { gte: day(q.from) }), ...(q.to && { lte: day(q.to) }) } } : {}),
    };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.payrollRun.findMany({
        where, orderBy: [{ periodStart: 'desc' }, { createdAt: 'desc' }], skip: (page - 1) * limit, take: limit,
        include: { _count: { select: { lines: true } } },
      }),
      this.prisma.payrollRun.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  async get(id: string, user: AuthUser) {
    const run = await this.prisma.payrollRun.findFirst({
      where: { id, companyId: user.companyId },
      include: {
        journalEntry: { select: { id: true, number: true, status: true } },
        paymentEntry: { select: { id: true, number: true, status: true } },
        bankAccount: { select: { id: true, bankName: true, accountNumber: true } },
        lines: {
          include: {
            employee: { select: { id: true, code: true, firstName: true, lastName: true, documentNumber: true, position: true, paymentMethod: true } },
            items: { include: { concept: { select: { id: true, code: true, name: true, kind: true } } } },
          },
          orderBy: [{ employee: { lastName: 'asc' } }, { employee: { firstName: 'asc' } }],
        },
      },
    });
    if (!run) throw new NotFoundException('Nómina no encontrada');
    return run;
  }

  private monthRange(month: string) {
    const [y, m] = month.split('-').map(Number);
    return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 0)) };
  }

  /** Resumen de aportes a la TSS del mes (nóminas regulares contabilizadas o pagadas cuyo período termina en el mes). */
  async tssReport(q: MonthQuery, user: AuthUser) {
    const { from, to } = this.monthRange(q.month);
    const lines = await this.prisma.payrollLine.findMany({
      where: { run: { companyId: user.companyId, type: PayrollRunType.REGULAR, status: { in: [PayrollRunStatus.POSTED, PayrollRunStatus.PAID] }, periodEnd: { gte: from, lte: to } } },
      include: { employee: { select: { id: true, code: true, firstName: true, lastName: true, documentType: true, documentNumber: true, nss: true } } },
    });
    const fields = ['tssBase', 'afpEmployee', 'sfsEmployee', 'afpEmployer', 'sfsEmployer', 'srlEmployer', 'infotepEmployer'] as const;
    const byEmployee = new Map<string, { employee: (typeof lines)[number]['employee']; [k: string]: unknown }>();
    for (const l of lines) {
      const cur = byEmployee.get(l.employeeId) ?? { employee: l.employee, ...Object.fromEntries(fields.map((f) => [f, ZERO])) };
      for (const f of fields) cur[f] = (cur[f] as Dec).plus(l[f]);
      byEmployee.set(l.employeeId, cur);
    }
    const rows = [...byEmployee.values()];
    const totals = Object.fromEntries(fields.map((f) => [f, rows.reduce((s, r) => s.plus(r[f] as Dec), ZERO)]));
    return { month: q.month, rows, totals };
  }

  /** Resumen del IR-3 del mes: ISR retenido a asalariados en las nóminas pagadas o contabilizadas con fecha de pago en el mes. */
  async ir3Report(q: MonthQuery, user: AuthUser) {
    const { from, to } = this.monthRange(q.month);
    const lines = await this.prisma.payrollLine.findMany({
      where: { run: { companyId: user.companyId, status: { in: [PayrollRunStatus.POSTED, PayrollRunStatus.PAID] }, payDate: { gte: from, lte: to } } },
      include: { employee: { select: { id: true, code: true, firstName: true, lastName: true, documentType: true, documentNumber: true } } },
    });
    const byEmployee = new Map<string, { employee: (typeof lines)[number]['employee']; grossTotal: Dec; isrBase: Dec; isr: Dec }>();
    for (const l of lines) {
      const cur = byEmployee.get(l.employeeId) ?? { employee: l.employee, grossTotal: ZERO, isrBase: ZERO, isr: ZERO };
      cur.grossTotal = cur.grossTotal.plus(l.grossTotal); cur.isrBase = cur.isrBase.plus(l.isrBase); cur.isr = cur.isr.plus(l.isr);
      byEmployee.set(l.employeeId, cur);
    }
    const rows = [...byEmployee.values()];
    return {
      month: q.month, rows,
      totals: {
        grossTotal: rows.reduce((s, r) => s.plus(r.grossTotal), ZERO), isrBase: rows.reduce((s, r) => s.plus(r.isrBase), ZERO),
        isr: rows.reduce((s, r) => s.plus(r.isr), ZERO),
      },
    };
  }
}
