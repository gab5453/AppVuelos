import { Injectable } from '@nestjs/common';
import type {
  WebhookRepositoryPort,
  WebhookSubscriptionRecord,
} from '../domain/ports/webhook-repository.port.js';

@Injectable()
export class InMemoryWebhookRepository implements WebhookRepositoryPort {
  private readonly subscriptions = new Map<string, WebhookSubscriptionRecord>();

  async findAllByOwner(ownerId: string): Promise<WebhookSubscriptionRecord[]> {
    return [...this.subscriptions.values()].filter((subscription) => subscription.ownerId === ownerId);
  }

  async create(subscription: WebhookSubscriptionRecord): Promise<WebhookSubscriptionRecord> {
    this.subscriptions.set(subscription.id, subscription);
    return subscription;
  }

  async deleteByOwner(ownerId: string, id: string): Promise<void> {
    if (this.subscriptions.get(id)?.ownerId === ownerId) {
      this.subscriptions.delete(id);
    }
  }
}
