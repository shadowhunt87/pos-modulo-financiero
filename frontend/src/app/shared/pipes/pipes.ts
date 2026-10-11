import { Pipe, PipeTransform } from '@angular/core';
import { fmtDate, fmtDateTime, money, Num, pct } from '../format';
import { label } from '../labels';

@Pipe({ name: 'money' })
export class MoneyPipe implements PipeTransform {
  transform(v: Num, blankZero: boolean | '' | 'blank' = false): string {
    return money(v, { blankZero: blankZero === true || blankZero === 'blank' });
  }
}
@Pipe({ name: 'pct' })
export class PctPipe implements PipeTransform {
  transform(v: Num, digits = 1): string { return pct(v, digits); }
}
@Pipe({ name: 'fdate' })
export class DatePipe implements PipeTransform {
  transform(v: string | Date | null | undefined): string { return fmtDate(v); }
}
@Pipe({ name: 'fdatetime' })
export class DateTimePipe implements PipeTransform {
  transform(v: string | Date | null | undefined): string { return fmtDateTime(v); }
}
/** {{ valor | lbl:MAPA }} → etiqueta en español del enum. */
@Pipe({ name: 'lbl' })
export class LabelPipe implements PipeTransform {
  transform(v: string | null | undefined, map: Record<string, string>): string { return label(map, v); }
}
/** Pone la clase de color según el signo: negativos en rojo. */
@Pipe({ name: 'signClass' })
export class SignClassPipe implements PipeTransform {
  transform(v: Num): string { return v !== null && v !== undefined && v !== '' && Number(v) < 0 ? 'neg' : ''; }
}
export const PIPES = [MoneyPipe, PctPipe, DatePipe, DateTimePipe, LabelPipe, SignClassPipe] as const;
