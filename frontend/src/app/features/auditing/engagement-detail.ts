import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../core/api';
import { Auth } from '../../core/auth';
import { Confirm } from '../../core/confirm';
import { Notify } from '../../core/notify';
import { AUDIT_ENTITY, AUDIT_MARK, ENGAGEMENT_STATUS, FINDING_SEVERITY, FINDING_STATUS, WORKPAPER_STATUS } from '../../shared/labels';
import { UI } from '../../shared/ui';
import { ExportButtons } from '../../shared/ui/export-buttons';
import type { Engagement, Finding, HistoryRow, ReviewItem, Workpaper } from './auditing-types';

type Tab = 'summary' | 'workpapers' | 'items' | 'findings' | 'report';
const NEXT: Record<string, { to: string; label: string }[]> = {
  PLANNED: [{ to: 'IN_PROGRESS', label: 'Empezar el trabajo' }], IN_PROGRESS: [{ to: 'IN_REVIEW', label: 'Pasar a revisión' }],
  IN_REVIEW: [{ to: 'CLOSED', label: 'Cerrar el encargo' }, { to: 'IN_PROGRESS', label: 'Reabrir (con motivo)' }], CLOSED: [{ to: 'IN_PROGRESS', label: 'Reabrir (con motivo)' }],
};
const emptyFinding = () => ({ id: '', title: '', condition: '', criteria: '', cause: '', effect: '', recommendation: '', severity: '', kind: 'FINDING', workpaperId: '' });

/** Detalle del encargo (A3/A5): resumen, papeles de trabajo, partidas revisadas, hallazgos e informe. */
@Component({
  selector: 'app-engagement-detail',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, ExportButtons, ...UI],
  templateUrl: './engagement-detail.html',
  styles: `
    .proc { display: grid; grid-template-columns: auto 1fr; gap: 6px 10px; align-items: start; padding: 6px 0; border-bottom: 1px dashed var(--line); }
    .wp { margin-bottom: 16px; } .wp h3 { margin: 0; font-size: 1rem; }
    .changed { color: var(--warn); font-weight: 600; }
    textarea.input { min-height: 60px; }
  `,
})
export class EngagementDetail {
  private readonly api = inject(Api);
  private readonly notify = inject(Notify);
  private readonly confirm = inject(Confirm);
  private readonly router = inject(Router);
  protected readonly auth = inject(Auth);
  readonly id = input.required<string>();

  protected readonly L = { ENGAGEMENT_STATUS, WORKPAPER_STATUS, FINDING_STATUS, FINDING_SEVERITY, AUDIT_MARK, AUDIT_ENTITY };
  protected readonly MARKS = Object.entries(AUDIT_MARK);
  protected readonly ENTITIES = Object.entries(AUDIT_ENTITY);
  protected readonly SEVERITIES = Object.entries(FINDING_SEVERITY);
  protected readonly isAuditor = this.auth.has('AUDITOR');
  protected readonly tab = signal<Tab>('summary');
  protected readonly tabs = computed<{ id: Tab; label: string }[]>(() => [
    { id: 'summary', label: 'Resumen' },
    ...(this.isAuditor ? [{ id: 'workpapers' as Tab, label: 'Papeles de trabajo' }, { id: 'items' as Tab, label: 'Partidas' }] : []),
    { id: 'findings', label: 'Hallazgos' }, { id: 'report', label: 'Informe' },
  ]);

  protected readonly e = signal<Engagement | null>(null);
  protected readonly error = signal<unknown>(null);
  protected readonly busy = signal(false);
  protected readonly closed = computed(() => this.e()?.status === 'CLOSED');
  protected readonly next = computed(() => NEXT[this.e()?.status ?? ''] ?? []);

  constructor() {
    effect(() => { const id = this.id(); untracked(() => void this.load(id)); });
  }

  private async load(id: string): Promise<void> {
    try { this.e.set(await this.api.getP<Engagement>(`/auditing/engagements/${id}`)); } catch (err) { this.error.set(err); }
  }
  private async run(fn: () => Promise<unknown>, ok?: string): Promise<boolean> {
    this.busy.set(true); this.error.set(null);
    try { await fn(); if (ok) this.notify.ok(ok); this.busy.set(false); return true; } catch (err) { this.error.set(err); this.busy.set(false); return false; }
  }

  protected selectTab(t: Tab): void {
    this.tab.set(t);
    if (t === 'workpapers') void this.loadWorkpapers();
    if (t === 'items') void this.loadItems();
    if (t === 'findings') void this.loadFindings();
  }

