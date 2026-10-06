import type { WebhookPayload } from '@ecoairlines/data-access/common/contract/webhook.types.js';
import type { WebhookSubscriptionRecord } from '@ecoairlines/data-access/entities/webhooks/webhook-subscription.entity.js';

export const WEBHOOK_DISPATCHER_GATEWAY = Symbol('WEBHOOK_DISPATCHER_GATEWAY');

/** Gateway para el envío saliente de eventos a las URLs suscritas. Sin integración real aún. */
export interface WebhookDispatcherGateway {
  dispatch(subscription: WebhookSubscriptionRecord, payload: WebhookPayload): Promise<void>;
}
