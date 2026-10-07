import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import { reviveDates, type PersistentTable } from '../database/persistent-table.js';
import type { HoldRecord } from '../entities/offers/hold.entity.js';

/**
 * Contexto de datos de la **base de datos `offers`** (equivale a un DbContext). Dueño: dominio offers.
 * Con `DATABASE_URL` sus tablas viven en PostgreSQL (esquema `offers`); sin ella, en memoria. Los repositorios de
 * EcoAirlines.DataManagement no cambian: usan las tablas como un `Map`.
 */
@Injectable()
export class OffersDataContext {
  readonly holds: PersistentTable<HoldRecord>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.holds = db.table<HoldRecord>({ schema: 'offers', name: 'holds', revive: reviveDates('createdAt', 'expiresAt') });
  }
}
