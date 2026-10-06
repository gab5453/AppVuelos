import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { IsCalendarDate } from '../../validation/is-calendar-date.decorator.js';

export class ListBookingsQueryDto {
  @IsOptional()
  @IsString()
  pnr?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsCalendarDate()
  createdFrom?: string;

  @IsOptional()
  @IsCalendarDate()
  createdTo?: string;

  /** `maximum: 50`, `default: 10`. El contrato no define `minimum`; se exige ≥ 1 (HALL-14). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 10;

  @IsOptional()
  @IsString()
  cursor?: string;
}
