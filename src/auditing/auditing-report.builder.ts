import type { Section, TableDoc } from '../exports/table-doc.js';

/**
 * «Informe de revisión» (PLAN-v0.2 §5.5): nunca «dictamen» (D8). Sin cerrar: «BORRADOR — no es el informe final».
 * Solo alfabeto latino (Helvetica del PDF).
 */
const SEVERITY: Record<string, string> = { LOW: 'Baja', MEDIUM: 'Media', HIGH: 'Alta', CRITICAL: 'Critica' };
const STATUS: Record<string, string> = { DRAFT: 'Borrador', COMMUNICATED: 'Comunicado', RESPONDED: 'Respondido', RESOLVED: 'Resuelto', RISK_ACCEPTED: 'Riesgo aceptado' };
const ENG: Record<string, string> = { PLANNED: 'Planificado', IN_PROGRESS: 'En curso', IN_REVIEW: 'En revision', CLOSED: 'Cerrado' };
const WP: Record<string, string> = { PENDING: 'Pendiente', IN_PROGRESS: 'En curso', DONE: 'Terminado' };
const ENTITY: Record<string, string> = { JOURNAL_ENTRY: 'Asientos', INVOICE: 'Facturas', PAYMENT: 'Cobros y pagos', BANK_RECONCILIATION: 'Conciliaciones' };
const latin = (s: string | null | undefined) => (s ?? '').replace(/[≥≤]/g, (c) => (c === '≥' ? '>=' : '<=')).replace(/[“”«»]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, '-');
const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : '');

export interface ReportInput {
  company: { name: string; taxId: string };
  engagement: { name: string; periodStart: Date; periodEnd: Date; auditorFirm: string | null; status: string; objective: string | null; scope: string | null; overallConclusion: string | null; createdAt: Date; closedAt: Date | null };
  workpapers: { reference: string; title: string; status: string; conclusion: string | null; procedures: number; proceduresDone: number; marks: number; preparedBy: string | null; reviewedBy: string | null }[];
  findings: { code: string; title: string; severity: string | null; status: string; condition: string; criteria: string | null; cause: string | null; effect: string | null; recommendation: string | null; managementResponse: string | null; actionPlan: string | null; responsible: string | null; dueDate: Date | null }[];
  marks: { entityType: string; mark: string; count: number }[];
  marksDetail: { entityType: string; entityId: string; mark: string; note: string | null }[];
  accountNotices: { message: string }[];
}

export function buildAuditReport(r: ReportInput): TableDoc {
  const e = r.engagement;
  const sev = (s: string) => r.findings.filter((f) => f.severity === s).length;
  const sections: Section[] = [
    {
      title: 'Resumen',
      columns: [{ header: 'Dato', w: 1.4 }, { header: 'Valor', w: 3 }],
      rows: [
        ['Empresa', latin(r.company.name)], ['RNC', r.company.taxId], ['Encargo', latin(e.name)], ['Periodo', `${d(e.periodStart)} a ${d(e.periodEnd)}`],
        ['Firma', latin(e.auditorFirm) || '-'], ['Estado', ENG[e.status] ?? e.status], ['Creado', d(e.createdAt)], ['Cerrado', d(e.closedAt) || '-'],
        ['Hallazgos', `${r.findings.length} (criticos ${sev('CRITICAL')}, altos ${sev('HIGH')}, medios ${sev('MEDIUM')}, bajos ${sev('LOW')})`],
      ].map((cells) => ({ cells })),
      notes: [e.objective ? `Objetivo: ${latin(e.objective)}` : '', e.scope ? `Alcance: ${latin(e.scope)}` : '', e.overallConclusion ? `Conclusion general: ${latin(e.overallConclusion)}` : ''].filter(Boolean),
    },
    {
      title: 'Alcance por area',
      columns: [{ header: 'Ref.', w: 0.6 }, { header: 'Area', w: 2.2 }, { header: 'Avance', w: 1 }, { header: 'Partidas', w: 0.9 }, { header: 'Preparo', w: 1.4 }, { header: 'Reviso', w: 1.4 }, { header: 'Estado', w: 1 }],
      rows: r.workpapers.map((w) => ({ cells: [w.reference, latin(w.title), `${w.proceduresDone}/${w.procedures}`, { v: w.marks, fmt: 'int' as const }, latin(w.preparedBy) || '-', latin(w.reviewedBy) || '-', WP[w.status] ?? w.status] })),
      notes: r.workpapers.filter((w) => w.conclusion).map((w) => `${w.reference} ${latin(w.title)}: ${latin(w.conclusion)}`),
    },
    {
      title: 'Hallazgos',
      columns: [{ header: 'No.', w: 0.7 }, { header: 'Titulo', w: 3 }, { header: 'Gravedad', w: 0.9 }, { header: 'Estado', w: 1.1 }, { header: 'Responsable', w: 1.3 }, { header: 'Fecha', w: 0.9 }],
      rows: r.findings.map((f) => ({ cells: [f.code, latin(f.title), f.severity ? SEVERITY[f.severity] : '-', STATUS[f.status] ?? f.status, latin(f.responsible) || '-', d(f.dueDate) || '-'] })),
      notes: r.findings.map((f) => [
        `${f.code} ${latin(f.title)}.`, `Condicion: ${latin(f.condition)}`, f.criteria ? `Criterio: ${latin(f.criteria)}` : '', f.cause ? `Causa: ${latin(f.cause)}` : '',
        f.effect ? `Efecto: ${latin(f.effect)}` : '', f.recommendation ? `Recomendacion: ${latin(f.recommendation)}` : '',
        f.managementResponse ? `Respuesta de la gerencia: ${latin(f.managementResponse)}` : '', f.actionPlan ? `Plan de accion: ${latin(f.actionPlan)}` : '',
      ].filter(Boolean).join(' ')),
    },
    {
      title: 'Partidas revisadas',
      columns: [{ header: 'Tipo', w: 2 }, { header: 'Marca', w: 1.4 }, { header: 'Cantidad', w: 1 }, { header: 'Documento', w: 2, xlsxOnly: true }, { header: 'Nota', w: 3, xlsxOnly: true }],
      rows: [
        ...r.marks.map((m) => ({ cells: [ENTITY[m.entityType] ?? m.entityType, m.mark, { v: m.count, fmt: 'int' as const }, '', ''] })),
        ...r.marksDetail.map((m) => ({ cells: [ENTITY[m.entityType] ?? m.entityType, m.mark, null, m.entityId, latin(m.note)] })),
      ],
    },
    {
      title: 'Control de la cuenta auditora',
      columns: [{ header: 'Evento', w: 6 }],
      rows: r.accountNotices.length ? r.accountNotices.map((n) => ({ cells: [latin(n.message)] })) : [{ cells: ['Nadie mas cambio la clave, la verificacion, el correo ni el rol de la cuenta auditora.'] }],
      notes: ['Esta seccion sale siempre y no se puede ocultar: viene de la bitacora del sistema.'],
    },
  ];
  return {
    title: 'Informe de revision', subtitle: e.status === 'CLOSED' ? `${latin(e.name)} - ${d(e.periodStart)} a ${d(e.periodEnd)}` : 'BORRADOR - no es el informe final',
    company: { name: r.company.name, taxId: r.company.taxId }, fileBase: `informe-revision_${d(e.periodStart)}_${d(e.periodEnd)}`, sections,
  };
}
