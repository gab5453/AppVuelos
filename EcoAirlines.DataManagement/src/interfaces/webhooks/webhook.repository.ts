import type { WebhookSubscriptionRecord } from '@ecoairlines/data-access/entities/webhooks/webhook-subscription.entity.js';

export const WEBHOOK_REPOSITORY = Symbol('WEBHOOK_REPOSITORY');

/** Repositorio de suscripciones. **Base de datos futura: `webhooks`**. Privado de webhooks. */
export interface WebhookRepository {
  findAllByOwner(ownerId: string): Promise<WebhookSubscriptionRecord[]>;
  /** Suscripciones a un tipo de evento (de un dueño, o de todos si se omite). */
  findSubscribers(eventType: string, ownerId?: string): Promise<WebhookSubscriptionRecord[]>;
  create(subscription: WebhookSubscriptionRecord): Promise<WebhookSubscriptionRecord>;
  /** Elimina la suscripción solo si pertenece a `ownerId`. */
  deleteByOwner(ownerId: string, id: string): Promise<void>;
}
