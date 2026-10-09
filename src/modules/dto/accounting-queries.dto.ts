import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  Max,
  Min,
} from 'class-validator';
import { JournalEntryStatus } from '../../generated/prisma/enums.js';

// Los query params llegan como string: "true"/"false" -> boolean
const toBool = ({ value }: { value: unknown }) =>
  value === 'true' ? true : value === 'false' ? false : value;

export class ListAccountsQuery {
  @IsOptional()
  @Transform(toBool)
  @IsBoolean()
  active?: boolean;
}

export class DateRangeQuery {
  // "2027-01-01"
  @IsOptional()
  @IsDateString()
  from?: string;

  // "2027-01-31" (inclusivo: hasta el final de ese día, UTC)
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ListJournalEntriesQuery extends DateRangeQuery {
  @IsOptional()
  @IsEnum(JournalEntryStatus)
  status?: JournalEntryStatus;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
