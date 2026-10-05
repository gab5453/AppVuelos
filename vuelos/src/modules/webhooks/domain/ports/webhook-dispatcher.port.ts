import type { WebhookPayloadDto } from '../../presentation/dto/webhook-payload.dto.js';
import type { WebhookSubscriptionDto } from '../../presentation/dto/webhook-subscription.dto.js';

export const WEBHOOK_DISPATCHER_PORT = Symbol('WEBHOOK_DISPATCHER_PORT');

/** Puerto para el envío saliente de eventos a las URLs suscritas. Sin integración real aún. */
export interface WebhookDispatcherPort {
  dispatch(subscription: WebhookSubscriptionDto, payload: WebhookPayloadDto): Promise<void>;
}
