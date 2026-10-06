import { Injectable, Logger } from '@nestjs/common';
import type { WebhookPayload } from '@ecoairlines/data-access/common/contract/webhook.types.js';
import type { WebhookSubscriptionRecord } from '@ecoairlines/data-access/entities/webhooks/webhook-subscription.entity.js';
import type { DispatchResult, WebhookDispatcherGateway } from '../../interfaces/webhooks/webhook-dispatcher.gateway.js';

/** Despacho simulado (`WEBHOOK_DELIVERY=log`, por defecto en pruebas): registra el intento sin llamar a la URL. */
@Injectable()
export class NoopWebhookDispatcherGateway implements WebhookDispatcherGateway {
  private readonly logger = new Logger(NoopWebhookDispatcherGateway.name);

  async dispatch(subscription: WebhookSubscriptionRecord, payload: WebhookPayload): Promise<DispatchResult> {
    this.logger.debug(`(simulado) ${payload.eventType} -> ${subscription.url}`);
    return { outcome: 'SIMULATED', attempts: 0 };
  }
}
