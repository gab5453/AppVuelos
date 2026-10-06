import type { FleetSchedule } from '@ecoairlines/data-access/external/gds/mock-gds.service.js';
import type { FleetAircraft, RouteDefinition } from '@ecoairlines/data-access/seed/timetable.js';

export const FLIGHT_OPERATIONS_GATEWAY = Symbol('FLIGHT_OPERATIONS_GATEWAY');

/** Vuelo programado en una fecha, con su ocupación según el inventario del GDS. */
export interface ScheduledFlightInfo {
  /** `segmentId` del GDS (vuelo + fecha local de salida). */
  flightId: string;
  flightNumber: string;
  origin: string;
  destination: string;
  /** Fecha local de salida (YYYY-MM-DD). */
  date: string;
  /** Salida programada en hora local con desfase (ISO 8601). */
  scheduledDeparture: string;
  totalSeats: number;
  availableSeats: number;
  /** Cupos tomados por clientes de EcoAirlines (holds vigentes y reservas). */
  reservedSeats: number;
  /** Pasajeros simulados de demostración (solo vuelos de la primera semana). */
  simulatedSeats: number;
}

/** Ruta de la red (sin sentido: `UIO ↔ GYE` agrupa ambos sentidos) y sus vuelos diarios. */
export interface RouteInfo {
  airports: [string, string];
  /** Nombre legible, p. ej. `Quito (UIO) ↔ Guayaquil (GYE)`, como en la plantilla del grupo. */
  label: string;
  dailyFlights: number;
}

/**
 * Gateway del dominio **admin** hacia el GDS: consultas operativas para el panel de administración (vuelos del día,
 * ocupación, rutas y rotación de la flota) y publicación del horario de rutas programadas. No reserva ni libera nada.
 */
export interface FlightOperationsGateway {
  flightsOn(localDate: string): Promise<ScheduledFlightInfo[]>;
  routes(): Promise<RouteInfo[]>;
  /** Rotación de cada avión de la flota en una fecha (qué vuelos opera, en orden). */
  fleetSchedule(localDate: string): Promise<FleetSchedule>;
  /** Último día con vuelos publicados (ventana de venta de 91 días). */
  salesWindowEnd(): Promise<string>;
  /** `segmentId` de un vuelo en una fecha local; `undefined` si el vuelo no existe. */
  segmentIdFor(flightNumber: string, date: string): Promise<string | undefined>;
  /**
   * Publica en el GDS el horario de estas rutas con la flota registrada. Si no se puede operar (un avión en dos lugares,
   * aviones insuficientes, números repetidos…) no cambia nada y devuelve los conflictos. Si se publica, devuelve los aviones
   * de cada ruta y la flota resultante (incluye los aviones nuevos que se agregaron solos).
   */
  publishRoutes(routes: readonly RouteDefinition[], fleet: readonly FleetAircraft[]): Promise<PublishResult>;
  /** Cupos tomados por clientes (holds y reservas) de hoy en adelante en un vuelo. */
  customerSeatsOn(flightNumber: string): Promise<number>;
}

export type PublishResult =
  | { ok: true; aircraftByRoute: Readonly<Record<string, readonly string[]>>; fleet: readonly FleetAircraft[] }
  | { ok: false; problems: string[] };
