import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth-user.js';
import { DgiiService } from '../dgii/dgii.service.js';
import { AccountingService } from '../modules/accounting/accounting.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { BalanceSheetGenerator } from '../reports/generators/balance-sheet.generator.js';
import { CashFlowGenerator } from '../reports/generators/cash-flow.generator.js';
import { FinancialRatiosGenerator } from '../reports/generators/financial-ratios.generator.js';
import { IncomeStatementGenerator } from '../reports/generators/income-statement.generator.js';
import { ReportsService } from '../reports/reports.service.js';
import type { ExportBalanceSheetQuery, ExportDgiiQuery, ExportFormat, ExportPeriodQuery, ExportRangeQuery } from './dto/exports.dto.js';
import * as B from './exports.builders.js';
import { renderPdf } from './pdf.renderer.js';
import type { Section, TableDoc } from './table-doc.js';
import { renderXlsx } from './xlsx.renderer.js';

const MIME: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pdf: 'application/pdf',
};

@Injectable()
export class ExportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly accounting: AccountingService,
    private readonly reports: ReportsService,
    private readonly incomeStatement: IncomeStatementGenerator,
    private readonly balanceSheet: BalanceSheetGenerator,
    private readonly cashFlow: CashFlowGenerator,
    private readonly ratios: FinancialRatiosGenerator,
    private readonly dgii: DgiiService,
  ) {}

  private async company(user: AuthUser) {
    const c = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true, taxId: true } });
    return { name: c.name, taxId: c.taxId };
  }

  /** Convierte el documento al formato pedido */
  async render(doc: TableDoc, format: ExportFormat, opts: { compress?: boolean } = {}) {
    const data = format === 'xlsx' ? await renderXlsx(doc) : await renderPdf(doc, opts);
    return { data, mime: MIME[format], fileName: `${doc.fileBase}.${format}` };
  }

  private async doc(user: AuthUser, title: string, fileBase: string, subtitle: string, sections: Section[]): Promise<TableDoc> {
    return { title, subtitle, fileBase, sections, company: await this.company(user) };
  }

  async trialBalance(q: ExportRangeQuery, user: AuthUser) {
    const r = await this.accounting.trialBalance(q, user);
    return this.doc(user, 'Balanza de comprobación', `balanza-de-comprobacion_${q.to ?? 'todo'}`, B.periodLabel(q.from, q.to), [B.trialBalanceSection(r)]);
  }

  async generalLedger(q: ExportRangeQuery, user: AuthUser) {
    const r = await this.reports.generalLedgerSummary(q, user);
    return this.doc(user, 'Mayor general', `mayor-general_${q.to ?? 'todo'}`, B.periodLabel(q.from, q.to), [B.generalLedgerSection(r)]);
  }

  async incomeStatementDoc(q: ExportPeriodQuery, user: AuthUser) {
    const r = await this.incomeStatement.generate(q, user);
    return this.doc(user, 'Estado de resultados', `estado-de-resultados_${q.from}_${q.to}`, B.periodLabel(q.from, q.to), [B.incomeStatementSection(r)]);
  }

  async balanceSheetDoc(q: ExportBalanceSheetQuery, user: AuthUser) {
    const r = await this.balanceSheet.generate(q, user);
    return this.doc(user, 'Balance general', `balance-general_${q.asOf}`, `Al ${q.asOf.slice(0, 10)}`, [B.balanceSheetSection(r)]);
  }

  async cashFlowDoc(q: ExportPeriodQuery, user: AuthUser) {
    const r = await this.cashFlow.generate(q, user);
    return this.doc(user, 'Estado de flujo de efectivo (método indirecto)', `flujo-de-efectivo_${q.from}_${q.to}`, B.periodLabel(q.from, q.to), [B.cashFlowSection(r)]);
  }

  async ratiosDoc(q: ExportPeriodQuery, user: AuthUser) {
    const r = await this.ratios.generate(q, user);
    return this.doc(user, 'Razones financieras', `razones-financieras_${q.from}_${q.to}`, B.periodLabel(q.from, q.to), B.ratiosSections(r as never));
  }

  async dgiiDoc(form: '606' | '607' | '608', q: ExportDgiiQuery, user: AuthUser) {
    const sub = (period: string) => `Período ${period.slice(0, 4)}-${period.slice(4)}`;
    if (form === '606') {
      const r = await this.dgii.report606(q.period, user);
      return this.doc(user, 'DGII Formato 606 - Compras', `dgii-606_${r.period}`, sub(r.period), B.dgii606Sections(r as never));
    }
    if (form === '607') {
      const r = await this.dgii.report607(q.period, user);
      return this.doc(user, 'DGII Formato 607 - Ventas', `dgii-607_${r.period}`, sub(r.period), B.dgii607Sections(r as never));
    }
    const r = await this.dgii.report608(q.period, user);
    return this.doc(user, 'DGII Formato 608 - Comprobantes anulados', `dgii-608_${r.period}`, sub(r.period), B.dgii608Sections(r as never));
  }
}
