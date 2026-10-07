import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { PersistentTable } from '../database/persistent-table.js';
import type { BookingRecord } from '../entities/bookings/booking.entity.js';

/**
 * Contexto de datos de la **base de datos `bookings`** (equivale a un DbContext). Dueño: dominio bookings.
 * Con `DATABASE_URL` sus tablas viven en PostgreSQL (esquema `bookings`); sin ella, en memoria. Los repositorios de
 * EcoAirlines.DataManagement no cambian: usan las tablas como un `Map`.
 */
@Injectable()
export class BookingsDataContext {
  readonly bookings: PersistentTable<BookingRecord>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.bookings = db.table<BookingRecord>({ schema: 'bookings', name: 'bookings' });
  }
}
