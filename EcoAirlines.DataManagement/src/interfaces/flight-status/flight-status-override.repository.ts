import type { FlightStatusOverride } from '@ecoairlines/data-access/entities/flight-status/flight-status-override.entity.js';

export const FLIGHT_STATUS_OVERRIDE_REPOSITORY = Symbol('FLIGHT_STATUS_OVERRIDE_REPOSITORY');

/** Repositorio de ajustes operativos de vuelos. **Base de datos futura: `flight-status`**. Privado de flight-status. */
export interface FlightStatusOverrideRepository {
  find(flightNumber: string, date: string): Promise<FlightStatusOverride | undefined>;
  save(override: FlightStatusOverride): Promise<FlightStatusOverride>;
}
