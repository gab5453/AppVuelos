import type { StoredQuote } from '@ecoairlines/data-access/entities/post-sale/stored-quote.entity.js';

export const DATE_CHANGE_OFFER_REPOSITORY = Symbol('DATE_CHANGE_OFFER_REPOSITORY');
export const CANCELLATION_QUOTE_REPOSITORY = Symbol('CANCELLATION_QUOTE_REPOSITORY');

/**
 * Repositorio de cotizaciones de cancelación y ofertas de cambio. **Base de datos futura: `post-sale`**.
 * Privado de post-sale.
 */
export interface QuoteRepository<T> {
  save(quote: StoredQuote<T>): Promise<void>;
  find(id: string): Promise<StoredQuote<T> | undefined>;
  delete(id: string): Promise<void>;
}
