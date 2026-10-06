import { Injectable } from '@nestjs/common';
import type { WebhookSubscriptionRecord } from '../entities/webhooks/webhook-subscription.entity.js';

/**
 * Contexto de datos de la **base de datos futura `webhooks`** (equivale a un DbContext). Dueño: dominio webhooks.
 * Hoy las tablas viven en memoria y se pierden al reiniciar; con PostgreSQL (V1.2) este contexto pasa a
 * ser la conexión a esa base de datos, sin cambiar los repositorios de EcoAirlines.DataManagement.
 */
@Injectable()
export class WebhooksDataContext {
  readonly subscriptions = new Map<string, WebhookSubscriptionRecord>();
}
