import { Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { dateOnly, dmy, FISCAL_MIN_DATE } from './fiscal-dates.js';

type Tx = Prisma.TransactionClient;
export type ParameterStatus = 'OFICIAL' | 'POR_VALIDAR';

/** Lo que devuelve `valueAt`: el valor vigente de una clave en una fecha. */
export interface ResolvedParameter {
  id: string; key: string; kind: string; value: Prisma.Decimal | null; valueDate: Date | null; valueJson: Prisma.JsonValue | null;
  base: 'ITBIS' | 'SUBTOTAL' | 'TOTAL' | null; status: ParameterStatus; validFrom: Date; source: string; revision: number;
}

/** Nombre legible de una clave para los mensajes (cuando no hay, la clave misma). */
const KEY_LABEL: Record<string, string> = {
  ITBIS_TASA_GENERAL: 'ITBIS tasa general', ITBIS_TASA_REDUCIDA: 'ITBIS tasa reducida', ITBIS_TASA_EXPORTACION: 'ITBIS exportaciones',
  RET_ISR_HONORARIOS_PF: 'Retención ISR honorarios', RET_ISR_ALQUILER_PF: 'Retención ISR alquileres',
  F607_UMBRAL_DETALLE_CONSUMO: 'Umbral del 607 para facturas de consumo',
  TSS_AFP_EMPLEADO: 'AFP del empleado', TSS_AFP_EMPLEADOR: 'AFP del empleador', TSS_SFS_EMPLEADO: 'SFS del empleado',
  TSS_SFS_EMPLEADOR: 'SFS del empleador', TSS_SRL_EMPLEADOR: 'Riesgos laborales', INFOTEP_EMPLEADOR: 'INFOTEP',
  TSS_SALARIO_MINIMO_COTIZABLE: 'Salario mínimo cotizable de la TSS', ISR_ASALARIADOS_ESCALA: 'Escala del ISR de asalariados',
};
export const keyLabel = (key: string) => KEY_LABEL[key] ?? key;

/**
 * Parámetros fiscales con vigencia (PLAN-v0.3 §5.1-§5.2, R9). Solo LECTURA: este servicio no tiene métodos que
 * cambien o borren filas (la carga la hace el cargador, que solo inserta; la base además lo impide con un trigger).
 */
@Injectable()
export class FiscalParametersService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Valor vigente de `key` en `date`: descarta las filas reemplazadas por una revisión y toma la de mayor
   * validFrom ≤ fecha y mayor revisión. Sin valor → 422 (nunca hay un valor por defecto en el código).
   */
  async valueAt(key: string, date: Date, tx?: Tx): Promise<ResolvedParameter> {
    const db = tx ?? this.prisma;
    const day = dateOnly(date);
    if (day < FISCAL_MIN_DATE) throw new UnprocessableEntityException('El sistema tiene valores fiscales desde el 01/01/2025');
    const row = await db.fiscalParameter.findFirst({
      where: { key, validFrom: { lte: day }, supersededBy: { is: null } },
      orderBy: [{ validFrom: 'desc' }, { revision: 'desc' }],
      include: { _count: { select: { validations: true } } },
    });
    if (!row) throw new UnprocessableEntityException(`No hay un valor vigente de '${keyLabel(key)}' para el ${dmy(day)}; avísanos`);
    return {
      id: row.id, key: row.key, kind: row.kind, value: row.value, valueDate: row.valueDate, valueJson: row.valueJson,
      base: row.base, status: row._count.validations > 0 ? 'OFICIAL' : 'POR_VALIDAR', validFrom: row.validFrom,
      source: row.source, revision: row.revision,
    };
  }

  /** Igual que valueAt pero sin error: null si no hay valor (para avisos y reportes que siguen sin él). */
  async tryValueAt(key: string, date: Date, tx?: Tx): Promise<ResolvedParameter | null> {
    try { return await this.valueAt(key, date, tx); } catch (e) { if (e instanceof UnprocessableEntityException) return null; throw e; }
  }

  /** Valor numérico de un parámetro RATE/AMOUNT/DAYS; 422 si la clave dejó de aplicar (NONE). */
  async numberAt(key: string, date: Date, tx?: Tx) {
    const p = await this.valueAt(key, date, tx);
    if (p.kind === 'NONE') throw new UnprocessableEntityException(`'${keyLabel(key)}' no aplica desde el ${dmy(p.validFrom)} (${p.source})`);
    if (p.value === null) throw new UnprocessableEntityException(`'${keyLabel(key)}' no tiene un valor numérico; avísanos`);
    return { ...p, value: p.value };
  }

  /** Todas las claves con su valor vigente en la fecha (pantalla «Valores fiscales»). */
  async list(date: Date) {
    const day = dateOnly(date);
    const rows = await this.prisma.fiscalParameter.findMany({
      where: { supersededBy: { is: null } },
      orderBy: [{ key: 'asc' }, { validFrom: 'desc' }, { revision: 'desc' }],
      include: { _count: { select: { validations: true } } },
    });
    const groups = new Map<string, typeof rows>();
    for (const r of rows) groups.set(r.key, [...(groups.get(r.key) ?? []), r]);
    const byKey = [...groups.values()].map((g) => {
      // g viene de la fecha más nueva a la más vieja
      const current = g.find((r) => r.validFrom <= day) ?? g[g.length - 1];
      const future = g.filter((r) => r.validFrom > day).map((r) => r.validFrom);
      return { ...current, next: future.length ? future[future.length - 1] : null };
    });
    return byKey.map((r) => ({
      id: r.id, key: r.key, label: keyLabel(r.key), kind: r.kind, value: r.value, valueDate: r.valueDate, valueJson: r.valueJson,
      unit: r.unit, base: r.base, validFrom: r.validFrom, revision: r.revision, source: r.source, sourceUrl: r.sourceUrl, notes: r.notes,
      status: (r._count.validations > 0 ? 'OFICIAL' : 'POR_VALIDAR') as ParameterStatus,
      inForce: r.validFrom <= day, nextChange: r.next,
    }));
  }

  /** Historial completo de una clave, con revisiones y validaciones. */
  async history(key: string) {
    const rows = await this.prisma.fiscalParameter.findMany({
      where: { key }, orderBy: [{ validFrom: 'desc' }, { revision: 'desc' }],
      include: { validations: { select: { validatedBy: true, validatedAt: true, note: true } }, supersededBy: { select: { id: true } } },
    });
    if (!rows.length) throw new NotFoundException('Parámetro fiscal no encontrado');
    return rows.map(({ supersededBy, validations, ...r }) => ({
      ...r, label: keyLabel(r.key), validations, replaced: !!supersededBy,
      status: (validations.length > 0 ? 'OFICIAL' : 'POR_VALIDAR') as ParameterStatus,
    }));
  }
}
