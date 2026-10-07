import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { PersistentTable } from '../database/persistent-table.js';
import type { FlightStatusOverride } from '../entities/flight-status/flight-status-override.entity.js';

/**
 * Contexto de datos de la **base de datos `flight-status`** (equivale a un DbContext). Dueño: dominio flight-status. Guarda los ajustes operativos que registra un administrador; el resto del
 * estado sale del GDS.
 * Con `DATABASE_URL` sus tablas viven en PostgreSQL (esquema `flight_status`); sin ella, en memoria. Los repositorios de
 * EcoAirlines.DataManagement no cambian: usan las tablas como un `Map`.
 */
@Injectable()
export class FlightStatusDataContext {
  /** Ajustes por `flightNumber|fecha`. */
  readonly overrides: PersistentTable<FlightStatusOverride>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.overrides = db.table<FlightStatusOverride>({ schema: 'flight_status', name: 'overrides' });
  }
}
