import { IsIn, IsOptional } from 'class-validator';
import type { BookingDetail } from '@ecoairlines/data-access/common/contract/booking.types.js';
import type { FlightOperationalStatus } from '@ecoairlines/data-access/common/contract/common.types.js';
import { IsCalendarDate } from '../../validation/is-calendar-date.decorator.js';

/*
 * Administración — **extensión fuera del contrato**. Los nombres y tipos de los campos son los de la
 * plantilla del grupo de vuelos (`AdminDtos.cs`), para que coincidan al integrarse con el booking.
 */

/** `RouteStatDto` de la plantilla. */
export interface RouteStatDto {
  /** Ruta en ambos sentidos, p. ej. `Quito (UIO) ↔ Guayaquil (GYE)`. */
  route: string;
  flightsCount: number;
  bookingsCount: number;
  totalRevenue: number;
}

/** `FlightOccupancyDto` de la plantilla. */
export interface FlightOccupancyDto {
  /** `segmentId` del vuelo en esa fecha (p. ej. `EA300-20261025`). */
  flightId: string;
  flightNumber: string;
  /** `UIO ✈ BOG`, como en la plantilla. */
  route: string;
  /** Salida programada en hora local con desfase (ISO 8601). */
  scheduledDeparture: string;
  status: FlightOperationalStatus;
  totalSeats: number;
  bookedSeats: number;
  availableSeats: number;
  occupancyPercentage: number;
}

/** `AdminDashboardStatsDto` de la plantilla. */
export interface AdminDashboardStatsDto {
  totalBookings: number;
  confirmedBookings: number;
  cancelledBookings: number;
  totalPassengers: number;
  totalRevenue: number;
  totalFlightsToday: number;
  routeStats: RouteStatDto[];
  flightOccupancies: FlightOccupancyDto[];
  recentBookings: BookingDetail[];
}

export const FLIGHT_OPERATIONAL_STATUSES: readonly FlightOperationalStatus[] = [
  'SCHEDULED',
  'BOARDING',
  'DEPARTED',
  'DELAYED',
  'ARRIVED',
  'CANCELLED',
  'DIVERTED',
];

/** `UpdateFlightStatusRequest` de la plantilla, con los valores de `FlightOperationalStatus` del contrato. */
export class UpdateFlightStatusRequestDto {
  @IsIn(FLIGHT_OPERATIONAL_STATUSES)
  status!: FlightOperationalStatus;
}

/** Fecha local del vuelo; si se omite, hoy en el aeropuerto de origen (la plantilla no distingue fechas). */
export class AdminFlightQueryDto {
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}
