import { Inject, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit, UnprocessableEntityException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { EcfStatus } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { FILE_STORAGE, type FileStorage } from '../attachments/file-storage.js';
import { FiscalAlertsService, type FiscalAlert } from '../fiscal/fiscal-alerts.service.js';
import { FiscalParametersService } from '../fiscal/fiscal-parameters.service.js';
import { EcfConnectionService } from './ecf-connection.service.js';
import { EcfUnavailableError, type EcfOutcome } from './providers/provider.js';
import { buildPayload, payloadToXml } from './providers/payload.js';

const QUEUE: EcfStatus[] = [EcfStatus.PENDING_SEND, EcfStatus.CONTINGENCY, EcfStatus.SENDING];
const FINAL: Record<Exclude<EcfOutcome, 'IN_PROCESS'>, EcfStatus> = { ACCEPTED: EcfStatus.ACCEPTED, ACCEPTED_CONDITIONAL: EcfStatus.ACCEPTED_CONDITIONAL, REJECTED: EcfStatus.REJECTED };

/**
 * Cola de envío de e-CF (PLAN-v0.3 §7.2, §7.5). El trabajador toma los documentos por (status, nextAttemptAt), los
 * marca SENDING de forma atómica (dos instancias no envían el mismo), llama al proveedor y guarda estado, XML y eventos.
 * Proveedor caído → CONTINGENCIA con reintentos crecientes; el Panel avisa y se pone en rojo a ECF_AVISO_ROJO_HORAS.
 */
@Injectable()
export class EcfSenderService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger('EcfSender');
  private timer: NodeJS.Timeout | null = null;
  private busy = false;
  private lastError: string | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly conn: EcfConnectionService,
    private readonly params: FiscalParametersService,
    private readonly alertsSvc: FiscalAlertsService,
    private readonly config: ConfigService,
    @Inject(FILE_STORAGE) private readonly storage: FileStorage,
  ) {}

  onModuleInit() {
    this.alertsSvc.register({ alerts: (u) => this.alerts(u) });
    const enabled = (this.config.get<string>('ECF_WORKER_ENABLED') ?? 'true') !== 'false' && !process.env.VITEST;
    if (!enabled) return;
    const every = Number(this.config.get('ECF_WORKER_INTERVAL_MS') ?? 30_000);
    // Un error en una vuelta (base caída, migración pendiente) no puede tumbar la aplicación: se anota y se reintenta.
    this.timer = setInterval(() => {
      this.tick().then(() => { this.lastError = null; }, (e: unknown) => {
        const msg = (e as Error).message.split('\n').filter(Boolean).pop() ?? String(e);
        if (msg !== this.lastError) this.log.error(`Falló la cola de e-CF (se reintenta cada ${every / 1000} s): ${msg}`);
        this.lastError = msg;
      });
    }, every);
    this.timer.unref();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Una vuelta del trabajador (también la usan las pruebas y el botón «Reintentar ahora»). */
  async tick(limit = 20) {
    if (this.busy) return 0;
    this.busy = true;
    let n = 0;
    try {
      const due = await this.prisma.ecfDocument.findMany({
        where: { origin: 'EMITTED', status: { in: QUEUE }, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] },
        orderBy: { createdAt: 'asc' }, take: limit, select: { id: true, status: true },
      });
      for (const d of due) {
        // Reserva atómica: solo uno lo toma
        const claim = await this.prisma.ecfDocument.updateMany({ where: { id: d.id, status: d.status, OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }] }, data: { status: EcfStatus.SENDING, nextAttemptAt: new Date(Date.now() + 10 * 60_000) } });
        if (!claim.count) continue;
        await this.process(d.id).catch((e: unknown) => this.log.error(`e-CF ${d.id}: ${(e as Error).message}`));
        n++;
      }
    } finally { this.busy = false; }
    return n;
  }

  private backoff(attempts: number) { return new Date(Date.now() + Math.min(2 ** attempts, 60) * 60_000); }

  private async event(companyId: string, id: string, kind: string, message?: string | null) {
    await this.prisma.ecfEvent.create({ data: { companyId, ecfDocumentId: id, kind, message: message?.slice(0, 2000) ?? null } });
  }

  private async process(id: string) {
    const doc = await this.prisma.ecfDocument.findUniqueOrThrow({
      where: { id },
      include: {
        invoice: {
          include: {
            partner: { select: { name: true, taxId: true, country: true } }, relatedInvoice: { select: { ncf: true, issueDate: true } },
            lines: { include: { taxRate: { select: { parameterKey: true, rate: true } } } }, withholdings: { include: { taxRate: { select: { type: true } } } },
          },
        },
      },
    });
    const companyId = doc.companyId;
    try {
      const { provider, ctx } = await this.conn.context(companyId);
      let result;
      if (doc.trackId) {
        result = await provider.status({ trackId: doc.trackId, eNcf: doc.eNcf }, ctx);
      } else {
        const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { taxId: true, name: true, legalName: true, address: true } });
        const seq = doc.invoice.ncfType ? await this.prisma.ncfSequence.findFirst({ where: { companyId, ncfType: doc.invoice.ncfType }, select: { expirationDate: true } }) : null;
        const [g, r] = await Promise.all([this.params.tryValueAt('ITBIS_TASA_GENERAL', doc.invoice.issueDate), this.params.tryValueAt('ITBIS_TASA_REDUCIDA', doc.invoice.issueDate)]);
        const payload = buildPayload(doc.invoice, company, doc.eNcf.startsWith('PEND-') ? null : doc.eNcf, seq?.expirationDate ?? null, { general: g?.value?.toString() ?? null, reduced: r?.value?.toString() ?? null });
        result = await provider.send(payload, ctx);
        await this.event(companyId, id, 'SENT', `Enviado a ${provider.label}`);
        if (!result.xml) result.xml = payloadToXml(payload);
      }
      const xmlKey = result.xml ? `${companyId}/ecf-xml/${randomUUID()}.xml` : null;
      if (xmlKey && result.xml) await this.storage.save(xmlKey, Buffer.from(result.xml, 'utf8'));
      const eNcf = 'eNcf' in result && result.eNcf ? result.eNcf : null;
      if (result.outcome === 'IN_PROCESS') {
        await this.prisma.ecfDocument.update({ where: { id, companyId }, data: { status: EcfStatus.SENDING, trackId: ('trackId' in result ? result.trackId : null) ?? doc.trackId, attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 2 * 60_000), sentAt: doc.sentAt ?? new Date(), ...(xmlKey ? { xmlFileUrl: xmlKey } : {}) } });
        return;
      }
      const status = FINAL[result.outcome];
      await this.prisma.$transaction(async (tx) => {
        await tx.ecfDocument.update({
          where: { id, companyId },
          data: {
            status, trackId: ('trackId' in result ? result.trackId : null) ?? doc.trackId, securityCode: result.securityCode ?? null, lastError: status === EcfStatus.REJECTED ? (result.message ?? 'Rechazado') : null,
            attempts: { increment: 1 }, nextAttemptAt: null, resolvedAt: new Date(), sentAt: doc.sentAt ?? new Date(), contingencySince: null, ...(xmlKey ? { xmlFileUrl: xmlKey } : {}),
            ...(eNcf && doc.eNcf.startsWith('PEND-') ? { eNcf } : {}),
          },
        });
        // Numeración del proveedor: el e-NCF llega con la respuesta
        if (eNcf && doc.eNcf.startsWith('PEND-')) await tx.invoice.updateMany({ where: { id: doc.invoiceId, companyId }, data: { ncf: eNcf } });
      });
      await this.event(companyId, id, result.outcome, result.message);
    } catch (e) {
      const unavailable = e instanceof EcfUnavailableError;
      await this.prisma.ecfDocument.update({
        where: { id, companyId },
        data: { status: unavailable ? EcfStatus.CONTINGENCY : EcfStatus.PENDING_SEND, attempts: { increment: 1 }, nextAttemptAt: this.backoff(doc.attempts + 1), lastError: (e as Error).message.slice(0, 1000), contingencySince: unavailable ? (doc.contingencySince ?? new Date()) : doc.contingencySince },
      });
      await this.event(companyId, id, unavailable ? 'CONTINGENCY' : 'ERROR', (e as Error).message);
    }
  }

  // ------------------------------------------------------------------ bandeja

  async list(user: AuthUser, status?: string) {
    return this.prisma.ecfDocument.findMany({
      where: { companyId: user.companyId, ...(status ? { status: status as EcfStatus } : {}) }, orderBy: { createdAt: 'desc' }, take: 200,
      select: {
        id: true, eNcf: true, ecfType: true, status: true, origin: true, verification: true, attempts: true, lastError: true, contingencySince: true, sentAt: true, resolvedAt: true, createdAt: true, trackId: true,
        invoice: { select: { id: true, number: true, total: true, issueDate: true, partner: { select: { name: true } } } },
        events: { orderBy: { createdAt: 'desc' }, take: 10, select: { kind: true, message: true, createdAt: true } },
      },
    });
  }

  async retry(user: AuthUser, id: string) {
    const d = await this.prisma.ecfDocument.findFirst({ where: { id, companyId: user.companyId } });
    if (!d) throw new NotFoundException('e-CF no encontrado');
    if (d.origin !== 'EMITTED' || !QUEUE.includes(d.status)) throw new UnprocessableEntityException('Este e-CF no está pendiente de envío');
    await this.prisma.ecfDocument.updateMany({ where: { id, companyId: user.companyId }, data: { nextAttemptAt: new Date(0) } });
    await this.event(user.companyId, id, 'RETRY', 'Reintento manual');
    await this.tick();
    return this.prisma.ecfDocument.findFirstOrThrow({ where: { id, companyId: user.companyId }, select: { status: true, lastError: true } });
  }

  // ------------------------------------------------------------------ avisos del Panel

  async alerts(user: AuthUser): Promise<FiscalAlert[]> {
    const out: FiscalAlert[] = [];
    const [cont, rejected] = await Promise.all([
      this.prisma.ecfDocument.findMany({ where: { companyId: user.companyId, status: EcfStatus.CONTINGENCY }, select: { contingencySince: true }, orderBy: { contingencySince: 'asc' } }),
      this.prisma.ecfDocument.count({ where: { companyId: user.companyId, status: EcfStatus.REJECTED, resolvedAt: { gte: new Date(Date.now() - 30 * 86_400_000) } } }),
    ]);
    if (cont.length) {
      const since = cont[0].contingencySince ?? new Date();
      const hours = (Date.now() - since.getTime()) / 3_600_000;
      const [red, max] = await Promise.all([this.params.tryValueAt('ECF_AVISO_ROJO_HORAS', new Date()), this.params.tryValueAt('ECF_CONTINGENCIA_MAX_HORAS', new Date())]);
      const isRed = red?.value ? hours >= red.value.toNumber() : false;
      out.push({
        code: 'ECF_CONTINGENCY', level: isRed ? 'neg' : 'warn', link: '/ecf/inbox', linkText: 'Ver la bandeja',
        text: `${cont.length} e-CF en contingencia (sin poder enviarse desde hace ${Math.floor(hours)} h). Se reintentan solos${max?.value ? `; el plazo máximo es de ${max.value.toNumber()} h` : ''}. Se imprimen con la leyenda «e-CF emitido en modalidad de contingencia».`,
      });
    }
    if (rejected) out.push({ code: 'ECF_REJECTED', level: 'neg', text: `${rejected} e-CF rechazado(s) en los últimos 30 días: corrígelos y vuelve a emitir`, link: '/ecf/inbox', linkText: 'Ver los rechazos' });
    return out;
  }
}
