import { Injectable } from '@nestjs/common';
import type { FleetAircraftRecord } from '../entities/admin/fleet-aircraft.entity.js';
import type { ScheduledRouteRecord } from '../entities/admin/scheduled-route.entity.js';
import { DEFAULT_FLEET, DEFAULT_ROUTES_WITH_AIRCRAFT } from '../seed/timetable.js';

/** Fecha de alta de la red base (fija, para que las respuestas sean reproducibles). */
const NETWORK_CREATED_AT = '2026-01-01T00:00:00.000Z';

/**
 * Contexto de datos de la **base de datos futura `schedule`** (equivale a un DbContext). Dueño: dominio admin.
 * Guarda las rutas programadas y la flota: al arrancar contiene la red base (90 rutas con sus aviones fijos y 149 aviones,
 * las mismas con las que arranca el GDS) y el administrador puede crear, editar o dar de baja rutas y aviones.
 */
@Injectable()
export class AdminDataContext {
  readonly routes = new Map<string, ScheduledRouteRecord>(
    DEFAULT_ROUTES_WITH_AIRCRAFT.map((route) => [
      route.routeId,
      { ...route, source: 'NETWORK', createdAt: NETWORK_CREATED_AT, updatedAt: NETWORK_CREATED_AT },
    ]),
  );

  readonly aircraft = new Map<string, FleetAircraftRecord>(
    DEFAULT_FLEET.map((aircraft) => [
      aircraft.registration,
      { ...aircraft, source: 'NETWORK', createdAt: NETWORK_CREATED_AT, updatedAt: NETWORK_CREATED_AT },
    ]),
  );
}
