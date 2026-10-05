import { Injectable, Logger } from '@nestjs/common';
import type { WebhookDispatcherPort } from '../domain/ports/webhook-dispatcher.port.js';
import type { WebhookPayloadDto } from '../presentation/dto/webhook-payload.dto.js';
import type { WebhookSubscriptionDto } from '../presentation/dto/webhook-subscription.dto.js';

/** Adapter mock: registra el intento en lugar de hacer una llamada HTTP real. */
@Injectable()
export class NoopWebhookDispatcherAdapter implements WebhookDispatcherPort {
  private readonly logger = new Logger(NoopWebhookDispatcherAdapter.name);

  async dispatch(subscription: WebhookSubscriptionDto, payload: WebhookPayloadDto): Promise<void> {
    this.logger.debug(`(mock) dispatch ${payload.eventType} -> ${subscription.url}`);
  }
}
