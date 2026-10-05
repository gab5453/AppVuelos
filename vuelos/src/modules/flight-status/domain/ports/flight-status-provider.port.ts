import type { FlightStatusDto } from '../../presentation/dto/flight-status.dto.js';

export const FLIGHT_STATUS_PROVIDER_PORT = Symbol('FLIGHT_STATUS_PROVIDER_PORT');

/** Puerto hacia el proveedor real de estado operativo (aerolínea/GDS). */
export interface FlightStatusProviderPort {
  getStatus(flightNumber: string, date: string): Promise<FlightStatusDto | undefined>;
}
