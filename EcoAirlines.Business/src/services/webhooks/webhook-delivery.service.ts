import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import type { WebhookPayload } from '@ecoairlines/data-access/common/contract/webhook.types.js';
import {
  WEBHOOK_DISPATCHER_GATEWAY,
  type WebhookDispatcherGateway,
} from '@ecoairlines/data-management/interfaces/webhooks/webhook-dispatcher.gateway.js';
import { WEBHOOK_REPOSITORY, type WebhookRepository } from '@ecoairlines/data-management/interfaces/webhooks/webhook.repository.js';
import { DomainEventBus, type DomainEvent, type EventDelivery } from '../../common/events/domain-event-bus.js';
import { WEBHOOK_URL_POLICY, WebhookUrlPolicy } from '../../rules/webhooks/webhook-url-policy.js';

/**
 * Consumidor del bus de eventos que **entrega los webhooks** (callback `flightEvent` del contrato).
 * - Eventos `booking.*`: solo a las suscripciones del dueño de la reserva.
 * - Eventos `flight.*`: a todos los suscriptores de ese evento (son públicos: estado e itinerario de un vuelo).
 * Antes de cada envío se repite la política anti-SSRF (en producción), por si el DNS del host cambió desde el registro.
 */
@Injectable()
export class WebhookDeliveryService implements OnModuleInit {
  constructor(
    private readonly bus: DomainEventBus,
    @Inject(WEBHOOK_REPOSITORY) private readonly subscriptions: WebhookRepository,
    @Inject(WEBHOOK_DISPATCHER_GATEWAY) private readonly dispatcher: WebhookDispatcherGateway,
    @Inject(WEBHOOK_URL_POLICY) private readonly urlPolicy: WebhookUrlPolicy,
  ) {}

  onModuleInit(): void {
    this.bus.subscribe('webhooks', (event) => this.deliver(event));
  }

  async deliver(event: DomainEvent): Promise<EventDelivery[]> {
    const ownerId = event.eventType.startsWith('booking.') ? event.ownerId : undefined;
    if (event.eventType.startsWith('booking.') && !ownerId) return [];
    const targets = await this.subscriptions.findSubscribers(event.eventType, ownerId);
    const payload: WebhookPayload = {
      eventId: event.eventId,
      eventType: event.eventType,
      occurredAt: event.occurredAt,
      apiVersion: event.apiVersion,
      data: event.data as WebhookPayload['data'],
    };

    return Promise.all(
      targets.map(async (subscription): Promise<EventDelivery> => {
        const target = `webhook ${subscription.id}`;
        try {
          await this.urlPolicy.assertAllowed(subscription.url);
        } catch {
          return { consumer: 'webhooks', target, outcome: 'FAILED', attempts: 0, detail: 'URL no permitida' };
        }
        const result = await this.dispatcher.dispatch(subscription, payload);
        return { consumer: 'webhooks', target, ...result };
      }),
    );
  }
}
