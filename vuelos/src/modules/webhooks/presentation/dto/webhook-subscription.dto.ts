import { IsArray, IsIn, IsString, IsUrl } from 'class-validator';

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

export class WebhookSubscriptionRequestDto {
  @IsUrl({ require_tld: false })
  url!: string;

  /** Sin `minItems` en el contrato: una suscripción sin eventos es válida (no recibirá notificaciones). */
  @IsArray()
  @IsIn(WEBHOOK_EVENTS, { each: true })
  events!: WebhookEvent[];

  @IsString()
  secret!: string;
}

export interface WebhookSubscriptionDto {
  id: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
}