  // ---------------- resumen
  protected async move(to: string): Promise<void> {
    let reason: string | null = null;
    if (to === 'IN_PROGRESS' && this.e()?.status !== 'PLANNED') {
      reason = await this.confirm.reason({ title: 'Reabrir el encargo', message: 'El motivo queda en la bitácora y en el informe.', confirmText: 'Reabrir', label: 'Motivo' });
      if (reason === null) return;
    }
    if (await this.run(() => firstValueFrom(this.api.post(`/auditing/engagements/${this.id()}/status`, { status: to, ...(reason ? { reason } : {}) })), 'Estado actualizado.')) await this.load(this.id());
  }
  protected async saveConclusion(text: string): Promise<void> {
    if (await this.run(() => firstValueFrom(this.api.patch(`/auditing/engagements/${this.id()}`, { overallConclusion: text })), 'Conclusión guardada.')) await this.load(this.id());
  }
  protected async remove(): Promise<void> {
    if (!(await this.confirm.ask({ title: 'Borrar el encargo', message: 'Solo se puede si todavía no tiene trabajo.', confirmText: 'Borrar', danger: true }))) return;
    if (await this.run(() => firstValueFrom(this.api.delete(`/auditing/engagements/${this.id()}`)), 'Encargo borrado.')) await this.router.navigateByUrl('/auditing');
  }

  // ---------------- papeles de trabajo
  protected readonly wps = signal<Workpaper[]>([]);
  private async loadWorkpapers(): Promise<void> {
    try { this.wps.set(await this.api.getP<Workpaper[]>(`/auditing/engagements/${this.id()}/workpapers`)); } catch (err) { this.error.set(err); }
  }
  protected async toggleProc(p: { id: string }, done: boolean): Promise<void> {
    if (await this.run(() => firstValueFrom(this.api.patch(`/auditing/procedures/${p.id}`, { done })))) await this.loadWorkpapers();
  }
  protected async procResult(p: { id: string; result: string | null }, result: string): Promise<void> {
    if (result === (p.result ?? '')) return;
    await this.run(() => firstValueFrom(this.api.patch(`/auditing/procedures/${p.id}`, { result })), 'Resultado guardado.');
  }
  protected async addProc(w: Workpaper, description: string): Promise<void> {
    if (!description.trim()) return;
    if (await this.run(() => firstValueFrom(this.api.post(`/auditing/workpapers/${w.id}/procedures`, { description })))) await this.loadWorkpapers();
  }
  protected async wpConclusion(w: Workpaper, conclusion: string): Promise<void> {
    if (conclusion === (w.conclusion ?? '')) return;
    await this.run(() => firstValueFrom(this.api.patch(`/auditing/workpapers/${w.id}`, { conclusion })), 'Conclusión del área guardada.');
  }
  protected async signOff(w: Workpaper, step: 'PREPARED' | 'REVIEWED'): Promise<void> {
    let warning: string | null = null;
    if (await this.run(async () => { const r = await firstValueFrom(this.api.post<{ warning: string | null }>(`/auditing/workpapers/${w.id}/sign-off`, { step })); warning = r.warning; },
      step === 'PREPARED' ? 'Marcado como preparado.' : 'Marcado como revisado.')) {
      if (warning) this.notify.error(warning);
      await this.loadWorkpapers();
    }
  }
  protected async upload(target: { workpaperId?: string; findingId?: string }, input: HTMLInputElement): Promise<void> {
    const f = input.files?.[0];
    if (!f) return;
    const fd: Record<string, string> = target.workpaperId ? { workpaperId: target.workpaperId } : { findingId: target.findingId! };
    if (await this.run(() => firstValueFrom(this.api.upload('/auditing/files', f, fd)), 'Archivo subido.')) {
      input.value = '';
      await (target.workpaperId ? this.loadWorkpapers() : this.loadFindings());
    }
  }

  // ---------------- partidas
  protected readonly entityType = signal('JOURNAL_ENTRY');
  protected readonly filter = signal('');
  protected readonly q = signal('');
  protected readonly page = signal(1);
  protected readonly items = signal<{ data: ReviewItem[]; total: number; reviewed: number } | null>(null);
  protected readonly history = signal<HistoryRow[] | null>(null);
  protected async loadItems(): Promise<void> {
    try {
      this.items.set(await this.api.getP(`/auditing/engagements/${this.id()}/items`, {
        entityType: this.entityType(), page: this.page(), limit: 50, ...(this.filter() ? { filter: this.filter() } : {}), ...(this.q().trim() ? { q: this.q().trim() } : {}),
      }));
    } catch (err) { this.error.set(err); }
  }
  protected async setMark(it: ReviewItem, mark: string): Promise<void> {
    if (!mark) {
      if (it.mark && (await this.run(() => firstValueFrom(this.api.delete(`/auditing/marks/${it.mark!.id}`))))) await this.loadItems();
      return;
    }
    if (await this.run(() => firstValueFrom(this.api.put(`/auditing/engagements/${this.id()}/marks`, { entityType: this.entityType(), entityId: it.id, mark })))) await this.loadItems();
  }
  protected async showHistory(it: ReviewItem): Promise<void> {
    try { this.history.set(await this.api.getP<HistoryRow[]>('/auditing/history', { entityType: this.entityType(), entityId: it.id })); } catch (err) { this.error.set(err); }
  }

