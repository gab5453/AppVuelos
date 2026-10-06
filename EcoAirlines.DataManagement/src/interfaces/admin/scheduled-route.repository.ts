import type { ScheduledRouteRecord } from '@ecoairlines/data-access/entities/admin/scheduled-route.entity.js';

export const SCHEDULED_ROUTE_REPOSITORY = Symbol('SCHEDULED_ROUTE_REPOSITORY');

/**
 * Repositorio de rutas programadas. **Base de datos futura: `schedule`** (tabla `scheduled_routes`). Privado del
 * dominio admin: la red de vuelos que ven los demás dominios sale del horario publicado en el GDS.
 */
export interface ScheduledRouteRepository {
  findAll(): Promise<ScheduledRouteRecord[]>;
  findById(routeId: string): Promise<ScheduledRouteRecord | undefined>;
  save(route: ScheduledRouteRecord): Promise<ScheduledRouteRecord>;
  delete(routeId: string): Promise<void>;
}
