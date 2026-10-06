import type { FleetAircraftRecord } from '@ecoairlines/data-access/entities/admin/fleet-aircraft.entity.js';

export const AIRCRAFT_REPOSITORY = Symbol('AIRCRAFT_REPOSITORY');

/** Repositorio de la flota. **Base de datos futura: `schedule`** (tabla `aircraft`). Privado del dominio admin. */
export interface AircraftRepository {
  findAll(): Promise<FleetAircraftRecord[]>;
  findById(registration: string): Promise<FleetAircraftRecord | undefined>;
  save(aircraft: FleetAircraftRecord): Promise<FleetAircraftRecord>;
  delete(registration: string): Promise<void>;
}
