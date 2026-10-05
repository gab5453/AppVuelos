export const DATE_CHANGE_OFFER_STORE = Symbol('DATE_CHANGE_OFFER_STORE');
export const CANCELLATION_QUOTE_STORE = Symbol('CANCELLATION_QUOTE_STORE');

/** Cotización con vencimiento (oferta de cambio de fecha o cotización de cancelación). */
export interface StoredQuote<T> {
  id: string;
  bookingId: string;
  expiresAt: Date;
  payload: T;
}

/**
 * Puerto de almacenamiento de cotizaciones de cancelación y ofertas de cambio. **Base de datos futura:
 * `post-sale`**. Privado de post-sale. Hoy en memoria; reemplazar por DB o caché.
 */
export interface QuoteStorePort<T> {
  save(quote: StoredQuote<T>): Promise<void>;
  find(id: string): Promise<StoredQuote<T> | undefined>;
  delete(id: string): Promise<void>;
}
