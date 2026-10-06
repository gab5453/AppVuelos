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
}

/** Ruta de la red (sin sentido: `UIO ↔ GYE` agrupa ambos sentidos) y sus vuelos diarios. */
export interface RouteInfo {
  airports: [string, string];
  /** Nombre legible, p. ej. `Quito (UIO) ↔ Guayaquil (GYE)`, como en la plantilla del grupo. */
  label: string;
  dailyFlights: number;
}

/**
 * Gateway del dominio **admin** hacia el GDS: consultas operativas de solo lectura para el panel de
 * administración (vuelos del día, ocupación y rutas). No reserva ni libera nada.
 */
export interface FlightOperationsGateway {
  flightsOn(localDate: string): Promise<ScheduledFlightInfo[]>;
  routes(): Promise<RouteInfo[]>;
  /** `segmentId` de un vuelo en una fecha local; `undefined` si el vuelo no existe. */
  segmentIdFor(flightNumber: string, date: string): Promise<string | undefined>;
}
