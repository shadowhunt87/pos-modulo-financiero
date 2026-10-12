import { ConflictException, Injectable, UnprocessableEntityException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import ExcelJS from 'exceljs';
import { Prisma } from '../generated/prisma/client.js';
import { AuditAction } from '../generated/prisma/enums.js';
import type { AuthUser } from '../auth/types/auth-user.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { isUniqueViolation, writeAudit } from '../common/audit.js';
import type { UploadedFileLike } from '../attachments/file-type.js';
import { AccountClassificationService } from '../masters/account-classification/account-classification.service.js';
import { renderXlsx } from '../exports/xlsx.renderer.js';
import type { TableDoc } from '../exports/table-doc.js';
import {
  CATEGORY_LABEL, COLUMNS, TYPE_LABEL, buildPlan, neutralize, normalNature,
  type ExistingAccount, type ImportPlan, type RawRow,
} from './chart-of-accounts.rules.js';
import { readChartFile, toCsv } from './chart-of-accounts.file.js';
import type { ChartExportFormat } from './dto/chart-of-accounts.dto.js';

type Db = Prisma.TransactionClient | PrismaService;

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const HEADERS = Object.values(COLUMNS) as string[];
/** Cuentas por cada UPDATE en bloque (3 parámetros por cuenta; Postgres admite hasta 65.535). */
const UPDATE_BATCH = 1000;

/**
 * Catálogo estándar de RD (generado desde docs/catalogos/Catalogo_de_Cuentas_Estandar_RD.xlsx con
 * scripts/generar-catalogo-rd.mjs). Se lee una vez y se reutiliza.
 */
let standardRd: RawRow[] | undefined;
function loadStandardRd(): RawRow[] {
  if (!standardRd) {
    const data = JSON.parse(readFileSync(new URL('./templates/catalogo-estandar-rd.json', import.meta.url), 'utf8')) as {
      cuentas: Omit<RawRow, 'fila'>[];
    };
    standardRd = data.cuentas.map((c, i) => ({ fila: i + 1, ...c }));
  }
  return standardRd;
}

/** Lo que se devuelve a la pantalla (sin las listas internas de trabajo). */
const publicPlan = ({ resumen, filas, avisos }: ImportPlan) => ({ resumen, filas, avisos });

@Injectable()
export class ChartOfAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly classification: AccountClassificationService,
  ) {}

  // ------------------------------------------------------------------ exportar

  async exportFile(format: ChartExportFormat, user: AuthUser) {
    const accounts = await this.prisma.account.findMany({ where: { companyId: user.companyId }, orderBy: { code: 'asc' } });
    const byId = new Map(accounts.map((a) => [a.id, a]));
    const level = (a: (typeof accounts)[number]) => {
      let n = 1;
      for (let p = a.parentId, guard = 0; p && guard < 50; p = byId.get(p)?.parentId ?? null, guard++) n++;
      return n;
    };
    // Mismo orden que COLUMNS. Textos neutralizados contra inyección de fórmulas.
    const rows = accounts.map((a) => {
      const nature = a.isContra ? (normalNature(a.type) === 'D' ? 'C' : 'D') : normalNature(a.type);
      return [
        a.code, a.name, String(level(a)),
        !a.isPostable ? 'Control' : a.isContra ? 'Reguladora' : 'Detalle',
        nature === 'D' ? 'Débito' : 'Crédito',
        a.description ?? '', TYPE_LABEL[a.type], a.category ? CATEGORY_LABEL[a.category] : '',
        a.active ? 'Sí' : 'No', a.parentId ? (byId.get(a.parentId)?.code ?? '') : '',
      ].map(neutralize);
    });
    const date = new Date().toISOString().slice(0, 10);
    if (format === 'csv') return { data: toCsv(HEADERS, rows), mime: 'text/csv; charset=utf-8', fileName: `plan-de-cuentas_${date}.csv` };

    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: user.companyId }, select: { name: true, taxId: true } });
    const doc: TableDoc = {
      title: 'Plan de cuentas',
      subtitle: `Exportado el ${date}. Se puede volver a importar tal cual.`,
      company: { name: neutralize(company.name), taxId: company.taxId },
      fileBase: `plan-de-cuentas_${date}`,
      sections: [{
        title: 'Plan de cuentas',
        columns: HEADERS.map((header, i) => ({ header, w: i === 1 ? 3 : i === 5 ? 2 : 1 })),
        rows: rows.map((cells, i) => ({ cells, bold: !accounts[i].isPostable })),
      }],
    };
    return { data: await renderXlsx(doc), mime: XLSX_MIME, fileName: `${doc.fileBase}.xlsx` };
  }

  /** Plantilla vacía con los encabezados y una hoja de instrucciones en español sencillo. */
  async template() {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Plan de cuentas');
    const head = ws.addRow(HEADERS);
    head.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    head.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } }));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    HEADERS.forEach((h, i) => (ws.getColumn(i + 1).width = i === 1 ? 50 : Math.max(h.length + 4, 14)));
    // Código y padre como texto: si no, Excel convierte "1101-01" o "0101" en otra cosa
    ws.getColumn(1).numFmt = '@';
    ws.getColumn(HEADERS.length).numFmt = '@';

    const help = wb.addWorksheet('Instrucciones');
    help.getColumn(1).width = 110;
    const lines: [string, boolean?][] = [
      ['Cómo llenar el plan de cuentas', true],
      [''],
      ['Escribe una cuenta por fila en la hoja "Plan de cuentas". Solo dos columnas son obligatorias: el código y el nombre.'],
      [''],
      ['Qué va en cada columna', true],
      ['1. Código de Cuenta (obligatorio): por ejemplo 1, 11, 1101, 1101-01. El primer dígito dice el tipo: 1 Activo, 2 Pasivo, 3 Patrimonio, 4 Ingresos, 5 Costos, 6 Gastos, 7 Impuesto sobre la renta.'],
      ['2. Nombre / Descripción de la Cuenta (obligatorio): por ejemplo "Caja General". Los espacios al inicio se quitan solos.'],
      ['3. Nivel: informativo, el sistema lo calcula solo.'],
      ['4. Tipo de Cuenta: "Control" para las que agrupan a otras (no reciben movimientos), "Detalle" para las que sí reciben movimientos y "Reguladora" para las que restan (por ejemplo, depreciación acumulada). Si la dejas vacía se toma como Detalle.'],
      ['5. Naturaleza: Débito o Crédito. Si la dejas vacía se toma la normal del tipo.'],
      ['6. Estado Financiero / Formato DGII: nota libre (por ejemplo "Balance General / IT-1"). Se guarda como descripción de la cuenta.'],
      ['7. Tipo (sistema), Categoría, Activa y Cuenta padre: opcionales. Las llena el sistema cuando exportas tu plan; puedes dejarlas vacías.'],
      [''],
      ['Cómo se arma la jerarquía', true],
      ['La cuenta padre sale del código: 1101-03-01 queda dentro de 1101-03, que queda dentro de 1101; 1101 queda dentro de 11 y 11 dentro de 1.'],
      ['Si llenas la columna "Cuenta padre", se usa esa en lugar de la deducida.'],
      [''],
      ['Qué pasa al importar', true],
      ['Primero verás una vista previa: qué cuentas se crean, cuáles se actualizan y cuáles tienen errores. Nada se guarda hasta que confirmes.'],
      ['Si una sola fila tiene error, no se guarda nada: corrígela y vuelve a subir el archivo.'],
      ['Las cuentas que ya existen solo cambian de nombre o de descripción. Nunca se borra ninguna cuenta.'],
      ['Las cuentas de orden (código que empieza con 8) se omiten porque no afectan los estados financieros.'],
      ['Máximo 5.000 filas y 2 MB por archivo. Se acepta Excel (.xlsx) o CSV guardado como "CSV UTF-8".'],
    ];
    for (const [text, bold] of lines) {
      const r = help.addRow([text]);
      r.getCell(1).alignment = { wrapText: true, vertical: 'top' };
      if (bold) r.font = { bold: true, size: 12 };
    }
    return { data: Buffer.from(await wb.xlsx.writeBuffer()), mime: XLSX_MIME, fileName: 'plantilla-plan-de-cuentas.xlsx' };
  }

  // ------------------------------------------------------------------ importar

  /** Lo que ya existe en la empresa, por código (con si tiene movimientos). */
  private async existing(db: Db, companyId: string) {
    const [accounts, moved] = await Promise.all([
      db.account.findMany({
        where: { companyId },
        select: { id: true, code: true, name: true, type: true, parentId: true, description: true, isPostable: true, isContra: true, category: true, active: true },
      }),
      db.journalEntryLine.findMany({ where: { account: { companyId } }, distinct: ['accountId'], select: { accountId: true } }),
    ]);
    const codeOf = new Map(accounts.map((a) => [a.id, a.code]));
    const movedIds = new Set(moved.map((m) => m.accountId));
    return new Map<string, ExistingAccount>(
      accounts.map(({ parentId, ...a }) => [a.code, { ...a, parentCode: parentId ? (codeOf.get(parentId) ?? null) : null, hasMovements: movedIds.has(a.id) }]),
    );
  }

  async previewFile(file: UploadedFileLike | undefined, user: AuthUser) {
    return this.preview(await readChartFile(file), user);
  }

  async importFile(file: UploadedFileLike | undefined, user: AuthUser) {
    return this.apply(await readChartFile(file), user, 'archivo');
  }

  previewStandardRd(user: AuthUser) {
    return this.preview(loadStandardRd(), user);
  }

  importStandardRd(user: AuthUser) {
    return this.apply(loadStandardRd(), user, 'catálogo estándar RD');
  }

  private async preview(rows: RawRow[], user: AuthUser) {
    return publicPlan(buildPlan(rows, await this.existing(this.prisma, user.companyId)));
  }

  /**
   * Aplica en UNA transacción: crea las cuentas nuevas y actualiza nombre/descripción de las existentes.
   * Nunca borra ni cambia tipo o padre. Si hay un solo error, no se guarda nada (todo o nada).
   * Después clasifica las cuentas creadas con la auto-clasificación existente.
   */
  private async apply(rows: RawRow[], user: AuthUser, origen: string) {
    let plan: ImportPlan;
    const createdIds = new Map<string, string>();
    try {
      plan = await this.prisma.$transaction(async (tx) => {
        // El plan se recalcula DENTRO de la transacción: lo que se valida es lo que se guarda
        const existing = await this.existing(tx, user.companyId);
        const p = buildPlan(rows, existing);
        if (p.resumen.errores) {
          throw new UnprocessableEntityException({
            statusCode: 422,
            message: `El archivo tiene ${p.resumen.errores} ${p.resumen.errores === 1 ? 'fila' : 'filas'} con errores. No se guardó nada: corrígelas y vuelve a intentarlo`,
            ...publicPlan(p),
          });
        }
        if (!p.toCreate.length && !p.toUpdate.length) return p;

        const idOf = (code: string | null) => (code ? (createdIds.get(code) ?? existing.get(code)?.id ?? null) : null);
        for (const a of p.toCreate) createdIds.set(a.code, randomUUID());
        // Ya vienen ordenadas (padres antes que hijas)
        await tx.account.createMany({
          data: p.toCreate.map((a) => ({
            id: createdIds.get(a.code)!, companyId: user.companyId, code: a.code, name: a.name, type: a.type,
            parentId: idOf(a.parentCode), isPostable: a.isPostable, isContra: a.isContra, category: a.category,
            cashFlowCategory: a.cashFlowCategory, subledger: a.subledger, description: a.description, active: a.active,
          })),
        });
        // En bloque (una sentencia por cada 1.000 cuentas), parametrizado y siempre dentro de la empresa
        for (let i = 0; i < p.toUpdate.length; i += UPDATE_BATCH) {
          const batch = p.toUpdate.slice(i, i + UPDATE_BATCH);
          const values = Prisma.join(batch.map((u) => Prisma.sql`(${u.id}::text, ${u.after.name}::text, ${u.after.description}::text)`));
          const n = await tx.$executeRaw(Prisma.sql`
            UPDATE "Account" AS a
               SET "name" = v."name", "description" = v."description", "updatedAt" = (now() AT TIME ZONE 'UTC')
              FROM (VALUES ${values}) AS v("id", "name", "description")
             WHERE a."id" = v."id" AND a."companyId" = ${user.companyId}`);
          if (n !== batch.length) throw new ConflictException('Alguien cambió el plan de cuentas al mismo tiempo. Vuelve a intentarlo');
        }
        await writeAudit(tx, user, 'Account', 'import', p.toCreate.length ? AuditAction.CREATE : AuditAction.UPDATE, {
          origen,
          creadas: p.toCreate.map((a) => a.code),
          actualizadas: p.toUpdate.map(({ code, before, after }) => ({ code, before, after })),
          omitidas: p.resumen.omitidas,
        });
        return p;
      }, { timeout: 60_000 });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ConflictException('Alguien cambió el plan de cuentas al mismo tiempo. Vuelve a intentarlo');
      throw e;
    }

    // Las cuentas ya quedaron guardadas: si la clasificación falla no se responde error, se avisa
    let clasificadas = 0;
    const avisos = [...plan.avisos];
    if (createdIds.size) {
      try {
        clasificadas = await this.classifyCreated(plan, user);
      } catch {
        avisos.push('Las cuentas se importaron, pero no se pudieron clasificar para los reportes. Hazlo desde "Clasificación de cuentas para reportes"');
      }
    }
    return { ...publicPlan(plan), avisos, clasificadas };
  }

  /**
   * Categorías de las cuentas recién creadas con la auto-clasificación existente (por palabras del nombre).
   * Se pide la propuesta (apply: false) y se guarda aquí solo para las cuentas creadas por esta importación:
   * no se tocan las demás cuentas de la empresa ni se pierde el isContra que vino del archivo
   * (la auto-clasificación, al aplicar, lo reemplaza por el de su regla).
   */
  private async classifyCreated(plan: ImportPlan, user: AuthUser) {
    const created = new Map(plan.toCreate.map((a) => [a.code, a]));
    const { proposals } = await this.classification.autoClassify({ apply: false }, user);
    const mine = proposals.filter((p) => created.has(p.code));
    if (!mine.length) return 0;
    await this.prisma.$transaction(async (tx) => {
      for (const p of mine) {
        await tx.account.updateMany({
          where: { code: p.code, companyId: user.companyId, category: null },
          data: {
            category: p.category, cashFlowCategory: p.cashFlowCategory, isContra: created.get(p.code)!.isContra || p.isContra,
            ...(p.subledger ? { subledger: p.subledger } : {}),
          },
        });
      }
      await writeAudit(tx, user, 'Account', 'classification', AuditAction.UPDATE, { auto: mine.length, origen: 'importación del plan de cuentas' });
    }, { timeout: 60_000 });
    return mine.length;
  }
}
