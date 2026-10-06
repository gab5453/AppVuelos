import { Injectable, Logger } from '@nestjs/common';
import type { WebhookPayload } from '@ecoairlines/data-access/common/contract/webhook.types.js';
import type { WebhookSubscriptionRecord } from '@ecoairlines/data-access/entities/webhooks/webhook-subscription.entity.js';
import type { WebhookDispatcherGateway } from '../../interfaces/webhooks/webhook-dispatcher.gateway.js';

/** Gateway mock: registra el intento en lugar de hacer una llamada HTTP real. */
@Injectable()
export class NoopWebhookDispatcherGateway implements WebhookDispatcherGateway {
  private readonly logger = new Logger(NoopWebhookDispatcherGateway.name);

  async dispatch(subscription: WebhookSubscriptionRecord, payload: WebhookPayload): Promise<void> {
    this.logger.debug(`(mock) dispatch ${payload.eventType} -> ${subscription.url}`);
  }
}
