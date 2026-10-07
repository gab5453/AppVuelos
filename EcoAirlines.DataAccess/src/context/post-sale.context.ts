import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { reviveDates, type PersistentTable } from '../database/persistent-table.js';
import type { StoredQuote } from '../entities/post-sale/stored-quote.entity.js';

/**
 * Contexto de datos de la **base de datos `post-sale`** (equivale a un DbContext). Dueño: dominio post-sale.
 * Con `DATABASE_URL` sus tablas viven en PostgreSQL (esquema `post_sale`); sin ella, en memoria. Los repositorios de
 * EcoAirlines.DataManagement no cambian: usan las tablas como un `Map`.
 */
@Injectable()
export class PostSaleDataContext {
  readonly cancellationQuotes: PersistentTable<StoredQuote<unknown>>;
  readonly dateChangeOffers: PersistentTable<StoredQuote<unknown>>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.cancellationQuotes = db.table<StoredQuote<unknown>>({ schema: 'post_sale', name: 'cancellation_quotes', revive: reviveDates('expiresAt') });
    this.dateChangeOffers = db.table<StoredQuote<unknown>>({ schema: 'post_sale', name: 'date_change_offers', revive: reviveDates('expiresAt') });
  }
}
