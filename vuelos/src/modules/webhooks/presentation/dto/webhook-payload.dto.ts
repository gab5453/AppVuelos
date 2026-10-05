/** Forma del payload saliente hacia la URL suscrita (callback flightEvent del contrato). */
export interface WebhookPayloadDto {
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
