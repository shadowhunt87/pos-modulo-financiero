import { IsUUID } from 'class-validator';

export class PeriodCloseQuery {
  @IsUUID('all', { message: 'periodId debe ser el id de un período fiscal' }) periodId: string;
}
