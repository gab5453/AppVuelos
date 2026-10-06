import { Injectable } from '@nestjs/common';
import { AdminDataContext } from '@ecoairlines/data-access/context/admin.context.js';
import type { FleetAircraftRecord } from '@ecoairlines/data-access/entities/admin/fleet-aircraft.entity.js';
import type { AircraftRepository } from '../../interfaces/admin/aircraft.repository.js';

/** Flota en memoria, en orden de alta. */
@Injectable()
export class InMemoryAircraftRepository implements AircraftRepository {
  constructor(private readonly db: AdminDataContext) {}

  async findAll(): Promise<FleetAircraftRecord[]> {
    return [...this.db.aircraft.values()];
  }

  async findById(registration: string): Promise<FleetAircraftRecord | undefined> {
    return this.db.aircraft.get(registration);
  }

  async save(aircraft: FleetAircraftRecord): Promise<FleetAircraftRecord> {
    this.db.aircraft.set(aircraft.registration, aircraft);
    return aircraft;
  }

  async delete(registration: string): Promise<void> {
    this.db.aircraft.delete(registration);
  }
}
