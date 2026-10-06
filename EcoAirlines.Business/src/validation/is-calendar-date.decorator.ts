import { ValidateBy, type ValidationOptions } from 'class-validator';
import { isCalendarDate } from '@ecoairlines/data-access/common/calendar-date.js';

/**
 * `format: date` del contrato (RFC 3339 full-date): `YYYY-MM-DD` que además exista en el
 * calendario. Una regex sola aceptaría `2026-02-31` o `2026-13-45`.
 */
export function IsCalendarDate(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isCalendarDate',
      validator: {
        validate: (value: unknown) => typeof value === 'string' && isCalendarDate(value),
        defaultMessage: (args) => `${args?.property} must be a valid calendar date (YYYY-MM-DD)`,
      },
    },
    options,
  );
}
