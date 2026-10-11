import { Matches } from 'class-validator';

export class DgiiPeriodQuery {
  /** Período a reportar: "2027-03" o "202703" */
  @Matches(/^\d{4}-?(0[1-9]|1[0-2])$/, { message: 'period debe ser AAAA-MM o AAAAMM, ej: 2027-03' })
  period!: string;
}