import type { QuoteStorePort, StoredQuote } from '../domain/ports/quote-store.port.js';

/** Conserva las cotizaciones vencidas 1 h más (para responder "expirada" en vez de "desconocida") y luego las purga. */
const RETENTION_AFTER_EXPIRY_MS = 3_600_000;

export class InMemoryQuoteStore<T> implements QuoteStorePort<T> {
  private readonly quotes = new Map<string, StoredQuote<T>>();

  async save(quote: StoredQuote<T>): Promise<void> {
    const now = Date.now();
    for (const [id, stored] of this.quotes) {
      if (stored.expiresAt.getTime() + RETENTION_AFTER_EXPIRY_MS < now) this.quotes.delete(id);
    }
    this.quotes.set(quote.id, quote);
  }

  async find(id: string): Promise<StoredQuote<T> | undefined> {
    return this.quotes.get(id);
  }

  async delete(id: string): Promise<void> {
    this.quotes.delete(id);
  }
}
