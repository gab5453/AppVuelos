/**
 * Cotización con vencimiento: cotización de cancelación u oferta de cambio de fecha. El `payload` lo define
 * la lógica de negocio de post-sale. **Base de datos futura: `post-sale`.**
 */
export interface StoredQuote<T> {
  id: string;
  bookingId: string;
  expiresAt: Date;
  payload: T;
}
