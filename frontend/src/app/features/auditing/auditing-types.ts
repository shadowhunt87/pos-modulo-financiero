/** Respuestas de /auditing (backend src/auditing). */
export interface AccountNotice { at: string; by: string; auditor: string; text: string; message: string }
export interface Engagement {
  id: string; name: string; periodStart: string; periodEnd: string; objective: string | null; scope: string | null; auditorFirm: string | null;
  overallConclusion: string | null; status: string; reopenReason: string | null; createdAt: string; closedAt: string | null;
  findingsBySeverity?: Record<string, number>; createdByName?: string | null; closedByName?: string | null;
  summary?: { workpapers: Record<string, number>; marks: Record<string, number>; findings: Record<string, number> }; accountNotices?: AccountNotice[];
}
export interface Procedure { id: string; description: string; done: boolean; result: string | null; doneByName: string | null; doneAt: string | null }
export interface Workpaper {
  id: string; area: string; reference: string; title: string; objective: string | null; conclusion: string | null; status: string;
  preparedByName: string | null; preparedAt: string | null; reviewedByName: string | null; reviewedAt: string | null; procedures: Procedure[];
  _count: { checkmarks: number; findings: number; files: number };
}
export interface Finding {
  id: string; code: string; number: number; kind: string; workpaperId: string | null; title: string; condition: string; criteria: string | null; cause: string | null;
  effect: string | null; recommendation: string | null; severity: string | null; managementResponse: string | null; actionPlan: string | null; responsible: string | null;
  dueDate: string | null; status: string; closeNote: string | null; respondedByName: string | null; includeInReport: boolean; _count: { files: number };
}
export interface ReviewItem {
  id: string; date: string; number: string | null; description: string; amount: string | null; status: string;
  mark: { id: string; mark: string; note: string | null; workpaperId: string | null; at: string } | null; changedAfterReview: boolean;
}
export interface HistoryRow { id: string; action: string; at: string; by: string; changes: unknown }
