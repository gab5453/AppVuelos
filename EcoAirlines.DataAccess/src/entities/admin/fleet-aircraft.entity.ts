import type { FleetAircraft } from '../../seed/timetable.js';

/**
 * Avión de la flota de EcoAirlines (matrícula, tipo y base). **Base de datos futura: `schedule`, tabla `aircraft`.**
 * `NETWORK` = flota base; `ADMIN` = registrado por un administrador o agregado al crear una ruta.
 */
export interface FleetAircraftRecord extends FleetAircraft {
  source: 'NETWORK' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}
