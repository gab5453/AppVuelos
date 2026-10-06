/** Enum `WebhookSubscription.events` del contrato. */
export const WEBHOOK_EVENTS = [
  'booking.confirmed',
  'booking.failed',
  'booking.changed',
  'booking.cancelled',
  'booking.baggage_added',
  'hold.expired',
  'flight.schedule_changed',
  'flight.cancelled',
  'booking.ticket_issuing',
  'booking.ticket_issued',
  'booking.ticket_failed',
  'booking.checked_in',
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

/** Forma del payload saliente hacia la URL suscrita (callback flightEvent del contrato). */
export interface WebhookPayload {
  eventId?: string;
  eventType?: string;
  occurredAt?: string;
  apiVersion?: string;
  data?: {
    bookingId?: string;
    pnr?: string;
    status?: string;
    refundAmount?: string;
  };
}
