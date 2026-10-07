import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { PersistentTable } from '../database/persistent-table.js';
import type { CustomerProfileRecord } from '../entities/customers/customer-profile.entity.js';

/**
 * Contexto de datos de la **base de datos `customers`** (equivale a un DbContext). Dueño: dominio customers.
 * Con `DATABASE_URL` sus tablas viven en PostgreSQL (esquema `customers`); sin ella, en memoria. Los repositorios de
 * EcoAirlines.DataManagement no cambian: usan las tablas como un `Map`.
 */
@Injectable()
export class CustomersDataContext {
  /** Perfiles por `ownerId` (sub del JWT). */
  readonly profiles: PersistentTable<CustomerProfileRecord>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.profiles = db.table<CustomerProfileRecord>({ schema: 'customers', name: 'profiles' });
  }
}
