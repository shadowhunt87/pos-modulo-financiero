import { Prisma } from '../generated/prisma/client.js';
import { AccountType } from '../generated/prisma/enums.js';

export type DecimalLike = Prisma.Decimal;

export const ZERO = new Prisma.Decimal(0);

/** Convierte null/undefined/number/string a Decimal (null -> 0). */
export const dec = (v?: Prisma.Decimal | number | string | null): Prisma.Decimal =>
  v === null || v === undefined ? ZERO : new Prisma.Decimal(v);

export const startOfDay = (s: string): Date => {
  const d = new Date(s);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

export const endOfDay = (s: string): Date => {
  const d = new Date(s);
  d.setUTCHours(23, 59, 59, 999);
  return d;
};

/** Naturaleza del saldo normal: Activo/Gasto = DEBIT; Pasivo/Patrimonio/Ingreso = CREDIT. */
export const natureOf = (type: AccountType): 'DEBIT' | 'CREDIT' =>
  type === AccountType.ASSET || type === AccountType.EXPENSE ? 'DEBIT' : 'CREDIT';

/** Recibe (débitos - créditos) y devuelve el saldo según la naturaleza de la cuenta. */
export const byNature = (type: AccountType, rawDebitMinusCredit: Prisma.Decimal): Prisma.Decimal =>
  natureOf(type) === 'DEBIT' ? rawDebitMinusCredit : rawDebitMinusCredit.neg();
