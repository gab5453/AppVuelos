export const PROBLEM_DETAILS_CODES = [
  'VALIDATION_FAILED',
  'SEAT_TAKEN',
  'AMOUNT_MISMATCH',
  'BOOKING_NOT_CONFIRMED',
  'BAGGAGE_LIMIT_EXCEEDED',
  'CUTOFF_PASSED',
  'FARE_NOT_CHANGEABLE',
  'FLIGHT_ALREADY_DEPARTED',
  'CHANGE_OFFER_EXPIRED',
  'OFFER_NO_LONGER_AVAILABLE',
  'QUOTE_EXPIRED',
  'ALREADY_CANCELLED',
  'RATE_LIMIT_EXCEEDED',
  'INFANT_SEAT_NOT_ALLOWED',
  'PAYMENT_REFERENCE_INVALID',
  'PAYMENT_NOT_AUTHORIZED',
  'PNR_CREATION_FAILED',
  'TICKET_ISSUANCE_FAILED',
  'TICKET_ALREADY_ISSUED',
  'CHECK_IN_NOT_AVAILABLE',
  'CHECK_IN_FAILED',
  'BOARDING_PASS_NOT_AVAILABLE',
  'SEAT_CABIN_MISMATCH',
  'FLIGHT_STATUS_NOT_AVAILABLE',
] as const;

export type ProblemDetailsCode = (typeof PROBLEM_DETAILS_CODES)[number];

export interface ProblemDetailsInvalidParam {
  name?: string;
  reason?: string;
}

export interface ProblemDetailsBody {
  type: string;
  title: string;
  status: number;
  detail?: string;
  code: ProblemDetailsCode;
  invalidParams?: ProblemDetailsInvalidParam[];
}
