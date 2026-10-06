import { Injectable } from '@nestjs/common';
import type { BookingRecord } from '../entities/bookings/booking.entity.js';

/**
 * Contexto de datos de la **base de datos futura `bookings`** (equivale a un DbContext). Dueño: dominio bookings.
 * Hoy las tablas viven en memoria y se pierden al reiniciar; con PostgreSQL (V1.2) este contexto pasa a
 * ser la conexión a esa base de datos, sin cambiar los repositorios de EcoAirlines.DataManagement.
 */
@Injectable()
export class BookingsDataContext {
  readonly bookings = new Map<string, BookingRecord>();
}
