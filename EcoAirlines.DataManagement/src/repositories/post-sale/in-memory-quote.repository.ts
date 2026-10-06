import type { StoredQuote } from '@ecoairlines/data-access/entities/post-sale/stored-quote.entity.js';
import type { QuoteRepository } from '../../interfaces/post-sale/quote.repository.js';

/** Conserva las cotizaciones vencidas 1 h más (para responder "expirada" en vez de "desconocida") y luego las purga. */
const RETENTION_AFTER_EXPIRY_MS = 3_600_000;

/**
 * Repositorio de cotizaciones sobre una tabla del contexto `post-sale` (cotizaciones de cancelación u
 * ofertas de cambio de fecha; ver `DataManagementModule`).
 */
export class InMemoryQuoteRepository<T> implements QuoteRepository<T> {
  constructor(private readonly table: Map<string, StoredQuote<unknown>>) {}

  async save(quote: StoredQuote<T>): Promise<void> {
    const now = Date.now();
    for (const [id, stored] of this.table) {
      if (stored.expiresAt.getTime() + RETENTION_AFTER_EXPIRY_MS < now) this.table.delete(id);
    }
    this.table.set(quote.id, quote);
  }

  async find(id: string): Promise<StoredQuote<T> | undefined> {
    return this.table.get(id) as StoredQuote<T> | undefined;
  }

  async delete(id: string): Promise<void> {
    this.table.delete(id);
  }
}
