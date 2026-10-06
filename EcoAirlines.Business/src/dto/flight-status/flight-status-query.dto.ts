import { IsCalendarDate } from '../../validation/is-calendar-date.decorator.js';

export class FlightStatusQueryDto {
  @IsCalendarDate()
  date!: string;
}
