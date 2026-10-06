import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import type { WebhookPayload } from '@ecoairlines/data-access/common/contract/webhook.types.js';
import type { WebhookSubscriptionRecord } from '@ecoairlines/data-access/entities/webhooks/webhook-subscription.entity.js';
import type { DispatchResult, WebhookDispatcherGateway } from '../../interfaces/webhooks/webhook-dispatcher.gateway.js';

const MAX_ATTEMPTS = 3;
const TIMEOUT_MS = 5_000;
const BACKOFF_MS = [0, 500, 2_000];

/** Firma `t=<unix>,v1=<hex>`: HMAC-SHA256 con el `secret` de la suscripción sobre `<unix>.<body>`. */
export function signWebhook(secret: string, timestamp: number, body: string): string {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.${body}`).digest('hex')}`;
}

/**
 * Entrega real de webhooks por HTTP POST (`WEBHOOK_DELIVERY=http`, por defecto fuera de pruebas).
 *
 * - **Firma:** cabecera `X-EcoAirlines-Signature` con HMAC-SHA256 del cuerpo y la marca de tiempo, usando el `secret` de la
 *   suscripción. El receptor recalcula la firma para comprobar que el evento viene de EcoAirlines y no fue alterado, y
 *   descarta marcas de tiempo viejas (repeticiones).
 * - **Cabeceras:** `X-EcoAirlines-Event` (tipo) y `X-EcoAirlines-Delivery` (`eventId`, para descartar duplicados).
 * - **Reintentos:** hasta 3 intentos (0 s, 0,5 s y 2 s) ante errores de red, 429 o 5xx; cada intento con 5 s de límite.
 *   Una respuesta 2xx es entrega; otra 4xx es rechazo definitivo.
 */
@Injectable()
export class HttpWebhookDispatcherGateway implements WebhookDispatcherGateway {
  private readonly logger = new Logger(HttpWebhookDispatcherGateway.name);

  async dispatch(subscription: WebhookSubscriptionRecord, payload: WebhookPayload): Promise<DispatchResult> {
    const body = JSON.stringify(payload);
    let last: DispatchResult = { outcome: 'FAILED', attempts: 0 };
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (BACKOFF_MS[attempt - 1]) await new Promise((resolve) => setTimeout(resolve, BACKOFF_MS[attempt - 1]).unref());
      const timestamp = Math.floor(Date.now() / 1000);
      try {
        const response = await fetch(subscription.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'EcoAirlines-Webhooks/1.0',
            'X-EcoAirlines-Event': payload.eventType ?? '',
            'X-EcoAirlines-Delivery': payload.eventId ?? '',
            'X-EcoAirlines-Signature': signWebhook(subscription.secret, timestamp, body),
          },
          body,
          redirect: 'manual',
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        await response.body?.cancel();
        if (response.ok) return { outcome: 'DELIVERED', httpStatus: response.status, attempts: attempt };
        last = { outcome: 'FAILED', httpStatus: response.status, attempts: attempt, detail: `HTTP ${response.status}` };
        if (response.status !== 429 && response.status < 500) break;
      } catch (error) {
        last = { outcome: 'FAILED', attempts: attempt, detail: error instanceof Error ? error.name : 'error de red' };
      }
    }
    this.logger.warn(`Webhook ${payload.eventType} a la suscripción ${subscription.id} no entregado: ${last.detail}`);
    return last;
  }
}
