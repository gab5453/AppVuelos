import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { PersistentTable } from '../database/persistent-table.js';
import type { CheckInRecord } from '../entities/check-in/check-in.entity.js';

/**
 * Contexto de datos de la **base de datos `check-in`** (equivale a un DbContext). Dueño: dominio check-in.
 * Con `DATABASE_URL` sus tablas viven en PostgreSQL (esquema `check_in`); sin ella, en memoria. Los repositorios de
 * EcoAirlines.DataManagement no cambian: usan las tablas como un `Map`.
 */
@Injectable()
export class CheckInDataContext {
  /** Check-ins por reserva. */
  readonly checkIns: PersistentTable<CheckInRecord>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.checkIns = db.table<CheckInRecord>({ schema: 'check_in', name: 'check_ins' });
  }
}
