import { IsCalendarDate } from '../../../../common/validation/is-calendar-date.decorator.js';

export class FlightStatusQueryDto {
  @IsCalendarDate()
  date!: string;
}
