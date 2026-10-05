import type { WebhookSubscriptionDto } from '../../presentation/dto/webhook-subscription.dto.js';

export const WEBHOOK_REPOSITORY_PORT = Symbol('WEBHOOK_REPOSITORY_PORT');

/** Suscripción persistida. `ownerId` (sub del JWT) es interno y no forma parte de WebhookSubscription. */
export interface WebhookSubscriptionRecord extends WebhookSubscriptionDto {
  ownerId: string;
}

export interface WebhookRepositoryPort {
  findAllByOwner(ownerId: string): Promise<WebhookSubscriptionRecord[]>;
  create(subscription: WebhookSubscriptionRecord): Promise<WebhookSubscriptionRecord>;
  /** Elimina la suscripción solo si pertenece a `ownerId`. */
  deleteByOwner(ownerId: string, id: string): Promise<void>;
}
