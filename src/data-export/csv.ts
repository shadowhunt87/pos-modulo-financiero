import { Prisma } from '../generated/prisma/client.js';
import { neutralize } from '../chart-of-accounts/chart-of-accounts.rules.js';

/**
 * CSV de la exportación (ANEXO-S0 §4.3): RFC 4180, UTF-8 con BOM, coma, CRLF. Decimal exacto (`toFixed()` sin argumentos,
 * nunca Number), fechas ISO, Json con JSON.stringify y textos protegidos contra fórmulas (`neutralize`).
 */
export const BOM = '﻿';

export function csvCell(v: unknown, json = false): string {
  if (v === null || v === undefined) return '';
  let s: string;
  if (json) s = JSON.stringify(v);
  else if (v instanceof Prisma.Decimal) s = v.toFixed();
  else if (v instanceof Date) s = v.toISOString();
  else if (typeof v === 'bigint' || typeof v === 'number' || typeof v === 'boolean') s = String(v);
  else if (Buffer.isBuffer(v)) s = v.toString('base64');
  else if (typeof v === 'string') { if (v === '') return '""'; s = neutralize(v); }
  else s = JSON.stringify(v);
  return /[",\r\n]/.test(s) || s.startsWith(' ') || s.endsWith(' ') ? `"${s.replace(/"/g, '""')}"` : s;
}

export const csvLine = (cells: string[]) => `${cells.join(',')}\r\n`;

/** Nombre seguro dentro del ZIP (§4.3): sin caracteres que invierten el texto, sin punto/espacio final, sin nombres reservados. */
export function zipSafeName(name: string): string {
  let n = name.replace(/[‪-‮⁦-⁩]/g, '').replace(/[.\s]+$/, '');
  const base = n.split('.')[0].toUpperCase();
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(base)) n = `_${n}`;
  return n || 'archivo';
}
