import { Injectable } from '@nestjs/common';
import { DatabaseService } from '../database/database.service.js';
import type { PersistentTable } from '../database/persistent-table.js';
import type { FleetAircraftRecord } from '../entities/admin/fleet-aircraft.entity.js';
import type { ScheduledRouteRecord } from '../entities/admin/scheduled-route.entity.js';
import { DEFAULT_FLEET, DEFAULT_ROUTES_WITH_AIRCRAFT } from '../seed/timetable.js';

/** Fecha de alta de la red base (fija, para que las respuestas sean reproducibles). */
const NETWORK_CREATED_AT = '2026-01-01T00:00:00.000Z';

/**
 * Contexto de datos de la **base de datos `schedule`** (equivale a un DbContext). Dueño: dominio admin. Guarda las rutas programadas y la flota. La primera vez se carga la red base (90
 * rutas con sus aviones fijos y 149 aviones, las mismas con las que arranca el GDS) y el administrador puede crear, editar o
 * dar de baja rutas y aviones.
 * Con `DATABASE_URL` sus tablas viven en PostgreSQL (esquema `schedule`); sin ella, en memoria. Los repositorios de
 * EcoAirlines.DataManagement no cambian: usan las tablas como un `Map`.
 */
@Injectable()
export class AdminDataContext {
  readonly routes: PersistentTable<ScheduledRouteRecord>;
  readonly aircraft: PersistentTable<FleetAircraftRecord>;

  constructor(db: DatabaseService = new DatabaseService()) {
    this.routes = db.table<ScheduledRouteRecord>({
      schema: 'schedule',
      name: 'routes',
      seed: () =>
        DEFAULT_ROUTES_WITH_AIRCRAFT.map((route) => [
          route.routeId,
          { ...route, source: 'NETWORK', createdAt: NETWORK_CREATED_AT, updatedAt: NETWORK_CREATED_AT },
        ]),
    });
    this.aircraft = db.table<FleetAircraftRecord>({
      schema: 'schedule',
      name: 'aircraft',
      seed: () =>
        DEFAULT_FLEET.map((aircraft) => [
          aircraft.registration,
          { ...aircraft, source: 'NETWORK', createdAt: NETWORK_CREATED_AT, updatedAt: NETWORK_CREATED_AT },
        ]),
    });
  }
}
