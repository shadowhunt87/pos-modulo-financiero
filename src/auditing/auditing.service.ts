import { ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction, EngagementStatus, FindingStatus, UserRole, WorkpaperStatus } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import { AUDIT_TEMPLATES } from './audit-templates.js';
import {
  AddWorkpaperDto, CloseFindingDto, CreateEngagementDto, CreateFindingDto, EngagementStatusDto, FindingResponseDto, ProcedureDto,
  SignOffDto, UpdateEngagementDto, UpdateFindingDto, UpdateWorkpaperDto,
} from './dto/auditing.dto.js';

type Tx = Prisma.TransactionClient;
const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00.000Z`);
const isAuditor = (u: AuthUser) => u.role === UserRole.AUDITOR;
// Transiciones del encargo (PLAN-v0.2 §5.4); volver a IN_PROGRESS desde IN_REVIEW o CLOSED = reabrir con motivo
const NEXT: Record<EngagementStatus, EngagementStatus[]> = {
  PLANNED: ['IN_PROGRESS'], IN_PROGRESS: ['IN_REVIEW'], IN_REVIEW: ['CLOSED', 'IN_PROGRESS'], CLOSED: ['IN_PROGRESS'],
};
/** Eventos sobre la cuenta de la auditora que se le avisan siempre (PLAN-v0.2 §5.6, ANEXO-S0 §3.12). */
const ACCOUNT_EVENTS = ['PASSWORD_RESET_BY_ADMIN', 'TWO_FACTOR_RESET', 'ADMIN_GRANTED'];

/**
 * Encargos, papeles de trabajo, procedimientos y hallazgos de la auditora (PLAN-v0.2 §5, paquetes A1/A2).
 * Lo que escribe la auditora nunca toca la contabilidad. Encargo CLOSED ⇒ todo de solo lectura (422).
 * La gerencia (ADMIN) no ve hallazgos en borrador (D3).
 */
@Injectable()
export class AuditingService {
  constructor(private readonly prisma: PrismaService) {}

  // ------------------------------------------------------------------ utilidades

  private async engagement(id: string, user: AuthUser, db: Tx | PrismaService = this.prisma) {
    const e = await db.auditEngagement.findFirst({ where: { id, companyId: user.companyId } });
    if (!e) throw new NotFoundException('Encargo no encontrado');
    return e;
  }

  private assertOpen(e: { status: EngagementStatus }) {
    if (e.status === EngagementStatus.CLOSED) throw new UnprocessableEntityException('El encargo está cerrado: es de solo lectura. Reábrelo con un motivo para cambiarlo');
  }

  private async workpaper(id: string, user: AuthUser, db: Tx | PrismaService = this.prisma) {
    const w = await db.auditWorkpaper.findFirst({ where: { id, companyId: user.companyId }, include: { engagement: true } });
    if (!w) throw new NotFoundException('Papel de trabajo no encontrado');
    return w;
  }

  /** Nombres de usuarios en una sola consulta filtrada por empresa. */
  async userNames(ids: (string | null | undefined)[], companyId: string) {
    const list = [...new Set(ids.filter((x): x is string => !!x))];
    if (!list.length) return new Map<string, string>();
    const users = await this.prisma.user.findMany({ where: { id: { in: list }, companyId }, select: { id: true, name: true } });
    return new Map(users.map((u) => [u.id, u.name]));
  }

  // ------------------------------------------------------------------ avisos de la cuenta auditora (§5.6)

  /** Cambios que OTRA persona hizo sobre usuarios AUDITOR (clave, 2FA, correo o rol). No se pueden ocultar. */
  async accountNotices(user: AuthUser) {
    const auditors = await this.prisma.user.findMany({ where: { companyId: user.companyId, role: UserRole.AUDITOR }, select: { id: true, name: true } });
    if (!auditors.length) return [];
    const ids = auditors.map((a) => a.id);
    const logs = await this.prisma.auditLog.findMany({
      where: { companyId: user.companyId, entityName: 'User', entityId: { in: ids }, NOT: { userId: { in: ids } } },
      orderBy: { createdAt: 'desc' }, take: 200, include: { user: { select: { name: true } } },
    });
    const name = new Map(auditors.map((a) => [a.id, a.name]));
    const out: { at: Date; by: string; auditor: string; text: string }[] = [];
    for (const l of logs) {
      const c = (l.changes ?? {}) as { event?: string; via?: string; passwordReset?: boolean; before?: { email?: string; role?: string }; after?: { email?: string; role?: string } };
      const by = c.via === 'operator-cli' ? 'el operador del sistema' : l.user.name;
      let text: string | null = null;
      if (c.event === 'TWO_FACTOR_RESET') text = 'restableció la verificación en dos pasos';
      else if (c.event === 'PASSWORD_RESET_BY_ADMIN' || c.passwordReset) text = 'restableció la clave';
      else if (c.event && ACCOUNT_EVENTS.includes(c.event)) text = 'cambió los permisos (administrador)';
      else if (c.before && c.after && c.before.email !== c.after.email) text = `cambió el correo de ${c.before.email} a ${c.after.email}`;
      else if (c.before && c.after && c.before.role !== c.after.role) text = `cambió el rol de ${c.before.role} a ${c.after.role}`;
      if (!text) continue;
      // Una sola línea por acción (E9 deja dos eventos en el mismo instante)
      if (out.some((o) => o.at.getTime() === l.createdAt.getTime() && o.auditor === name.get(l.entityId))) continue;
      out.push({ at: l.createdAt, by, auditor: name.get(l.entityId) ?? '', text });
    }
    return out.map((o) => ({ ...o, message: `${o.by} ${o.text} de la cuenta de ${o.auditor} el ${o.at.toISOString().slice(0, 10)}. Si no lo pediste, no confíes en lo registrado desde entonces y avísalo.` }));
  }

  // ------------------------------------------------------------------ encargos

  async listEngagements(user: AuthUser) {
    const rows = await this.prisma.auditEngagement.findMany({ where: { companyId: user.companyId }, orderBy: { periodStart: 'desc' } });
    const findings = await this.prisma.auditFinding.groupBy({
      by: ['engagementId', 'severity'], where: { companyId: user.companyId, ...(isAuditor(user) ? {} : { status: { not: FindingStatus.DRAFT } }) }, _count: true,
    });
    return rows.map((e) => ({
      ...e, findingsBySeverity: Object.fromEntries(findings.filter((f) => f.engagementId === e.id).map((f) => [f.severity ?? 'NONE', f._count])),
    }));
  }

  async createEngagement(dto: CreateEngagementDto, user: AuthUser) {
    const start = day(dto.periodStart), end = day(dto.periodEnd);
    if (end < start) throw new UnprocessableEntityException('El fin del período debe ser posterior al inicio');
    try {
      return await this.prisma.$transaction(async (tx) => {
        const e = await tx.auditEngagement.create({
          data: { companyId: user.companyId, name: dto.name, periodStart: start, periodEnd: end, objective: dto.objective, scope: dto.scope, auditorFirm: dto.auditorFirm, createdById: user.id },
        });
        for (const [i, area] of [...new Set(dto.areas)].entries()) {
          const t = AUDIT_TEMPLATES[area];
          const w = await tx.auditWorkpaper.create({
            data: { companyId: user.companyId, engagementId: e.id, area, reference: t.reference, title: t.title, objective: t.objective, sortOrder: i },
          });
          await tx.auditProcedure.createMany({ data: t.procedures.map((description, n) => ({ companyId: user.companyId, workpaperId: w.id, description, sortOrder: n })) });
        }
        await writeAudit(tx, user, 'AuditEngagement', e.id, AuditAction.CREATE, { name: e.name, areas: dto.areas });
        return e;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ya hay un encargo para ese mismo período');
      throw err;
    }
  }

  async getEngagement(id: string, user: AuthUser) {
    const e = await this.engagement(id, user);
    const [wps, marks, findings, notices] = await Promise.all([
      this.prisma.auditWorkpaper.groupBy({ by: ['status'], where: { engagementId: id, companyId: user.companyId }, _count: true }),
      this.prisma.auditCheckmark.groupBy({ by: ['entityType'], where: { engagementId: id, companyId: user.companyId }, _count: true }),
      this.prisma.auditFinding.groupBy({
        by: ['status'], where: { engagementId: id, companyId: user.companyId, ...(isAuditor(user) ? {} : { status: { not: FindingStatus.DRAFT } }) }, _count: true,
      }),
      this.accountNotices(user),
    ]);
    const names = await this.userNames([e.createdById, e.closedById], user.companyId);
    return {
      ...e, createdByName: names.get(e.createdById) ?? null, closedByName: e.closedById ? names.get(e.closedById) ?? null : null,
      summary: {
        workpapers: Object.fromEntries(wps.map((w) => [w.status, w._count])),
        marks: Object.fromEntries(marks.map((m) => [m.entityType, m._count])),
        findings: Object.fromEntries(findings.map((f) => [f.status, f._count])),
      },
      accountNotices: notices,
    };
  }

  async updateEngagement(id: string, dto: UpdateEngagementDto, user: AuthUser) {
    const e = await this.engagement(id, user);
    this.assertOpen(e);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.auditEngagement.update({ where: { id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'AuditEngagement', id, AuditAction.UPDATE, { ...dto });
      return r;
    });
  }

  async changeStatus(id: string, dto: EngagementStatusDto, user: AuthUser) {
    const e = await this.engagement(id, user);
    if (!NEXT[e.status].includes(dto.status)) throw new UnprocessableEntityException(`No se puede pasar de ${e.status} a ${dto.status}`);
    const reopen = dto.status === EngagementStatus.IN_PROGRESS && (e.status === EngagementStatus.IN_REVIEW || e.status === EngagementStatus.CLOSED);
    if (reopen && !dto.reason?.trim()) throw new UnprocessableEntityException('Para reabrir escribe el motivo: queda en la bitácora');
    if (dto.status === EngagementStatus.CLOSED) {
      const [pending, drafts] = await Promise.all([
        this.prisma.auditWorkpaper.count({ where: { engagementId: id, companyId: user.companyId, status: { not: WorkpaperStatus.DONE } } }),
        this.prisma.auditFinding.count({ where: { engagementId: id, companyId: user.companyId, status: FindingStatus.DRAFT } }),
      ]);
      if (pending || drafts) {
        throw new UnprocessableEntityException(`Para cerrar faltan: ${[pending ? `${pending} área(s) sin terminar` : '', drafts ? `${drafts} hallazgo(s) en borrador (comunícalos o bórralos)` : ''].filter(Boolean).join(' y ')}`);
      }
    }
    return this.prisma.$transaction(async (tx) => {
      const closing = dto.status === EngagementStatus.CLOSED;
      const r = await tx.auditEngagement.update({
        where: { id, companyId: user.companyId },
        data: {
          status: dto.status, ...(closing ? { closedById: user.id, closedAt: new Date() } : {}),
          ...(reopen ? { reopenReason: dto.reason, closedById: null, closedAt: null } : {}),
        },
      });
      await writeAudit(tx, user, 'AuditEngagement', id, AuditAction.UPDATE, { status: { from: e.status, to: dto.status }, ...(reopen ? { reopenReason: dto.reason } : {}) });
      return r;
    });
  }

  async deleteEngagement(id: string, user: AuthUser) {
    const e = await this.engagement(id, user);
    if (e.status !== EngagementStatus.PLANNED) throw new UnprocessableEntityException('Solo se borra un encargo en planificación');
    const [findings, marks, files, done] = await Promise.all([
      this.prisma.auditFinding.count({ where: { engagementId: id, companyId: user.companyId } }),
      this.prisma.auditCheckmark.count({ where: { engagementId: id, companyId: user.companyId } }),
      this.prisma.auditFile.count({ where: { engagementId: id, companyId: user.companyId } }),
      this.prisma.auditProcedure.count({ where: { companyId: user.companyId, workpaper: { engagementId: id }, done: true } }),
    ]);
    if (findings || marks || files || done) throw new UnprocessableEntityException('El encargo ya tiene trabajo (hallazgos, marcas, archivos o procedimientos hechos): no se borra');
    await this.prisma.$transaction(async (tx) => {
      await tx.auditProcedure.deleteMany({ where: { companyId: user.companyId, workpaper: { engagementId: id } } });
      await tx.auditWorkpaper.deleteMany({ where: { companyId: user.companyId, engagementId: id } });
      await tx.auditEngagement.deleteMany({ where: { id, companyId: user.companyId } });
      await writeAudit(tx, user, 'AuditEngagement', id, AuditAction.DELETE, { name: e.name });
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------ papeles y procedimientos

  async listWorkpapers(engagementId: string, user: AuthUser) {
    await this.engagement(engagementId, user);
    const rows = await this.prisma.auditWorkpaper.findMany({
      where: { engagementId, companyId: user.companyId }, orderBy: [{ sortOrder: 'asc' }, { reference: 'asc' }],
      include: { procedures: { orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }] }, _count: { select: { checkmarks: true, findings: true, files: true } } },
    });
    const names = await this.userNames(rows.flatMap((w) => [w.preparedById, w.reviewedById, ...w.procedures.map((p) => p.doneById)]), user.companyId);
    return rows.map((w) => ({
      ...w, preparedByName: w.preparedById ? names.get(w.preparedById) ?? null : null, reviewedByName: w.reviewedById ? names.get(w.reviewedById) ?? null : null,
      procedures: w.procedures.map((p) => ({ ...p, doneByName: p.doneById ? names.get(p.doneById) ?? null : null })),
    }));
  }

  async addWorkpaper(engagementId: string, dto: AddWorkpaperDto, user: AuthUser) {
    const e = await this.engagement(engagementId, user);
    this.assertOpen(e);
    const t = AUDIT_TEMPLATES[dto.area];
    const count = await this.prisma.auditWorkpaper.count({ where: { engagementId, companyId: user.companyId } });
    try {
      return await this.prisma.$transaction(async (tx) => {
        const w = await tx.auditWorkpaper.create({
          data: { companyId: user.companyId, engagementId, area: dto.area, reference: dto.reference ?? `${t.reference}${count + 1}`, title: dto.title ?? t.title, objective: t.objective, sortOrder: count },
        });
        await tx.auditProcedure.createMany({ data: t.procedures.map((description, n) => ({ companyId: user.companyId, workpaperId: w.id, description, sortOrder: n })) });
        await writeAudit(tx, user, 'AuditWorkpaper', w.id, AuditAction.CREATE, { area: dto.area, reference: w.reference });
        return w;
      });
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException('Ya hay un papel con esa referencia en el encargo');
      throw err;
    }
  }

  async updateWorkpaper(id: string, dto: UpdateWorkpaperDto, user: AuthUser) {
    const w = await this.workpaper(id, user);
    this.assertOpen(w.engagement);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.auditWorkpaper.update({ where: { id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'AuditWorkpaper', id, AuditAction.UPDATE, { ...dto });
      return r;
    });
  }

  /** PREPARED / REVIEWED. Avisa (no impide) si revisa la misma persona que preparó. */
  async signOff(id: string, dto: SignOffDto, user: AuthUser) {
    const w = await this.workpaper(id, user);
    this.assertOpen(w.engagement);
    if (dto.step === 'REVIEWED' && !w.preparedById) throw new UnprocessableEntityException('Primero hay que marcarlo como preparado');
    const now = new Date();
    const r = await this.prisma.$transaction(async (tx) => {
      const u = await tx.auditWorkpaper.update({
        where: { id, companyId: user.companyId },
        data: dto.step === 'PREPARED' ? { preparedById: user.id, preparedAt: now, status: w.status === 'PENDING' ? 'IN_PROGRESS' : w.status } : { reviewedById: user.id, reviewedAt: now, status: 'DONE' },
      });
      await writeAudit(tx, user, 'AuditWorkpaper', id, AuditAction.APPROVE, { signOff: dto.step });
      return u;
    });
    const warning = dto.step === 'REVIEWED' && w.preparedById === user.id ? 'Lo revisaste tú misma después de prepararlo: lo ideal es que revise otra persona.' : null;
    return { ...r, warning };
  }

  async addProcedure(workpaperId: string, dto: ProcedureDto, user: AuthUser) {
    const w = await this.workpaper(workpaperId, user);
    this.assertOpen(w.engagement);
    if (!dto.description?.trim()) throw new UnprocessableEntityException('Describe el procedimiento');
    return this.prisma.$transaction(async (tx) => {
      const n = await tx.auditProcedure.count({ where: { workpaperId, companyId: user.companyId } });
      const p = await tx.auditProcedure.create({ data: { companyId: user.companyId, workpaperId, description: dto.description!, sortOrder: dto.sortOrder ?? n } });
      await writeAudit(tx, user, 'AuditProcedure', p.id, AuditAction.CREATE, { description: p.description });
      return p;
    });
  }

  private async procedure(id: string, user: AuthUser) {
    const p = await this.prisma.auditProcedure.findFirst({ where: { id, companyId: user.companyId }, include: { workpaper: { include: { engagement: true } } } });
    if (!p) throw new NotFoundException('Procedimiento no encontrado');
    this.assertOpen(p.workpaper.engagement);
    return p;
  }

  async updateProcedure(id: string, dto: ProcedureDto, user: AuthUser) {
    const p = await this.procedure(id, user);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.auditProcedure.update({
        where: { id, companyId: user.companyId },
        data: { ...dto, ...(dto.done === true && !p.done ? { doneById: user.id, doneAt: new Date() } : dto.done === false ? { doneById: null, doneAt: null } : {}) },
      });
      await writeAudit(tx, user, 'AuditProcedure', id, AuditAction.UPDATE, { ...dto });
      return r;
    });
  }

  async deleteProcedure(id: string, user: AuthUser) {
    await this.procedure(id, user);
    await this.prisma.$transaction(async (tx) => {
      await tx.auditProcedure.deleteMany({ where: { id, companyId: user.companyId } });
      await writeAudit(tx, user, 'AuditProcedure', id, AuditAction.DELETE);
    });
    return { ok: true };
  }

  // ------------------------------------------------------------------ hallazgos (A2)

  async listFindings(engagementId: string, user: AuthUser) {
    await this.engagement(engagementId, user);
    const rows = await this.prisma.auditFinding.findMany({
      where: { engagementId, companyId: user.companyId, ...(isAuditor(user) ? {} : { status: { not: FindingStatus.DRAFT } }) },
      orderBy: { number: 'asc' }, include: { _count: { select: { files: true } } },
    });
    const names = await this.userNames(rows.flatMap((f) => [f.createdById, f.respondedById]), user.companyId);
    return rows.map((f) => ({ ...f, code: `H-${String(f.number).padStart(3, '0')}`, respondedByName: f.respondedById ? names.get(f.respondedById) ?? null : null }));
  }

  private async finding(id: string, user: AuthUser) {
    const f = await this.prisma.auditFinding.findFirst({ where: { id, companyId: user.companyId }, include: { engagement: true } });
    // La gerencia no sabe que existe un borrador: 404 igual que si no existiera
    if (!f || (!isAuditor(user) && f.status === FindingStatus.DRAFT)) throw new NotFoundException('Hallazgo no encontrado');
    return f;
  }

  async createFinding(engagementId: string, dto: CreateFindingDto, user: AuthUser) {
    const e = await this.engagement(engagementId, user);
    this.assertOpen(e);
    if (dto.workpaperId) await this.workpaper(dto.workpaperId, user);
    return this.prisma.$transaction(async (tx) => {
      // Número correlativo en la MISMA transacción (el incremento atómico evita números repetidos)
      const { nextFindingNumber } = await tx.auditEngagement.update({ where: { id: engagementId, companyId: user.companyId }, data: { nextFindingNumber: { increment: 1 } }, select: { nextFindingNumber: true } });
      const f = await tx.auditFinding.create({
        data: { ...dto, amount: dto.amount ?? null, companyId: user.companyId, engagementId, number: nextFindingNumber - 1, createdById: user.id },
      });
      await writeAudit(tx, user, 'AuditFinding', f.id, AuditAction.CREATE, { number: f.number, title: f.title });
      return f;
    });
  }

  async updateFinding(id: string, dto: UpdateFindingDto, user: AuthUser) {
    const f = await this.finding(id, user);
    this.assertOpen(f.engagement);
    if (f.status === FindingStatus.RESOLVED || f.status === FindingStatus.RISK_ACCEPTED) throw new UnprocessableEntityException('El hallazgo ya está cerrado: no se cambia');
    if (dto.workpaperId) await this.workpaper(dto.workpaperId, user);
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.auditFinding.update({ where: { id, companyId: user.companyId }, data: dto });
      await writeAudit(tx, user, 'AuditFinding', id, AuditAction.UPDATE, { ...dto });
      return r;
    });
  }

  async communicate(id: string, user: AuthUser) {
    const f = await this.finding(id, user);
    this.assertOpen(f.engagement);
    if (f.status !== FindingStatus.DRAFT) throw new UnprocessableEntityException('Solo se comunica un hallazgo en borrador');
    return this.setStatus(f.id, FindingStatus.DRAFT, { status: FindingStatus.COMMUNICATED }, user, 'COMMUNICATED');
  }

  /** Respuesta de la gerencia (solo ADMIN, D4): desde COMMUNICATED o RESPONDED. */
  async respond(id: string, dto: FindingResponseDto, user: AuthUser) {
    if (user.role !== UserRole.ADMIN) throw new ForbiddenException();
    const f = await this.finding(id, user);
    this.assertOpen(f.engagement);
    if (f.status !== FindingStatus.COMMUNICATED && f.status !== FindingStatus.RESPONDED) throw new UnprocessableEntityException('Este hallazgo no espera respuesta de la gerencia');
    return this.setStatus(f.id, f.status, {
      status: FindingStatus.RESPONDED, managementResponse: dto.managementResponse, actionPlan: dto.actionPlan, responsible: dto.responsible,
      dueDate: dto.dueDate ? day(dto.dueDate) : null, respondedById: user.id, respondedAt: new Date(),
    }, user, 'RESPONDED');
  }

  async close(id: string, dto: CloseFindingDto, user: AuthUser) {
    const f = await this.finding(id, user);
    this.assertOpen(f.engagement);
    if (f.status !== FindingStatus.COMMUNICATED && f.status !== FindingStatus.RESPONDED) throw new UnprocessableEntityException('Solo se cierra un hallazgo comunicado o respondido');
    return this.setStatus(f.id, f.status, { status: dto.status, closeNote: dto.note }, user, dto.status);
  }

  private async setStatus(id: string, from: FindingStatus, data: Prisma.AuditFindingUpdateManyMutationInput, user: AuthUser, event: string) {
    return this.prisma.$transaction(async (tx) => {
      const r = await tx.auditFinding.updateMany({ where: { id, companyId: user.companyId, status: from }, data });
      if (r.count === 0) throw new ConflictException('El hallazgo cambió mientras tanto; recarga');
      await writeAudit(tx, user, 'AuditFinding', id, AuditAction.UPDATE, { status: event });
      return tx.auditFinding.findFirstOrThrow({ where: { id, companyId: user.companyId } });
    });
  }

  async deleteFinding(id: string, user: AuthUser) {
    const f = await this.finding(id, user);
    this.assertOpen(f.engagement);
    if (f.status !== FindingStatus.DRAFT) throw new UnprocessableEntityException('Solo se borra un hallazgo en borrador');
    const files = await this.prisma.auditFile.count({ where: { findingId: id, companyId: user.companyId } });
    if (files) throw new UnprocessableEntityException('Quita primero sus archivos');
    await this.prisma.$transaction(async (tx) => {
      await tx.auditFinding.deleteMany({ where: { id, companyId: user.companyId, status: FindingStatus.DRAFT } });
      await writeAudit(tx, user, 'AuditFinding', id, AuditAction.DELETE, { number: f.number });
    });
    return { ok: true };
  }
}
