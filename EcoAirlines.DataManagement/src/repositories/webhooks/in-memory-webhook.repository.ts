import { Injectable } from '@nestjs/common';
import { WebhooksDataContext } from '@ecoairlines/data-access/context/webhooks.context.js';
import type { WebhookSubscriptionRecord } from '@ecoairlines/data-access/entities/webhooks/webhook-subscription.entity.js';
import type { WebhookRepository } from '../../interfaces/webhooks/webhook.repository.js';

@Injectable()
export class InMemoryWebhookRepository implements WebhookRepository {
  constructor(private readonly db: WebhooksDataContext) {}

  async findAllByOwner(ownerId: string): Promise<WebhookSubscriptionRecord[]> {
    return [...this.db.subscriptions.values()].filter((subscription) => subscription.ownerId === ownerId);
  }

  async findSubscribers(eventType: string, ownerId?: string): Promise<WebhookSubscriptionRecord[]> {
    return [...this.db.subscriptions.values()].filter(
      (subscription) => subscription.events.includes(eventType as never) && (ownerId === undefined || subscription.ownerId === ownerId),
    );
  }

  async create(subscription: WebhookSubscriptionRecord): Promise<WebhookSubscriptionRecord> {
    this.db.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async deleteByOwner(ownerId: string, id: string): Promise<void> {
    if (this.db.subscriptions.get(id)?.ownerId === ownerId) {
      this.db.subscriptions.delete(id);
    }
  }
}
