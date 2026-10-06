import { IsArray, IsIn, IsString, IsUrl } from 'class-validator';
import { WEBHOOK_EVENTS, type WebhookEvent } from '@ecoairlines/data-access/common/contract/webhook.types.js';

export { WEBHOOK_EVENTS, type WebhookEvent } from '@ecoairlines/data-access/common/contract/webhook.types.js';

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
