import { IsIn, IsOptional, Matches } from 'class-validator';
import type { BookingDetail } from '@ecoairlines/data-access/common/contract/booking.types.js';
import type { FlightOperationalStatus } from '@ecoairlines/data-access/common/contract/common.types.js';
import type { FleetSchedule } from '@ecoairlines/data-access/external/gds/mock-gds.service.js';
import { IsCalendarDate } from '../../validation/is-calendar-date.decorator.js';
import { IATA_CODE_PATTERN } from '../../validation/patterns.js';

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
  /** Extensión propia (no está en la plantilla): fecha local de salida del vuelo. */
  date: string;
  /** Extensión propia: cupos tomados por clientes de EcoAirlines (holds vigentes y reservas). */
  reservedSeats: number;
  /** Extensión propia: pasajeros simulados de demostración (solo vuelos de la primera semana). */
  simulatedSeats: number;
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

/**
 * Filtros de `GET /admin/flights` para observar las reservas por fecha, aeropuerto de origen o ruta (origen + destino).
 * Sin fecha, se usa hoy en Quito.
 */
export class AdminFlightsQueryDto {
  @IsOptional()
  @IsCalendarDate()
  date?: string;

  @IsOptional()
  @Matches(IATA_CODE_PATTERN)
  origin?: string;

  @IsOptional()
  @Matches(IATA_CODE_PATTERN)
  destination?: string;
}

/** Fecha local del vuelo; si se omite, hoy en el aeropuerto de origen (la plantilla no distingue fechas). */
export class AdminFlightQueryDto {
  @IsOptional()
  @IsCalendarDate()
  date?: string;
}

/**
 * Horario de la flota en una fecha (extensión propia, no está en la plantilla): cada avión con los vuelos que opera ese
 * día, en orden. Ningún avión aparece en dos vuelos a la vez.
 */
export type FleetScheduleDto = FleetSchedule;

/** Entrega de un evento a un consumidor (extensión propia: `GET /admin/events`). */
export interface EventDeliveryDto {
  consumer: string;
  target: string;
  outcome: 'DELIVERED' | 'FAILED' | 'SIMULATED';
  httpStatus?: number;
  attempts?: number;
  detail?: string;
}

/** Evento de dominio publicado en el bus interno, con sus entregas (sin el dueño de la reserva). */
export interface DomainEventDto {
  eventId: string;
  eventType: string;
  occurredAt: string;
  apiVersion: string;
  data: Record<string, unknown>;
  deliveries: EventDeliveryDto[];
}
