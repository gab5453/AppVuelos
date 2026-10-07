import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { PersistentTable } from '../database/persistent-table.js';
import type { IdempotencyClaim } from '../entities/idempotency/idempotency.entity.js';

/**
 * Contexto de datos de la **base de datos `idempotency`** (equivale a un DbContext). Dueño: transversal (en microservicios, cada servicio tiene la suya).
 * Con `DATABASE_URL` sus tablas viven en PostgreSQL (esquema `idempotency`); sin ella, en memoria. Los repositorios de
 * EcoAirlines.DataManagement no cambian: usan las tablas como un `Map`.
 */
@Injectable()
export class IdempotencyDataContext {
  readonly claims: PersistentTable<IdempotencyClaim>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.claims = db.table<IdempotencyClaim>({
      schema: 'idempotency',
      name: 'claims',
      revive: (claim) => {
        if (claim.record && typeof claim.record.createdAt === 'string') claim.record.createdAt = new Date(claim.record.createdAt);
        return claim;
      },
    });
  }
}
