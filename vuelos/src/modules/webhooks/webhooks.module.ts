import { Module } from '@nestjs/common';
import { WebhooksController } from './presentation/webhooks.controller.js';
import { WebhooksService } from './application/webhooks.service.js';
import { WEBHOOK_REPOSITORY_PORT } from './domain/ports/webhook-repository.port.js';
import { InMemoryWebhookRepository } from './infrastructure/in-memory-webhook.repository.js';
import { WEBHOOK_DISPATCHER_PORT } from './domain/ports/webhook-dispatcher.port.js';
import { NoopWebhookDispatcherAdapter } from './infrastructure/noop-webhook-dispatcher.adapter.js';
import { WEBHOOK_URL_POLICY, WebhookUrlPolicy } from './domain/webhook-url-policy.js';

@Module({
  controllers: [WebhooksController],
  providers: [
    WebhooksService,
    { provide: WEBHOOK_REPOSITORY_PORT, useClass: InMemoryWebhookRepository },
    { provide: WEBHOOK_DISPATCHER_PORT, useClass: NoopWebhookDispatcherAdapter },
    {
      provide: WEBHOOK_URL_POLICY,
      useFactory: () => new WebhookUrlPolicy(process.env.NODE_ENV === 'production'),
    },
  ],
})
export class WebhooksModule {}
