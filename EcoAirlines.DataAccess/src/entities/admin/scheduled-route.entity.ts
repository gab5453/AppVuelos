import type { RouteDefinition } from '../../seed/timetable.js';

/** Origen de una ruta: la red base generada automáticamente o una creada por un administrador. */
export type ScheduledRouteSource = 'NETWORK' | 'ADMIN';

/**
 * Ruta programada de la aerolínea (línea de ida y vuelta con sus días y tipo de avión). **Base de datos futura:
 * `schedule`, tabla `scheduled_routes`.** Es la fuente del horario que se publica en el GDS.
 */
export interface ScheduledRouteRecord extends RouteDefinition {
  source: ScheduledRouteSource;
  createdAt: string;
  updatedAt: string;
  /** `sub` del administrador que hizo el último cambio (las rutas de la red base no tienen). */
  updatedBy?: string;
}
