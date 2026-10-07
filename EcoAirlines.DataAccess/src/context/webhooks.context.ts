import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { PersistentTable } from '../database/persistent-table.js';
import type { WebhookSubscriptionRecord } from '../entities/webhooks/webhook-subscription.entity.js';

/**
 * Contexto de datos de la **base de datos `webhooks`** (equivale a un DbContext). Dueño: dominio webhooks.
 * Con `DATABASE_URL` sus tablas viven en PostgreSQL (esquema `webhooks`); sin ella, en memoria. Los repositorios de
 * EcoAirlines.DataManagement no cambian: usan las tablas como un `Map`.
 */
@Injectable()
export class WebhooksDataContext {
  readonly subscriptions: PersistentTable<WebhookSubscriptionRecord>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.subscriptions = db.table<WebhookSubscriptionRecord>({ schema: 'webhooks', name: 'subscriptions' });
  }
}
