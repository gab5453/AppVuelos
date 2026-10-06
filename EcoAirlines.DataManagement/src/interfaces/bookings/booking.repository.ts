import type { BookingRecord } from '@ecoairlines/data-access/entities/bookings/booking.entity.js';

export const BOOKING_REPOSITORY = Symbol('BOOKING_REPOSITORY');

/**
 * Repositorio de reservas. **Base de datos futura: `bookings`** (reserva, pasajeros, tickets, historial y
 * tarifas compradas). Es PRIVADO del dominio bookings: los demás dominios leen y modifican reservas solo a
 * través de `BookingsFacade` (EcoAirlines.Business).
 */
export interface BookingRepository {
  create(record: BookingRecord): Promise<BookingRecord>;
  findById(bookingId: string): Promise<BookingRecord | undefined>;
  findByPnr(pnr: string): Promise<BookingRecord | undefined>;
  findAllByOwner(ownerId: string): Promise<BookingRecord[]>;
  /** Todas las reservas (solo para los indicadores de administración). */
  findAll(): Promise<BookingRecord[]>;
  update(bookingId: string, patch: Partial<BookingRecord>): Promise<BookingRecord>;
}
