import type { WebhookPayload } from '@ecoairlines/data-access/common/contract/webhook.types.js';
import type { WebhookSubscriptionRecord } from '@ecoairlines/data-access/entities/webhooks/webhook-subscription.entity.js';

export const WEBHOOK_DISPATCHER_GATEWAY = Symbol('WEBHOOK_DISPATCHER_GATEWAY');

/** Resultado de entregar un evento a una URL suscrita. */
export interface DispatchResult {
  outcome: 'DELIVERED' | 'FAILED' | 'SIMULATED';
  /** Status HTTP de la última respuesta del suscriptor, si respondió. */
  httpStatus?: number;
  attempts: number;
  detail?: string;
}

/**
 * Gateway para el envío saliente de eventos a las URLs suscritas (callback `flightEvent` del contrato). La implementación
 * HTTP firma cada envío con el `secret` de la suscripción; la de registro solo lo anota (pruebas y entornos sin red).
 */
export interface WebhookDispatcherGateway {
  dispatch(subscription: WebhookSubscriptionRecord, payload: WebhookPayload): Promise<DispatchResult>;
}
