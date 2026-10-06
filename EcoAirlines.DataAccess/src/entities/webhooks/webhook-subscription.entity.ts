import type { WebhookEvent } from '../../common/contract/webhook.types.js';

/**
 * Suscripción a webhooks. `ownerId` (sub del JWT) es interno y no forma parte de WebhookSubscription.
 * **Base de datos futura: `webhooks`.**
 */
export interface WebhookSubscriptionRecord {
  id: string;
  ownerId: string;
  url: string;
  events: WebhookEvent[];
  secret: string;
}
