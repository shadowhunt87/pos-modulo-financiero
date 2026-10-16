import { HttpErrorResponse } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Api } from '../../../core/api';
import type { Parked, PosCatalog, PosContext, PosCustomer, PosSale, PosShift, PosTicket } from './types';

/** Código de negocio de un error del POS ({ code, message }) o null. */
export function posErrorCode(e: unknown): string | null {
  return e instanceof HttpErrorResponse && e.error && typeof e.error === 'object' ? (e.error as { code?: string }).code ?? null : null;
}

/** Llamadas de la caja a /pos. */
@Injectable({ providedIn: 'root' })
export class PosApi {
  private readonly api = inject(Api);
  context() { return this.api.getP<PosContext>('/pos/context'); }
  catalog() { return this.api.getP<PosCatalog>('/pos/catalog'); }
  customers(q: string) { return this.api.getP<PosCustomer[]>('/pos/customers', { q }); }
  createCustomer(body: Record<string, unknown>) { return firstValueFrom(this.api.post<PosCustomer>('/pos/customers', body)); }
  currentShift(terminalId: string) { return this.api.getP<PosShift | null>('/pos/shifts/current', { terminalId }); }
  shift(id: string) { return this.api.getP<PosShift>(`/pos/shifts/${id}`); }
  openShift(terminalId: string, openingCash: number) { return firstValueFrom(this.api.post<PosShift>('/pos/shifts/open', { terminalId, openingCash })); }
  closeShift(id: string, body: Record<string, unknown>) { return firstValueFrom(this.api.post<PosShift>(`/pos/shifts/${id}/close`, body)); }
  movement(id: string, body: Record<string, unknown>) { return firstValueFrom(this.api.post<PosShift>(`/pos/shifts/${id}/movements`, body)); }
  drawer(id: string, body: Record<string, unknown>) { return firstValueFrom(this.api.post<{ ok: true }>(`/pos/shifts/${id}/drawer`, body)); }
  movementAccounts(terminalId: string) { return this.api.getP<{ id: string; code: string; name: string; type: string }[]>('/pos/movement-accounts', { terminalId }); }
  approve(body: { action: string; supervisorEmail: string; pin: string }) { return firstValueFrom(this.api.post<{ approvalId: string; approvedBy: string }>('/pos/approvals', body)); }
  sell(body: Record<string, unknown>) { return firstValueFrom(this.api.post<PosSale>('/pos/sales', body)); }
  sales(q: Record<string, string | number>) { return this.api.getP<{ data: PosSale[]; total: number }>('/pos/sales', q); }
  sale(id: string) { return this.api.getP<PosSale>(`/pos/sales/${id}`); }
  ticket(id: string) { return this.api.getP<PosTicket>(`/pos/sales/${id}/ticket`); }
  voidSale(id: string, body: Record<string, unknown>) { return firstValueFrom(this.api.post<PosSale>(`/pos/sales/${id}/void`, body)); }
  returnSale(id: string, body: Record<string, unknown>) { return firstValueFrom(this.api.post<PosSale>(`/pos/sales/${id}/returns`, body)); }
  parked(terminalId: string) { return this.api.getP<Parked[]>('/pos/parked', { terminalId }); }
  park(body: Record<string, unknown>) { return firstValueFrom(this.api.post<Parked>('/pos/parked', body)); }
  resume(id: string) { return firstValueFrom(this.api.post<Parked>(`/pos/parked/${id}/resume`, {})); }
  discard(id: string) { return firstValueFrom(this.api.delete<{ deleted: true }>(`/pos/parked/${id}`)); }
}
