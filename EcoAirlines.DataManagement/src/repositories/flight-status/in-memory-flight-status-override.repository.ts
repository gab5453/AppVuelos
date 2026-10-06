import { Injectable } from '@nestjs/common';
import { FlightStatusDataContext } from '@ecoairlines/data-access/context/flight-status.context.js';
import type { FlightStatusOverride } from '@ecoairlines/data-access/entities/flight-status/flight-status-override.entity.js';
import type { FlightStatusOverrideRepository } from '../../interfaces/flight-status/flight-status-override.repository.js';

const key = (flightNumber: string, date: string) => `${flightNumber}|${date}`;

@Injectable()
export class InMemoryFlightStatusOverrideRepository implements FlightStatusOverrideRepository {
  constructor(private readonly db: FlightStatusDataContext) {}

  async find(flightNumber: string, date: string): Promise<FlightStatusOverride | undefined> {
    return this.db.overrides.get(key(flightNumber, date));
  }

  async save(override: FlightStatusOverride): Promise<FlightStatusOverride> {
    this.db.overrides.set(key(override.flightNumber, override.date), override);
    return override;
  }
}
