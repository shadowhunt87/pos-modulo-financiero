/**
 * ¿El mes de esta fecha ya se declaró a la DGII? (PLAN-v0.3 §4.2, N6)
 * Fase 1: se considera declarado si ya pasó el día límite del mes siguiente en hora de RD (UTC-4, sin horario de verano).
 * El día límite llega como dato (N5 lo toma de las obligaciones del calendario fiscal); 15 es el valor del plan para el 606/607/608.
 */
const RD_OFFSET_HOURS = 4;

export function declaredDeadline(issueDate: Date, dueDay = 15): Date {
  // Vence al final del día límite en RD = 00:00 del día siguiente en RD = 04:00 UTC
  return new Date(Date.UTC(issueDate.getUTCFullYear(), issueDate.getUTCMonth() + 1, dueDay + 1, RD_OFFSET_HOURS));
}

export function isMonthDeclared(issueDate: Date, now = new Date(), dueDay = 15): boolean {
  return now.getTime() >= declaredDeadline(issueDate, dueDay).getTime();
}
