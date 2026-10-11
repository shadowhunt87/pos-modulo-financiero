import { BadRequestException, HttpException, HttpStatus, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { writeAudit } from '../common/audit.js';
import { CreateFeedbackDto, ListFeedbackQuery, ListMyFeedbackQuery, UpdateFeedbackDto } from './dto/feedback.dto.js';

/** Tope de comentarios por usuario en una hora (evita que alguien llene la tabla). */
export const MAX_FEEDBACK_PER_HOUR = 20;
const HOUR_MS = 60 * 60_000;
const MAX_USER_AGENT = 500;

// Lo que ve quien lo envió: sin el navegador ni el id del usuario
const MINE_SELECT = {
  id: true, kind: true, message: true, route: true, status: true, response: true, taskRef: true,
  createdAt: true, updatedAt: true,
} satisfies Prisma.FeedbackSelect;

@Injectable()
export class FeedbackService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateFeedbackDto, userAgent: string | undefined, user: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      // Bloquea la fila del usuario: dos envíos simultáneos no pueden saltarse el tope contando a la vez.
      // Se cuenta en la BD (no en memoria) para que el límite sobreviva reinicios y varias réplicas.
      await tx.$queryRaw(
        Prisma.sql`SELECT "id" FROM "User" WHERE "id" = ${user.id} AND "companyId" = ${user.companyId} FOR UPDATE`,
      );
      const recent = await tx.feedback.count({
        where: { companyId: user.companyId, userId: user.id, createdAt: { gte: new Date(Date.now() - HOUR_MS) } },
      });
      if (recent >= MAX_FEEDBACK_PER_HOUR) {
        throw new HttpException(
          `Ya enviaste ${MAX_FEEDBACK_PER_HOUR} comentarios en la última hora. Intenta de nuevo más tarde.`,
          HttpStatus.TOO_MANY_REQUESTS,
        );
      }
      const row = await tx.feedback.create({
        data: {
          companyId: user.companyId,
          userId: user.id,
          kind: dto.kind,
          message: dto.message,
          route: dto.route,
          userAgent: userAgent ? userAgent.slice(0, MAX_USER_AGENT) : null,
        },
        select: MINE_SELECT,
      });
      // En la bitácora no se copia el texto: basta con saber que se envió y de qué tipo
      await writeAudit(tx, user, 'Feedback', row.id, AuditAction.CREATE, { kind: row.kind, route: row.route });
      return row;
    });
  }

  /** Cada usuario ve solo los suyos (también el ADMIN, en "Mis comentarios"). */
  async listMine(q: ListMyFeedbackQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.FeedbackWhereInput = { companyId: user.companyId, userId: user.id };
    const [data, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({
        where, select: MINE_SELECT, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit,
      }),
      this.prisma.feedback.count({ where }),
    ]);
    return { data, total, page, limit };
  }

  /** ADMIN: todos los de su empresa, con quién lo envió y su rol actual. */
  async list(q: ListFeedbackQuery, user: AuthUser) {
    const page = q.page ?? 1;
    const limit = q.limit ?? 50;
    const where: Prisma.FeedbackWhereInput = { companyId: user.companyId, status: q.status, kind: q.kind };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.feedback.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      this.prisma.feedback.count({ where }),
    ]);
    // userId no tiene relación con User (para no tocar ese modelo): se buscan aparte, en la misma empresa
    const users = await this.prisma.user.findMany({
      where: { companyId: user.companyId, id: { in: [...new Set(rows.map((r) => r.userId))] } },
      select: { id: true, name: true, email: true, role: true },
    });
    const byId = new Map(users.map((u) => [u.id, u]));
    const data = rows.map((r) => ({ ...r, user: byId.get(r.userId) ?? null }));
    return { data, total, page, limit };
  }

  async update(id: string, dto: UpdateFeedbackDto, user: AuthUser) {
    if (dto.status === undefined && dto.response === undefined && dto.taskRef === undefined) {
      throw new BadRequestException('Indica al menos un cambio: estado, respuesta o referencia de tarea');
    }
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.feedback.findFirst({
        where: { id, companyId: user.companyId },
        select: { status: true, response: true, taskRef: true },
      });
      if (!before) throw new NotFoundException('Comentario no encontrado');
      // "" borra igual que null: el formulario manda el campo vacío
      const data: Prisma.FeedbackUpdateInput = {
        status: dto.status,
        response: dto.response === undefined ? undefined : dto.response || null,
        taskRef: dto.taskRef === undefined ? undefined : dto.taskRef || null,
      };
      const row = await tx.feedback.update({ where: { id, companyId: user.companyId }, data });
      await writeAudit(tx, user, 'Feedback', id, AuditAction.UPDATE, {
        before, after: { status: row.status, response: row.response, taskRef: row.taskRef },
      });
      return row;
    });
  }
}
