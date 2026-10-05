import type { ItineraryOption, MoneyAmount, PassengerItem, Ticket } from './common.types.js';

// BookingDetail es devuelto tanto por el dominio bookings (creación/consulta) como por
// post-sale (confirmación de cambio de fecha), de ahí su ubicación en el tipo compartido.

export type BookingStatus =
  | 'PENDING'
  | 'PENDING_PAYMENT'
  | 'TICKET_ISSUING'
  | 'CONFIRMED'
  | 'FAILED'
  | 'CHANGE_PENDING'
  | 'CANCELLATION_PENDING'
  | 'CANCELLED';

export interface BookingChange {
  changedAt: string;
  description?: string;
}

export interface BookingDetail {
  bookingId: string;
  pnr: string;
  status: BookingStatus;
  grandTotal: MoneyAmount;
  createdAt: string;
  updatedAt?: string;
  itineraries?: ItineraryOption[];
  passengers?: PassengerItem[];
  tickets?: Ticket[];
  changes?: BookingChange[];
}
