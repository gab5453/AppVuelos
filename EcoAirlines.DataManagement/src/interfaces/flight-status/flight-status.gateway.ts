import type { GdsFlightStatus } from '@ecoairlines/data-access/external/gds/mock-gds.service.js';

export const FLIGHT_STATUS_GATEWAY = Symbol('FLIGHT_STATUS_GATEWAY');

/** Gateway de **flight-status** hacia el proveedor de estado operativo (aerolínea/GDS). */
export interface FlightStatusGateway {
  getStatus(flightNumber: string, date: string): Promise<GdsFlightStatus | undefined>;
  /** Fecha local de hoy en el aeropuerto de origen del vuelo; `undefined` si el vuelo no existe. */
  localToday(flightNumber: string): Promise<string | undefined>;
}
