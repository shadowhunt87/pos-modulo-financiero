import { Injectable } from '@nestjs/common';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FiscalProfileService } from './fiscal-profile.service.js';

export interface FiscalAlert { code: string; level: 'info' | 'warn' | 'neg'; text: string; link: string | null; linkText: string | null }
/** Fuentes extra de avisos (calendario fiscal, comprobantes): se registran desde otros módulos (N5). */
export interface FiscalAlertSource { alerts(user: AuthUser): Promise<FiscalAlert[]> }

/** Avisos fiscales permanentes del Panel (PLAN-v0.3 §5.3, §6; N5 suma calendario y comprobantes). */
@Injectable()
export class FiscalAlertsService {
  private readonly sources: FiscalAlertSource[] = [];
  constructor(private readonly prisma: PrismaService, private readonly profile: FiscalProfileService) {}

  register(source: FiscalAlertSource) { this.sources.push(source); }

  async list(user: AuthUser): Promise<FiscalAlert[]> {
    const out: FiscalAlert[] = [];
    const p = await this.profile.get(user);
    if (!p.complete) {
      out.push({ code: 'PROFILE_INCOMPLETE', level: 'warn', text: 'Completa los datos fiscales de tu empresa para saber qué te toca', link: '/company/fiscal', linkText: 'Completar' });
    } else if (!p.closingMonthAllowed) {
      out.push({ code: 'CLOSING_MONTH', level: 'info', text: 'El cierre de tu año fiscal no es uno de los que admite la DGII (marzo, junio, septiembre o diciembre). Revísalo con tu contadora', link: '/company', linkText: 'Ver empresa' });
    }
    const unlinked = await this.prisma.taxRate.count({
      where: { companyId: user.companyId, active: true, parameterKey: null, type: { in: ['ITBIS', 'ITBIS_WITHHOLDING', 'ISR_WITHHOLDING'] } },
    });
    if (unlinked) {
      out.push({
        code: 'TAX_UNLINKED', level: 'warn', link: '/tax-rates', linkText: 'Revisar impuestos',
        text: `${unlinked} ${unlinked === 1 ? 'impuesto no está enlazado' : 'impuestos no están enlazados'} con los valores oficiales: si la DGII cambia la tasa, no se actualiza solo`,
      });
    }
    for (const s of this.sources) out.push(...(await s.alerts(user)));
    return out;
  }
}