  // ---------------- hallazgos
  protected readonly findings = signal<Finding[]>([]);
  protected readonly form = signal(emptyFinding());
  protected readonly formOpen = signal(false);
  protected readonly respondTo = signal<Finding | null>(null);
  protected readonly resp = signal({ managementResponse: '', actionPlan: '', responsible: '', dueDate: '' });
  private async loadFindings(): Promise<void> {
    try { this.findings.set(await this.api.getP<Finding[]>(`/auditing/engagements/${this.id()}/findings`)); } catch (err) { this.error.set(err); }
  }
  protected newFinding(): void { this.form.set(emptyFinding()); this.formOpen.set(true); }
  protected editFinding(f: Finding): void {
    this.form.set({ id: f.id, title: f.title, condition: f.condition, criteria: f.criteria ?? '', cause: f.cause ?? '', effect: f.effect ?? '', recommendation: f.recommendation ?? '', severity: f.severity ?? '', kind: f.kind, workpaperId: f.workpaperId ?? '' });
    this.formOpen.set(true);
  }
  protected patchForm(k: string, v: string): void { this.form.update((f) => ({ ...f, [k]: v })); }
  protected async saveFinding(): Promise<void> {
    const f = this.form();
    const body = {
      title: f.title.trim(), condition: f.condition.trim(), kind: f.kind,
      ...Object.fromEntries((['criteria', 'cause', 'effect', 'recommendation'] as const).map((k) => [k, f[k].trim()])),
      ...(f.severity ? { severity: f.severity } : {}), ...(f.workpaperId ? { workpaperId: f.workpaperId } : {}),
    };
    const ok = await this.run(() => firstValueFrom(f.id ? this.api.patch(`/auditing/findings/${f.id}`, body) : this.api.post(`/auditing/engagements/${this.id()}/findings`, body)), 'Hallazgo guardado.');
    if (ok) { this.formOpen.set(false); await this.loadFindings(); }
  }
  protected async act(f: Finding, what: 'communicate' | 'delete'): Promise<void> {
    if (what === 'delete') {
      if (!(await this.confirm.ask({ title: `Borrar ${f.code}`, message: 'Solo se borran borradores.', confirmText: 'Borrar', danger: true }))) return;
      if (await this.run(() => firstValueFrom(this.api.delete(`/auditing/findings/${f.id}`)), 'Hallazgo borrado.')) await this.loadFindings();
      return;
    }
    if (!(await this.confirm.ask({ title: `Comunicar ${f.code}`, message: 'Desde ahora la gerencia lo ve y puede responder.', confirmText: 'Comunicar' }))) return;
    if (await this.run(() => firstValueFrom(this.api.post(`/auditing/findings/${f.id}/communicate`, {})), 'Hallazgo comunicado.')) await this.loadFindings();
  }
  protected async closeFinding(f: Finding, status: 'RESOLVED' | 'RISK_ACCEPTED'): Promise<void> {
    const note = await this.confirm.reason({ title: status === 'RESOLVED' ? `Dar por resuelto ${f.code}` : `Riesgo aceptado en ${f.code}`, message: 'Escribe cómo se resolvió o por qué la gerencia acepta el riesgo.', confirmText: 'Cerrar hallazgo', label: 'Nota' });
    if (note === null) return;
    if (await this.run(() => firstValueFrom(this.api.post(`/auditing/findings/${f.id}/close`, { status, note })), 'Hallazgo cerrado.')) await this.loadFindings();
  }
  protected openRespond(f: Finding): void {
    this.respondTo.set(f);
    this.resp.set({ managementResponse: f.managementResponse ?? '', actionPlan: f.actionPlan ?? '', responsible: f.responsible ?? '', dueDate: f.dueDate?.slice(0, 10) ?? '' });
  }
  protected patchResp(k: string, v: string): void { this.resp.update((r) => ({ ...r, [k]: v })); }
  protected async sendResponse(): Promise<void> {
    const f = this.respondTo(); const r = this.resp();
    if (!f) return;
    const body = { managementResponse: r.managementResponse.trim(), ...(r.actionPlan.trim() ? { actionPlan: r.actionPlan.trim() } : {}), ...(r.responsible.trim() ? { responsible: r.responsible.trim() } : {}), ...(r.dueDate ? { dueDate: r.dueDate } : {}) };
    if (await this.run(() => firstValueFrom(this.api.post(`/auditing/findings/${f.id}/response`, body)), 'Respuesta enviada a la auditora.')) { this.respondTo.set(null); await this.loadFindings(); }
  }
}
